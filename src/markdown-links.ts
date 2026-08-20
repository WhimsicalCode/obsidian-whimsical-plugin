import { parseWhimsicalUrl } from "./whimsical-url";

export interface StandaloneWhimsicalLink {
  paragraph: HTMLParagraphElement;
  origin: string;
  slug: string;
}

/**
 * Finds anchors that are the sole meaningful content of their parent
 * paragraph: a direct `<p>` parent, and every sibling node (element or
 * text) is whitespace-only. This module only reads the DOM; it never
 * mutates it.
 */
export function findStandaloneWhimsicalLinks(
  root: HTMLElement,
): StandaloneWhimsicalLink[] {
  const candidates: StandaloneWhimsicalLink[] = [];

  const anchors = root.querySelectorAll("a[href]");
  for (const anchor of anchors) {
    const href = anchor.getAttribute("href");
    if (href === null) {
      continue;
    }

    const parsed = parseWhimsicalUrl(href);
    if (parsed === null) {
      continue;
    }

    const parent = anchor.parentNode;
    if (parent === null || !isElement(parent) || parent.tagName !== "P") {
      continue;
    }

    if (!hasOnlyWhitespaceSiblings(anchor, parent)) {
      continue;
    }

    candidates.push({
      paragraph: parent as HTMLParagraphElement,
      origin: parsed.origin,
      slug: parsed.slug,
    });
  }

  return candidates;
}

function hasOnlyWhitespaceSiblings(anchor: Element, parent: Node): boolean {
  for (const sibling of parent.childNodes) {
    if (sibling === anchor) {
      continue;
    }
    if (!isWhitespaceOnlyNode(sibling)) {
      return false;
    }
  }
  return true;
}

function isWhitespaceOnlyNode(node: Node): boolean {
  if (node.nodeType !== Node.TEXT_NODE) {
    return false;
  }
  return (node.textContent ?? "").trim() === "";
}

// A nodeType check, rather than `instanceof Element`, so this stays correct
// across window/document boundaries (e.g. Obsidian's popout windows), where
// a node's constructor may not be the same `Element` reference in scope
// here.
function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}
