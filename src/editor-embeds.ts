import {
  RangeSetBuilder,
  StateField,
  type EditorState,
  type Extension,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import { editorLivePreviewField } from "obsidian";
import { mountEmbed, type EmbedView } from "./embed-view";
import { parseWhimsicalUrl } from "./whimsical-url";

export interface EmbedLine {
  from: number;
  to: number;
  origin: string;
  slug: string;
}

/**
 * The plugin's shared set of live editor embeds; one plugin-level
 * `css-change` listener iterates it. A plain `Set<EmbedView>` satisfies it.
 */
export interface EmbedViewRegistry {
  add(view: EmbedView): void;
  delete(view: EmbedView): void;
}

// A line qualifies when, after at most three leading spaces (four or more
// is an indented code block), its entire content is one of the three link
// forms Obsidian also renders as a standalone anchor in Reading view: a
// bare URL, an autolink, or a markdown link. Any other prefix (list marker,
// quote marker, heading, image `!`) fails all three patterns.
const LINE_PATTERNS = [
  /^ {0,3}(https:\/\/\S+)\s*$/,
  /^ {0,3}<(https:\/\/[^>\s]+)>\s*$/,
  /^ {0,3}\[[^\]]*\]\((https:\/\/[^()\s]+)\)\s*$/,
];

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})\s*$/;

/**
 * Scans the document for standalone Whimsical link lines, skipping fenced
 * code blocks and a frontmatter block at the start of the document. An
 * unclosed frontmatter block suppresses the rest of the document; Obsidian
 * itself treats that state as broken frontmatter, so no embeds is fine.
 */
export function findEmbedLines(doc: Text): EmbedLine[] {
  const found: EmbedLine[] = [];
  let fence: { char: string; length: number } | null = null;
  let inFrontmatter = false;

  for (let number = 1; number <= doc.lines; number += 1) {
    const line = doc.line(number);

    if (number === 1 && line.text === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (line.text === "---" || line.text === "...") {
        inFrontmatter = false;
      }
      continue;
    }

    if (fence !== null) {
      const close = FENCE_CLOSE.exec(line.text);
      if (
        close?.[1] !== undefined &&
        close[1].startsWith(fence.char) &&
        close[1].length >= fence.length
      ) {
        fence = null;
      }
      continue;
    }
    const open = FENCE_OPEN.exec(line.text);
    if (open?.[1] !== undefined) {
      fence = { char: open[1].charAt(0), length: open[1].length };
      continue;
    }

    const url = matchStandaloneLink(line.text);
    if (url === null) {
      continue;
    }
    const parsed = parseWhimsicalUrl(url);
    if (parsed === null) {
      continue;
    }
    found.push({
      from: line.from,
      to: line.to,
      origin: parsed.origin,
      slug: parsed.slug,
    });
  }

  return found;
}

function matchStandaloneLink(text: string): string | null {
  for (const pattern of LINE_PATTERNS) {
    const match = pattern.exec(text);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }
  return null;
}

// Maps a widget's mounted DOM back to its EmbedView. Keyed by element
// rather than stored on the widget instance because CodeMirror may pair a
// destroy call with a DOM node created by a different (equal) widget
// instance after decoration rebuilds.
const VIEW_BY_CONTAINER = new WeakMap<HTMLElement, EmbedView>();

export class WhimsicalEmbedWidget extends WidgetType {
  constructor(
    readonly origin: string,
    readonly slug: string,
    private readonly registry: EmbedViewRegistry,
  ) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return (
      other instanceof WhimsicalEmbedWidget &&
      other.origin === this.origin &&
      other.slug === this.slug
    );
  }

  override toDOM(view: EditorView): HTMLElement {
    // createDiv parents the div inside the editor's DOM only so it is
    // created in the editor's own document (popout windows); it is detached
    // immediately and CodeMirror inserts it at the widget's position.
    const container = view.dom.createDiv({ cls: "whimsical-embed-container" });
    container.remove();
    const embed = mountEmbed(container, this.origin, this.slug);
    VIEW_BY_CONTAINER.set(container, embed);
    this.registry.add(embed);
    return container;
  }

  override destroy(dom: HTMLElement): void {
    const embed = VIEW_BY_CONTAINER.get(dom);
    if (embed === undefined) {
      return;
    }
    VIEW_BY_CONTAINER.delete(dom);
    this.registry.delete(embed);
    embed.destroy();
  }
}

/**
 * Live Preview support: replaces each standalone Whimsical link line with a
 * block embed widget, except while the cursor or a selection touches the
 * line (Obsidian's convention for revealing raw markdown). Block widgets
 * must come from a StateField — CodeMirror forbids view plugins from
 * affecting vertical layout.
 */
export function whimsicalEditorExtension(
  registry: EmbedViewRegistry,
): Extension {
  const field = StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state, registry);
    },
    update(decorations, transaction) {
      const livePreviewChanged =
        transaction.startState.field(editorLivePreviewField, false) !==
        transaction.state.field(editorLivePreviewField, false);
      if (
        !transaction.docChanged &&
        transaction.selection === undefined &&
        !livePreviewChanged
      ) {
        return decorations;
      }
      return buildDecorations(transaction.state, registry);
    },
    provide(field) {
      return EditorView.decorations.from(field);
    },
  });
  return field;
}

function buildDecorations(
  state: EditorState,
  registry: EmbedViewRegistry,
): DecorationSet {
  if (state.field(editorLivePreviewField, false) !== true) {
    return Decoration.none;
  }
  const builder = new RangeSetBuilder<Decoration>();
  for (const line of findEmbedLines(state.doc)) {
    if (selectionTouches(state, line)) {
      continue;
    }
    builder.add(
      line.from,
      line.to,
      Decoration.replace({
        widget: new WhimsicalEmbedWidget(line.origin, line.slug, registry),
        block: true,
      }),
    );
  }
  return builder.finish();
}

function selectionTouches(state: EditorState, line: EmbedLine): boolean {
  return state.selection.ranges.some(
    (range) => range.from <= line.to && range.to >= line.from,
  );
}
