import { beforeEach, describe, expect, it } from "vitest";
import { EditorSelection, EditorState, Text } from "@codemirror/state";
import { EditorView, type Decoration } from "@codemirror/view";
import {
  findEmbedLines,
  whimsicalEditorExtension,
  WhimsicalEmbedWidget,
  type EmbedViewRegistry,
} from "../src/editor-embeds";
import type { EmbedView } from "../src/embed-view";
import { editorLivePreviewField, setLivePreview } from "./stubs/obsidian";

const SLUG = "board-Ku85wgQn9LwYVnqirzaBoJ";
const ORIGIN = "https://whimsical.com";
const URL_ONE = `${ORIGIN}/${SLUG}`;
const SLUG_TWO = "flowchart-A1b2C3d4E5f6G7h8J9k2Lm";
const URL_TWO = `${ORIGIN}/${SLUG_TWO}`;

beforeEach(() => {
  document.body.className = "theme-light";
  document.body.innerHTML = "";
});

function docOf(...lines: string[]): Text {
  return Text.of(lines);
}

function trackingRegistry(): {
  registry: EmbedViewRegistry;
  added: EmbedView[];
  deleted: EmbedView[];
} {
  const added: EmbedView[] = [];
  const deleted: EmbedView[] = [];
  return {
    registry: {
      add(view: EmbedView): void {
        added.push(view);
      },
      delete(view: EmbedView): void {
        deleted.push(view);
      },
    },
    added,
    deleted,
  };
}

function makeState(
  lines: string[],
  options?: { cursor?: number; registry?: EmbedViewRegistry },
): EditorState {
  const registry = options?.registry ?? trackingRegistry().registry;
  return EditorState.create({
    doc: lines.join("\n"),
    selection: EditorSelection.cursor(options?.cursor ?? 0),
    // Obsidian registers editorLivePreviewField in every real editor; the
    // extension under test reads it rather than providing it.
    extensions: [editorLivePreviewField, whimsicalEditorExtension(registry)],
  });
}

interface FoundDecoration {
  from: number;
  to: number;
  value: Decoration;
}

function embedDecorations(state: EditorState): FoundDecoration[] {
  const provided = state.facet(EditorView.decorations);
  const found: FoundDecoration[] = [];
  for (const entry of provided) {
    if (typeof entry === "function") {
      continue;
    }
    const iter = entry.iter();
    while (iter.value !== null) {
      found.push({ from: iter.from, to: iter.to, value: iter.value });
      iter.next();
    }
  }
  return found;
}

/** A stand-in for the only part of EditorView the widget touches. */
function fakeView(): EditorView {
  const dom = document.body.createDiv();
  return { dom } as unknown as EditorView;
}

describe("findEmbedLines", () => {
  it("finds a bare Whimsical URL on its own line", () => {
    const doc = docOf("intro", URL_ONE);

    const lines = findEmbedLines(doc);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      from: doc.line(2).from,
      to: doc.line(2).to,
      origin: ORIGIN,
      slug: SLUG,
    });
  });

  it("finds a standalone markdown link line", () => {
    const doc = docOf(`[Board](${URL_ONE})`);

    const lines = findEmbedLines(doc);

    expect(lines).toHaveLength(1);
    expect(lines[0]?.slug).toBe(SLUG);
  });

  it("finds a standalone autolink line", () => {
    const doc = docOf(`<${URL_ONE}>`);

    expect(findEmbedLines(doc)).toHaveLength(1);
  });

  it("allows trailing whitespace and up to three leading spaces", () => {
    const doc = docOf(`   ${URL_ONE}  `);

    expect(findEmbedLines(doc)).toHaveLength(1);
  });

  it("finds each of two standalone links on separate lines", () => {
    const doc = docOf(URL_ONE, "", URL_TWO);

    const lines = findEmbedLines(doc);

    expect(lines.map((line) => line.slug)).toEqual([SLUG, SLUG_TWO]);
  });

  it("ignores four-space-indented lines (indented code blocks)", () => {
    expect(findEmbedLines(docOf(`    ${URL_ONE}`))).toHaveLength(0);
  });

  it("ignores links with surrounding text", () => {
    expect(findEmbedLines(docOf(`See ${URL_ONE} here`))).toHaveLength(0);
    expect(findEmbedLines(docOf(`[a](${URL_ONE}) trailing`))).toHaveLength(0);
  });

  it("ignores list items, quotes, headings, and images", () => {
    expect(findEmbedLines(docOf(`- ${URL_ONE}`))).toHaveLength(0);
    expect(findEmbedLines(docOf(`> ${URL_ONE}`))).toHaveLength(0);
    expect(findEmbedLines(docOf(`# ${URL_ONE}`))).toHaveLength(0);
    expect(findEmbedLines(docOf(`![alt](${URL_ONE})`))).toHaveLength(0);
  });

  it("ignores non-Whimsical and invalid URLs", () => {
    expect(
      findEmbedLines(docOf(`https://example.com/${SLUG}`)),
    ).toHaveLength(0);
    expect(
      findEmbedLines(docOf("https://whimsical.com/not-a-valid-item")),
    ).toHaveLength(0);
  });

  it("ignores lines inside fenced code blocks but resumes after the fence", () => {
    const doc = docOf("```", URL_ONE, "```", URL_TWO);

    const lines = findEmbedLines(doc);

    expect(lines.map((line) => line.slug)).toEqual([SLUG_TWO]);
  });

  it("ignores lines inside tilde fences", () => {
    const doc = docOf("~~~text", URL_ONE, "~~~");

    expect(findEmbedLines(doc)).toHaveLength(0);
  });

  it("ignores lines inside frontmatter at the start of the document", () => {
    const doc = docOf("---", `link: ${URL_ONE}`, URL_ONE, "---", URL_TWO);

    const lines = findEmbedLines(doc);

    expect(lines.map((line) => line.slug)).toEqual([SLUG_TWO]);
  });

  it("does not treat a --- line after content as frontmatter", () => {
    const doc = docOf("intro", "---", URL_ONE);

    expect(findEmbedLines(doc)).toHaveLength(1);
  });
});

