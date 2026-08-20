import {
  MarkdownRenderChild,
  Plugin,
  type App,
  type MarkdownPostProcessorContext,
} from "obsidian";
import { mountEmbed, type EmbedView } from "./embed-view";
import { findStandaloneWhimsicalLinks } from "./markdown-links";

/**
 * Owns one rendered Whimsical embed's lifecycle. `containerEl` (passed to
 * `super`) is what Obsidian watches to decide when to unload this child—once
 * the rendered Markdown section it belongs to is replaced or removed from
 * the DOM, Obsidian calls `onunload` for us.
 */
class WhimsicalEmbedChild extends MarkdownRenderChild {
  private readonly app: App;
  private readonly origin: string;
  private readonly slug: string;
  private view: EmbedView | null = null;

  constructor(app: App, containerEl: HTMLElement, origin: string, slug: string) {
    super(containerEl);
    this.app = app;
    this.origin = origin;
    this.slug = slug;
  }

  onload(): void {
    this.view = mountEmbed(this.containerEl, this.origin, this.slug);
    this.registerEvent(
      this.app.workspace.on("css-change", () => {
        this.view?.syncColorMode();
      }),
    );
  }

  onunload(): void {
    this.view?.destroy();
    this.view = null;
  }
}

export default class WhimsicalEmbedsPlugin extends Plugin {
  onload(): void {
    this.registerMarkdownPostProcessor(
      (el: HTMLElement, context: MarkdownPostProcessorContext) => {
        for (const { paragraph, origin, slug } of findStandaloneWhimsicalLinks(
          el,
        )) {
          // createDiv parents the div inside the paragraph only so it is
          // created in the paragraph's own document (popout windows);
          // replaceWith then swaps it into the paragraph's place.
          const container = paragraph.createDiv({
            cls: "whimsical-embed-container",
          });
          paragraph.replaceWith(container);
          context.addChild(
            new WhimsicalEmbedChild(this.app, container, origin, slug),
          );
        }
      },
    );
  }
}
