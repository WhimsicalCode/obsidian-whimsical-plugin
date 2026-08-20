import { describe, expect, it } from "vitest";
import { findStandaloneWhimsicalLinks } from "../src/markdown-links";

function parseBody(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body;
}

describe("findStandaloneWhimsicalLinks", () => {
  it("accepts a paragraph containing only a Whimsical link", () => {
    const root = parseBody(
      '<p><a href="https://whimsical.com/board-Ku85wgQn9LwYVnqirzaBoJ">Board</a></p>',
    );
    const paragraph = root.querySelector("p") as HTMLParagraphElement;

    const result = findStandaloneWhimsicalLinks(root);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      paragraph,
      origin: "https://whimsical.com",
      slug: "board-Ku85wgQn9LwYVnqirzaBoJ",
    });
  });

  it("accepts a paragraph with whitespace padding around the anchor", () => {
    const root = parseBody(
      '<p>\n  <a href="https://whimsical.com/board-Ku85wgQn9LwYVnqirzaBoJ">Board</a>\n</p>',
    );
    const paragraph = root.querySelector("p") as HTMLParagraphElement;

    const result = findStandaloneWhimsicalLinks(root);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      paragraph,
      origin: "https://whimsical.com",
      slug: "board-Ku85wgQn9LwYVnqirzaBoJ",
    });
  });

  it("rejects an inline link with surrounding text", () => {
    const root = parseBody(
      '<p>See <a href="https://whimsical.com/board-Ku85wgQn9LwYVnqirzaBoJ">the board</a>.</p>',
    );

    expect(findStandaloneWhimsicalLinks(root)).toEqual([]);
  });

  it("rejects a link on a non-Whimsical host", () => {
    const root = parseBody(
      '<p><a href="https://example.com/board-Ku85wgQn9LwYVnqirzaBoJ">Not Whimsical</a></p>',
    );

    expect(findStandaloneWhimsicalLinks(root)).toEqual([]);
  });

  it("rejects a template landing page link", () => {
    const root = parseBody(
      '<p><a href="https://whimsical.com/templates/affinity-diagram">Template landing page</a></p>',
    );

    expect(findStandaloneWhimsicalLinks(root)).toEqual([]);
  });

  it("rejects a link inside a list item", () => {
    const root = parseBody(
      '<ul><li><a href="https://whimsical.com/board-Ku85wgQn9LwYVnqirzaBoJ">List link</a></li></ul>',
    );

    expect(findStandaloneWhimsicalLinks(root)).toEqual([]);
  });

  it("rejects a paragraph where the link has an element sibling", () => {
    const root = parseBody(
      '<p><a href="https://whimsical.com/board-Ku85wgQn9LwYVnqirzaBoJ">Board</a><strong>x</strong></p>',
    );

    expect(findStandaloneWhimsicalLinks(root)).toEqual([]);
  });

  it("rejects a paragraph where the link has a non-whitespace text sibling", () => {
    const root = parseBody(
      '<p><a href="https://whimsical.com/board-Ku85wgQn9LwYVnqirzaBoJ">Board</a> not alone</p>',
    );

    expect(findStandaloneWhimsicalLinks(root)).toEqual([]);
  });

  it("returns two candidates for two separate standalone paragraphs, each with its own slug and paragraph", () => {
    const root = parseBody(
      '<p><a href="https://whimsical.com/board-Ku85wgQn9LwYVnqirzaBoJ">Board one</a></p>' +
        '<p><a href="https://whimsical.com/flowchart-8gd2Nn4qYVy6xrTAoWn12x">Board two</a></p>',
    );
    const paragraphs = root.querySelectorAll("p");
    const firstParagraph = paragraphs[0] as HTMLParagraphElement;
    const secondParagraph = paragraphs[1] as HTMLParagraphElement;

    const result = findStandaloneWhimsicalLinks(root);

    expect(result).toHaveLength(2);
    expect(result).toEqual([
      {
        paragraph: firstParagraph,
        origin: "https://whimsical.com",
        slug: "board-Ku85wgQn9LwYVnqirzaBoJ",
      },
      {
        paragraph: secondParagraph,
        origin: "https://whimsical.com",
        slug: "flowchart-8gd2Nn4qYVy6xrTAoWn12x",
      },
    ]);
  });

  it("does not mutate the DOM", () => {
    const html =
      '<p><a href="https://whimsical.com/board-Ku85wgQn9LwYVnqirzaBoJ">Board</a></p>';
    const root = parseBody(html);
    const beforeHtml = root.innerHTML;

    findStandaloneWhimsicalLinks(root);

    expect(root.innerHTML).toBe(beforeHtml);
  });
});
