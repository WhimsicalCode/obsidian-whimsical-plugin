import { beforeEach, describe, expect, it } from "vitest";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import WhimsicalEmbedsPlugin from "../src/main";
import { WhimsicalEmbedWidget } from "../src/editor-embeds";
import {
  editorLivePreviewField,
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
  editorExtensions: unknown[];
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

  const { markdownPostProcessors, editorExtensions } =
    plugin as unknown as StubPlugin;
  return {
    plugin,
    workspace,
    postProcessors: markdownPostProcessors,
    editorExtensions,
  };
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

  it("adds one css-change listener per loaded embed on top of the plugin's own", () => {
    const { workspace, postProcessors } = loadPlugin();
    expect(workspace.listenerCount("css-change")).toBe(1);

    const root = fragment(standaloneLink(URL_ONE, "Board"));
    const { context } = loadingContext([]);

    onlyProcessor(postProcessors)(root, context);

    expect(workspace.listenerCount("css-change")).toBe(2);
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

    expect(workspace.listenerCount("css-change")).toBe(1);
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
    expect(workspace.listenerCount("css-change")).toBe(3);

    for (const child of children) {
      child.unload();
    }

    expect(workspace.listenerCount("css-change")).toBe(1);
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
    expect(workspace.listenerCount("css-change")).toBe(1);
  });

  it("registers exactly one editor extension on load", () => {
    const { editorExtensions } = loadPlugin();

    expect(editorExtensions).toHaveLength(1);
  });

  it("syncs a Live Preview widget's color mode through the plugin's css-change listener", () => {
    const { workspace, editorExtensions } = loadPlugin();
    const widget = onlyEditorWidget(editorExtensions);

    const container = widget.toDOM(fakeEditorView());
    const iframe = iframeIn(container);
    expect(iframe.getAttribute("src")).toBe(
      `https://whimsical.com/embed/${SLUG}?color-mode=light&login-mode=inline`,
    );

    document.body.classList.remove("theme-light");
    document.body.classList.add("theme-dark");
    workspace.trigger("css-change");

    expect(iframe.getAttribute("src")).toBe(
      `https://whimsical.com/embed/${SLUG}?color-mode=dark&login-mode=inline`,
    );
  });

  it("stops syncing a Live Preview widget once it is destroyed", () => {
    const { workspace, editorExtensions } = loadPlugin();
    const widget = onlyEditorWidget(editorExtensions);
    const container = widget.toDOM(fakeEditorView());
    const iframe = iframeIn(container);

    widget.destroy(container);

    document.body.classList.remove("theme-light");
    document.body.classList.add("theme-dark");
    workspace.trigger("css-change");

    expect(iframe.getAttribute("src")).toBe("about:blank");
  });
});

/**
 * Builds an editor state over one standalone link with the plugin's
 * registered extension and returns the single embed widget it produced.
 */
function onlyEditorWidget(editorExtensions: unknown[]): WhimsicalEmbedWidget {
  const state = EditorState.create({
    doc: `intro\n${URL_ONE}`,
    selection: EditorSelection.cursor(0),
    extensions: [
      editorLivePreviewField,
      ...(editorExtensions as Extension[]),
    ],
  });

  const widgets: WhimsicalEmbedWidget[] = [];
  for (const entry of state.facet(EditorView.decorations)) {
    if (typeof entry === "function") {
      continue;
    }
    const iter = entry.iter();
    while (iter.value !== null) {
      // Decoration.spec is typed `any` by CodeMirror; narrow it explicitly.
      const spec = iter.value.spec as { widget?: unknown };
      if (spec.widget instanceof WhimsicalEmbedWidget) {
        widgets.push(spec.widget);
      }
      iter.next();
    }
  }

  const widget = widgets[0];
  if (widgets.length !== 1 || widget === undefined) {
    throw new Error(`expected exactly one embed widget, got ${widgets.length}`);
  }
  return widget;
}

function fakeEditorView(): EditorView {
  const dom = document.body.createDiv();
  return { dom } as unknown as EditorView;
}
