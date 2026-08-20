/**
 * jsdom polyfill for the Obsidian DOM helpers the plugin uses. The real app
 * injects these onto Node.prototype at runtime (obsidian.d.ts declares
 * them); only the semantics the plugin relies on are modelled: create in
 * the node's own document, apply cls/attr, append to the node.
 */// DomElementInfo is a global type declared by obsidian.d.ts (loaded into
// the program via the src imports of "obsidian").
function applyInfo(el: HTMLElement, o?: DomElementInfo | string): void {
  const info = typeof o === "string" ? { cls: o } : (o ?? {});
  if (info.cls !== undefined) {
    el.className = Array.isArray(info.cls) ? info.cls.join(" ") : info.cls;
  }
  if (info.attr !== undefined) {
    for (const [key, value] of Object.entries(info.attr)) {
      if (value !== null) {
        el.setAttribute(key, String(value));
      }
    }
  }
}

Node.prototype.createEl = function <K extends keyof HTMLElementTagNameMap>(
  this: Node,
  tag: K,
  o?: DomElementInfo | string,
): HTMLElementTagNameMap[K] {
  const doc = this.ownerDocument ?? (this as unknown as Document);
  const el = doc.createElement(tag);
  applyInfo(el, o);
  this.appendChild(el);
  return el;
};

Node.prototype.createDiv = function (
  this: Node,
  o?: DomElementInfo | string,
): HTMLDivElement {
  return this.createEl("div", o);
};
