import { buildEmbedUrl, type EmbedColorMode } from "./whimsical-url";

export interface EmbedView {
  syncColorMode(): void;
  destroy(): void;
}

// allow-scripts + allow-same-origin together are safe here because the
// frame origin is a Whimsical origin (whimsical.com, or a dev-server origin
// in local dev builds), which is cross-origin to Obsidian's host origin
// (app://obsidian.md / capacitor://localhost / http://localhost), so the
// frame cannot reach parent.document to strip its own sandbox.
// allow-same-origin is required for Whimbed's cookie-based auth, and
// allow-forms lets Whimbed's in-frame sign-in form submit (to whimsical.com
// itself; scripted fetch was never blocked, so this adds no new capability).
// Never add allow-top-navigation.
const SANDBOX_TOKENS =
  "allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox";

/**
 * Mounts a sandboxed, theme-aware Whimbed iframe inside `container`. The
 * caller (a `MarkdownRenderChild`) owns the returned view's lifecycle: call
 * `syncColorMode()` on Obsidian's `css-change` event and `destroy()` on
 * unload.
 */
export function mountEmbed(
  container: HTMLElement,
  origin: string,
  slug: string,
): EmbedView {
  const doc = container.ownerDocument;

  let lastMode = getColorMode(doc);

  const iframe = doc.createElement("iframe");
  iframe.setAttribute("src", buildEmbedUrl(origin, slug, lastMode));
  iframe.setAttribute("class", "whimsical-embed-frame");
  iframe.setAttribute("title", "Whimsical board");
  iframe.setAttribute("loading", "lazy");
  iframe.setAttribute("allow", "fullscreen");
  iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  iframe.setAttribute("sandbox", SANDBOX_TOKENS);

  container.appendChild(iframe);

  function syncColorMode(): void {
    const mode = getColorMode(doc);
    // Retain the last applied mode so CSS changes unrelated to the
    // light/dark toggle (e.g. accent color) never reload the board.
    if (mode === lastMode) {
      return;
    }
    lastMode = mode;
    iframe.setAttribute("src", buildEmbedUrl(origin, slug, mode));
  }

  function destroy(): void {
    // Reset the src before detaching so the iframe never keeps rendering
    // (or navigating) a Whimsical origin once it is out of the document.
    iframe.setAttribute("src", "about:blank");
    iframe.remove();
  }

  return { syncColorMode, destroy };
}

function getColorMode(doc: Document): EmbedColorMode {
  return doc.body.classList.contains("theme-dark") ? "dark" : "light";
}
