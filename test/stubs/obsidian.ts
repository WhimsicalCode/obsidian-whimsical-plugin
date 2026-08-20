/**
 * Runtime stub for the `obsidian` package, which ships types only
 * (`"main": ""`), so anything importing it would explode under vitest.
 *
 * Only the surface `src/main.ts` actually touches is modelled here, and the
 * semantics that matter for the plugin's lifecycle are preserved: events
 * registered through `Component.registerEvent` are deregistered on unload.
 *
 * This file must not import from "obsidian" itself.
 */

export type EventCallback = (...args: unknown[]) => void;

export interface EventRef {
  readonly name: string;
  readonly callback: EventCallback;
  /** Deregisters this ref from the workspace that created it. */
  off(): void;
}

export class Workspace {
  private readonly listeners = new Map<string, EventRef[]>();

  on(name: string, callback: EventCallback): EventRef {
    const ref: EventRef = {
      name,
      callback,
      off: (): void => {
        this.offref(ref);
      },
    };

    const registered = this.listeners.get(name);
    if (registered === undefined) {
      this.listeners.set(name, [ref]);
    } else {
      registered.push(ref);
    }

    return ref;
  }

  offref(ref: EventRef): void {
    const registered = this.listeners.get(ref.name);
    if (registered === undefined) {
      return;
    }
    const index = registered.indexOf(ref);
    if (index !== -1) {
      registered.splice(index, 1);
    }
  }

  trigger(name: string, ...args: unknown[]): void {
    const registered = this.listeners.get(name);
    if (registered === undefined) {
      return;
    }
    // Copy: a callback may deregister itself while we are iterating.
    for (const ref of [...registered]) {
      ref.callback(...args);
    }
  }

  /** Test helper: how many live listeners exist for `name`. */
  listenerCount(name: string): number {
    return this.listeners.get(name)?.length ?? 0;
  }
}

export interface App {
  readonly workspace: Workspace;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
}

export interface MarkdownPostProcessorContext {
  addChild(child: MarkdownRenderChild): void;
}

export type MarkdownPostProcessor = (
  el: HTMLElement,
  context: MarkdownPostProcessorContext,
) => void;

export class Component {
  private readonly registeredEvents: EventRef[] = [];

  onload(): void {
    // Overridden by subclasses.
  }

  onunload(): void {
    // Overridden by subclasses.
  }

  load(): void {
    this.onload();
  }

  unload(): void {
    this.onunload();
    while (this.registeredEvents.length > 0) {
      const ref = this.registeredEvents.pop();
      ref?.off();
    }
  }

  registerEvent(ref: EventRef): void {
    this.registeredEvents.push(ref);
  }
}

export class MarkdownRenderChild extends Component {
  readonly containerEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    super();
    this.containerEl = containerEl;
  }
}

export class Plugin extends Component {
  readonly app: App;
  readonly manifest: PluginManifest;
  /** Test helper: every processor handed to registerMarkdownPostProcessor. */
  readonly markdownPostProcessors: MarkdownPostProcessor[] = [];

  constructor(app: App, manifest: PluginManifest) {
    super();
    this.app = app;
    this.manifest = manifest;
  }

  registerMarkdownPostProcessor(
    processor: MarkdownPostProcessor,
  ): MarkdownPostProcessor {
    this.markdownPostProcessors.push(processor);
    return processor;
  }
}
