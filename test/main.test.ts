import { beforeEach, describe, expect, it } from "vitest";
import WhimsicalEmbedsPlugin from "../src/main";
import {
  Workspace,
  type App,
  type MarkdownPostProcessor,
  type MarkdownPostProcessorContext,
  type MarkdownRenderChild,
  type Plugin as StubPlugin,
  type PluginManifest,
} from "./stubs/obsidian";

const SLUG = "board-Ku85wgQn9LwYVnqirzaBoJ";
const URL_ONE = `https://whimsical.com/${SLUG}`;
const URL_TWO = "https://whimsical.com/flowchart-A1b2C3d4E5f6G7h8J9k2Lm";

const MANIFEST: PluginManifest = {
  id: "whimsical",
  name: "Whimsical",
  version: "1.0.0",
};

interface LoadedPlugin {
  plugin: WhimsicalEmbedsPlugin;
  workspace: Workspace;
  postProcessors: MarkdownPostProcessor[];
}

function loadPlugin(): LoadedPlugin {
  const workspace = new Workspace();
  const app: App = { workspace };
  // The real Plugin constructor is `(app: App, manifest: PluginManifest)`;
  // at runtime it resolves to the stub via the vitest `obsidian` alias, while
  // tsc still sees the real (structurally incompatible) obsidian types here.
  const plugin = new (WhimsicalEmbedsPlugin as unknown as new (
    app: App,
    manifest: PluginManifest,
  ) => WhimsicalEmbedsPlugin)(app, MANIFEST);

  plugin.load();

  const { markdownPostProcessors } = plugin as unknown as StubPlugin;
  return { plugin, workspace, postProcessors: markdownPostProcessors };
}

function anchor(url: string, text: string): HTMLAnchorElement {
  const element = document.createElement("a");
  element.setAttribute("href", url);
  element.textContent = text;
  return element;
}

/** `<p><a href="url">text</a></p>` — the shape the plugin embeds. */
function standaloneLink(url: string, text: string): HTMLParagraphElement {
  const paragraph = document.createElement("p");
  paragraph.appendChild(anchor(url, text));
  return paragraph;
}

/** `<p>See <a href="url">text</a>.</p>` — the shape it must leave alone. */
function inlineLink(url: string, text: string): HTMLParagraphElement {
  const paragraph = document.createElement("p");
  paragraph.appendChild(document.createTextNode("See "));
  paragraph.appendChild(anchor(url, text));
  paragraph.appendChild(document.createTextNode("."));
  return paragraph;
}

function fragment(...paragraphs: HTMLParagraphElement[]): HTMLElement {
  const root = document.createElement("div");
  for (const paragraph of paragraphs) {
    root.appendChild(paragraph);
  }
  document.body.appendChild(root);
  return root;
}

/** A post-processor context that loads every child, like Obsidian does. */
function loadingContext(children: MarkdownRenderChild[]): {
  context: MarkdownPostProcessorContext;
  addChildCalls: () => number;
} {
  let calls = 0;
  const context: MarkdownPostProcessorContext = {
    addChild(child) {
      calls += 1;
      children.push(child);
      child.load();
    },
  };
  return { context, addChildCalls: () => calls };
}

function onlyProcessor(
  processors: MarkdownPostProcessor[],
): MarkdownPostProcessor {
  const processor = processors[0];
  if (processor === undefined) {
    throw new Error("no markdown post processor was registered");
  }
  return processor;
}

function iframeIn(root: ParentNode): HTMLIFrameElement {
  const iframe = root.querySelector("iframe");
  if (iframe === null) {
    throw new Error("expected an embed iframe");
  }
  return iframe;
}

beforeEach(() => {
  document.body.className = "theme-light";
  document.body.innerHTML = "";
});

