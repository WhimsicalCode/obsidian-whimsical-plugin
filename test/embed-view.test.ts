import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountEmbed } from "../src/embed-view";

const SLUG = "board-Ku85wgQn9LwYVnqirzaBoJ";
const ORIGIN = "https://whimsical.com";

beforeEach(() => {
  document.body.className = "theme-light";
  document.body.innerHTML = "";
});

function mountContainer(): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

describe("mountEmbed", () => {
  it("creates exactly one iframe with the expected security attributes", () => {
    const container = mountContainer();

    mountEmbed(container, ORIGIN, SLUG);

    const iframes = container.querySelectorAll("iframe");
    expect(iframes).toHaveLength(1);
    const iframe = iframes[0] as HTMLIFrameElement;

    expect(iframe.getAttribute("src")).toBe(
      `https://whimsical.com/embed/${SLUG}?color-mode=light&login-mode=inline`,
    );
    expect(iframe.getAttribute("class")).toBe("whimsical-embed-frame");
    expect(iframe.getAttribute("title")).toBe("Whimsical board");
    expect(iframe.getAttribute("loading")).toBe("lazy");
    expect(iframe.getAttribute("allow")).toBe("fullscreen");
    expect(iframe.getAttribute("referrerpolicy")).toBe(
      "strict-origin-when-cross-origin",
    );

    const sandboxTokens = (iframe.getAttribute("sandbox") ?? "")
      .split(/\s+/)
      .filter(Boolean);
    expect(sandboxTokens).toHaveLength(5);
    expect(new Set(sandboxTokens)).toEqual(
      new Set([
        "allow-scripts",
        "allow-forms",
        "allow-same-origin",
        "allow-popups",
        "allow-popups-to-escape-sandbox",
      ]),
    );
  });

  it("changes the src exactly once on a real theme transition, and not again on a redundant sync", () => {
    const container = mountContainer();
    const view = mountEmbed(container, ORIGIN, SLUG);
    const iframe = container.querySelector("iframe") as HTMLIFrameElement;

    const setAttributeSpy = vi.spyOn(iframe, "setAttribute");

    document.body.classList.remove("theme-light");
    document.body.classList.add("theme-dark");
    view.syncColorMode();

    expect(iframe.getAttribute("src")).toBe(
      `https://whimsical.com/embed/${SLUG}?color-mode=dark&login-mode=inline`,
    );
    const srcMutationsAfterTransition = setAttributeSpy.mock.calls.filter(
      ([name]) => name === "src",
    );
    expect(srcMutationsAfterTransition).toHaveLength(1);

    // No theme change this time: syncColorMode must be a no-op for src.
    view.syncColorMode();

    const srcMutationsAfterNoOp = setAttributeSpy.mock.calls.filter(
      ([name]) => name === "src",
    );
    expect(srcMutationsAfterNoOp).toHaveLength(1);
  });

  it("resets the iframe src to about:blank and empties the container on destroy", () => {
    const container = mountContainer();
    const view = mountEmbed(container, ORIGIN, SLUG);
    const iframe = container.querySelector("iframe") as HTMLIFrameElement;

    view.destroy();

    expect(iframe.getAttribute("src")).toBe("about:blank");
    expect(container.childElementCount).toBe(0);
  });
});