describe("whimsicalEditorExtension", () => {
  it("decorates a standalone link line with one block replace widget", () => {
    const state = makeState(["intro", URL_ONE]);

    const decorations = embedDecorations(state);

    expect(decorations).toHaveLength(1);
    const line = state.doc.line(2);
    expect(decorations[0]?.from).toBe(line.from);
    expect(decorations[0]?.to).toBe(line.to);
    // Decoration.spec is typed `any` by CodeMirror; narrow it explicitly.
    const spec = decorations[0]?.value.spec as {
      block?: unknown;
      widget?: unknown;
    };
    expect(spec.block).toBe(true);
    expect(spec.widget).toBeInstanceOf(WhimsicalEmbedWidget);
  });

  it("reveals the raw markdown while the cursor is on the embed line", () => {
    const withCursorOnLine = makeState(["intro", URL_ONE], {
      cursor: "intro\n".length + 1,
    });

    expect(embedDecorations(withCursorOnLine)).toHaveLength(0);
  });

  it("reveals the raw markdown while a selection overlaps the embed line", () => {
    const registry = trackingRegistry().registry;
    const state = EditorState.create({
      doc: ["intro", URL_ONE].join("\n"),
      selection: EditorSelection.range(0, "intro\n".length + 2),
      extensions: [editorLivePreviewField, whimsicalEditorExtension(registry)],
    });

    expect(embedDecorations(state)).toHaveLength(0);
  });

  it("restores the embed when the cursor leaves the line", () => {
    const onLine = makeState(["intro", URL_ONE], {
      cursor: "intro\n".length + 1,
    });

    const off = onLine.update({ selection: EditorSelection.cursor(0) });

    expect(embedDecorations(off.state)).toHaveLength(1);
  });

  it("renders no embeds outside live preview and restores them on re-entry", () => {
    const state = makeState(["intro", URL_ONE]);

    const sourceMode = state.update({
      effects: [setLivePreview.of(false)],
    });
    expect(embedDecorations(sourceMode.state)).toHaveLength(0);

    const backToLivePreview = sourceMode.state.update({
      effects: [setLivePreview.of(true)],
    });
    expect(embedDecorations(backToLivePreview.state)).toHaveLength(1);
  });

  it("recomputes decorations when the document changes", () => {
    const state = makeState(["intro"]);
    expect(embedDecorations(state)).toHaveLength(0);

    const withLink = state.update({
      changes: { from: state.doc.length, insert: `\n${URL_ONE}` },
    });

    expect(embedDecorations(withLink.state)).toHaveLength(1);
  });
});

describe("WhimsicalEmbedWidget", () => {
  it("compares equal only for the same origin and slug", () => {
    const registry = trackingRegistry().registry;
    const widget = new WhimsicalEmbedWidget(ORIGIN, SLUG, registry);

    expect(widget.eq(new WhimsicalEmbedWidget(ORIGIN, SLUG, registry))).toBe(
      true,
    );
    expect(
      widget.eq(new WhimsicalEmbedWidget(ORIGIN, SLUG_TWO, registry)),
    ).toBe(false);
  });

  it("mounts the embed iframe and registers the view on toDOM", () => {
    const { registry, added } = trackingRegistry();
    const widget = new WhimsicalEmbedWidget(ORIGIN, SLUG, registry);

    const dom = widget.toDOM(fakeView());

    expect(dom.className).toBe("whimsical-embed-container");
    const iframe = dom.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe(
      `https://whimsical.com/embed/${SLUG}?color-mode=light&login-mode=inline`,
    );
    expect(added).toHaveLength(1);
  });

  it("destroys the embed and deregisters the view on destroy", () => {
    const { registry, added, deleted } = trackingRegistry();
    const widget = new WhimsicalEmbedWidget(ORIGIN, SLUG, registry);
    const dom = widget.toDOM(fakeView());
    const iframe = dom.querySelector("iframe") as HTMLIFrameElement;

    widget.destroy(dom);

    expect(iframe.getAttribute("src")).toBe("about:blank");
    expect(dom.childElementCount).toBe(0);
    expect(deleted).toEqual(added);
  });
});