describe("WhimsicalEmbedsPlugin", () => {
  it("registers exactly one markdown post processor on load", () => {
    const { postProcessors } = loadPlugin();

    expect(postProcessors).toHaveLength(1);
  });

  it("replaces a standalone link paragraph with a mounted embed", () => {
    const { postProcessors } = loadPlugin();
    const root = fragment(standaloneLink(URL_ONE, "Board"));
    const children: MarkdownRenderChild[] = [];
    const { context, addChildCalls } = loadingContext(children);

    onlyProcessor(postProcessors)(root, context);

    expect(root.querySelector("p")).toBeNull();
    const containers = root.querySelectorAll("div.whimsical-embed-container");
    expect(containers).toHaveLength(1);
    expect(addChildCalls()).toBe(1);
    expect(children).toHaveLength(1);

    const container = containers[0] as HTMLElement;
    expect(iframeIn(container).getAttribute("src")).toBe(
      `https://whimsical.com/embed/${SLUG}?color-mode=light&login-mode=inline`,
    );
  });

  it("registers exactly one css-change listener per loaded embed", () => {
    const { workspace, postProcessors } = loadPlugin();
    const root = fragment(standaloneLink(URL_ONE, "Board"));
    const { context } = loadingContext([]);

    onlyProcessor(postProcessors)(root, context);

    expect(workspace.listenerCount("css-change")).toBe(1);
  });

  it("syncs the embed color mode when the workspace fires css-change", () => {
    const { workspace, postProcessors } = loadPlugin();
    const root = fragment(standaloneLink(URL_ONE, "Board"));
    const { context } = loadingContext([]);
    onlyProcessor(postProcessors)(root, context);
    const iframe = iframeIn(root);

    document.body.classList.remove("theme-light");
    document.body.classList.add("theme-dark");
    workspace.trigger("css-change");

    expect(iframe.getAttribute("src")).toBe(
      `https://whimsical.com/embed/${SLUG}?color-mode=dark&login-mode=inline`,
    );
  });

  it("tears down the embed and its css-change listener when the child unloads", () => {
    const { workspace, postProcessors } = loadPlugin();
    const root = fragment(standaloneLink(URL_ONE, "Board"));
    const children: MarkdownRenderChild[] = [];
    const { context } = loadingContext(children);
    onlyProcessor(postProcessors)(root, context);
    const iframe = iframeIn(root);
    const container = root.querySelector(
      "div.whimsical-embed-container",
    ) as HTMLElement;

    const child = children[0];
    if (child === undefined) {
      throw new Error("expected a render child");
    }
    child.unload();

    expect(workspace.listenerCount("css-change")).toBe(0);
    expect(container.childElementCount).toBe(0);
    expect(iframe.getAttribute("src")).toBe("about:blank");
  });

  it("handles two standalone links without leaking listeners", () => {
    const { workspace, postProcessors } = loadPlugin();
    const root = fragment(
      standaloneLink(URL_ONE, "One"),
      standaloneLink(URL_TWO, "Two"),
    );
    const children: MarkdownRenderChild[] = [];
    const { context, addChildCalls } = loadingContext(children);

    onlyProcessor(postProcessors)(root, context);

    expect(addChildCalls()).toBe(2);
    expect(children).toHaveLength(2);
    expect(root.querySelectorAll("div.whimsical-embed-container")).toHaveLength(
      2,
    );
    expect(root.querySelectorAll("iframe")).toHaveLength(2);
    expect(workspace.listenerCount("css-change")).toBe(2);

    for (const child of children) {
      child.unload();
    }

    expect(workspace.listenerCount("css-change")).toBe(0);
  });

  it("leaves an inline link untouched", () => {
    const { workspace, postProcessors } = loadPlugin();
    const root = fragment(inlineLink(URL_ONE, "x"));
    const before = root.innerHTML;
    const children: MarkdownRenderChild[] = [];
    const { context, addChildCalls } = loadingContext(children);

    onlyProcessor(postProcessors)(root, context);

    expect(root.innerHTML).toBe(before);
    expect(addChildCalls()).toBe(0);
    expect(children).toHaveLength(0);
    expect(root.querySelector("iframe")).toBeNull();
    expect(workspace.listenerCount("css-change")).toBe(0);
  });
});
