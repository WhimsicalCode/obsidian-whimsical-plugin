import { afterEach, describe, expect, it, vi } from "vitest";
import { buildEmbedUrl, parseWhimsicalUrl } from "../src/whimsical-url";

describe("parseWhimsicalUrl", () => {
  describe("accepted URLs", () => {
    it("accepts a slug with a multi-word title prefix", () => {
      const result = parseWhimsicalUrl(
        "https://whimsical.com/prioritization-matrix-smaller-Ku85wgQn9LwYVnqirzaBoJ",
      );
      expect(result).toEqual({
        slug: "prioritization-matrix-smaller-Ku85wgQn9LwYVnqirzaBoJ",
        origin: "https://whimsical.com",
        canonicalUrl:
          "https://whimsical.com/prioritization-matrix-smaller-Ku85wgQn9LwYVnqirzaBoJ",
      });
    });

    it("accepts a bare id on the www host and normalizes the origin", () => {
      const result = parseWhimsicalUrl(
        "https://www.whimsical.com/Ku85wgQn9LwYVnqirzaBoJ",
      );
      expect(result).toEqual({
        slug: "Ku85wgQn9LwYVnqirzaBoJ",
        origin: "https://whimsical.com",
        canonicalUrl: "https://whimsical.com/Ku85wgQn9LwYVnqirzaBoJ",
      });
    });

    it("accepts a slug with an @-suffix", () => {
      const result = parseWhimsicalUrl(
        "https://whimsical.com/board-Ku85wgQn9LwYVnqirzaBoJ@111",
      );
      expect(result).toEqual({
        slug: "board-Ku85wgQn9LwYVnqirzaBoJ@111",
        origin: "https://whimsical.com",
        canonicalUrl: "https://whimsical.com/board-Ku85wgQn9LwYVnqirzaBoJ@111",
      });
    });

    it("accepts a slug with query and fragment, and omits them from the canonical URL", () => {
      const result = parseWhimsicalUrl(
        "https://whimsical.com/board-Ku85wgQn9LwYVnqirzaBoJ?utm_source=note#section",
      );
      expect(result).toEqual({
        slug: "board-Ku85wgQn9LwYVnqirzaBoJ",
        origin: "https://whimsical.com",
        canonicalUrl: "https://whimsical.com/board-Ku85wgQn9LwYVnqirzaBoJ",
      });
    });

    it("accepts a workspace-prefixed URL and canonicalizes to the bare item slug", () => {
      const result = parseWhimsicalUrl(
        "https://whimsical.com/acme-workspace/board-Ku85wgQn9LwYVnqirzaBoJ",
      );
      expect(result).toEqual({
        slug: "board-Ku85wgQn9LwYVnqirzaBoJ",
        origin: "https://whimsical.com",
        canonicalUrl: "https://whimsical.com/board-Ku85wgQn9LwYVnqirzaBoJ",
      });
    });

    it("accepts a workspace-prefixed URL with an @-suffixed item slug", () => {
      const result = parseWhimsicalUrl(
        "https://whimsical.com/acme/board-Ku85wgQn9LwYVnqirzaBoJ@111",
      );
      expect(result).toEqual({
        slug: "board-Ku85wgQn9LwYVnqirzaBoJ@111",
        origin: "https://whimsical.com",
        canonicalUrl: "https://whimsical.com/board-Ku85wgQn9LwYVnqirzaBoJ@111",
      });
    });
  });

  describe("rejected URLs", () => {
    const rejected = [
      "http://whimsical.com/board-Ku85wgQn9LwYVnqirzaBoJ",
      "https://evil.example/board-Ku85wgQn9LwYVnqirzaBoJ",
      "https://whimsical.com.evil.example/board-Ku85wgQn9LwYVnqirzaBoJ",
      "https://user:password@whimsical.com/board-Ku85wgQn9LwYVnqirzaBoJ",
      "https://whimsical.com:4443/board-Ku85wgQn9LwYVnqirzaBoJ",
      "https://whimsical.com/templates/affinity-diagram",
      "https://whimsical.com/embed/board-Ku85wgQn9LwYVnqirzaBoJ",
      "https://whimsical.com/not-a-valid-item",
      "javascript:alert(1)",
      "https://whimsical.com/%2e%2e%2fembed%2fx",
      "https://whimsical.com/Ku85wgQn9LwYVnqirzaBoJ%3Fcolor-mode%3Ddark",
      "https://whimsical.com/board%2FKu85wgQn9LwYVnqirzaBoJ",
      "https://whimsical.com/ws/nested/board-Ku85wgQn9LwYVnqirzaBoJ",
      "https://whimsical.com/acme/not-a-valid-item",
      "https://whimsical.com//board-Ku85wgQn9LwYVnqirzaBoJ",
      "https://whimsical.com/acme.workspace/board-Ku85wgQn9LwYVnqirzaBoJ",
    ];

    it.each(rejected)("rejects %s", (rawUrl) => {
      expect(parseWhimsicalUrl(rawUrl)).toBeNull();
    });
  });
});

describe("dev-origin injection", () => {
  // The esbuild define is absent under vitest, so the module falls back to
  // reading globalThis; a fresh dynamic import picks the stub up at module
  // evaluation time.
  const DEV_ORIGIN = "https://dev.example:4443";

  async function importWithDevOrigin() {
    vi.stubGlobal("__WHIMSICAL_DEV_ORIGIN__", DEV_ORIGIN);
    vi.resetModules();
    return await import("../src/whimsical-url");
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("accepts a dev-origin link and keeps its origin end-to-end", async () => {
    const mod = await importWithDevOrigin();
    expect(
      mod.parseWhimsicalUrl(`${DEV_ORIGIN}/board-Ku85wgQn9LwYVnqirzaBoJ`),
    ).toEqual({
      slug: "board-Ku85wgQn9LwYVnqirzaBoJ",
      origin: DEV_ORIGIN,
      canonicalUrl: `${DEV_ORIGIN}/board-Ku85wgQn9LwYVnqirzaBoJ`,
    });
  });

  it("accepts a workspace-prefixed dev-origin link", async () => {
    const mod = await importWithDevOrigin();
    expect(
      mod.parseWhimsicalUrl(`${DEV_ORIGIN}/acme/board-Ku85wgQn9LwYVnqirzaBoJ`),
    ).toEqual({
      slug: "board-Ku85wgQn9LwYVnqirzaBoJ",
      origin: DEV_ORIGIN,
      canonicalUrl: `${DEV_ORIGIN}/board-Ku85wgQn9LwYVnqirzaBoJ`,
    });
  });

  it("still accepts production links alongside the dev origin", async () => {
    const mod = await importWithDevOrigin();
    expect(
      mod.parseWhimsicalUrl(
        "https://whimsical.com/board-Ku85wgQn9LwYVnqirzaBoJ",
      ),
    ).toEqual({
      slug: "board-Ku85wgQn9LwYVnqirzaBoJ",
      origin: "https://whimsical.com",
      canonicalUrl: "https://whimsical.com/board-Ku85wgQn9LwYVnqirzaBoJ",
    });
  });

  it("rejects the dev host on the wrong port and without a port", async () => {
    const mod = await importWithDevOrigin();
    expect(
      mod.parseWhimsicalUrl(
        "https://dev.example:4444/board-Ku85wgQn9LwYVnqirzaBoJ",
      ),
    ).toBeNull();
    expect(
      mod.parseWhimsicalUrl("https://dev.example/board-Ku85wgQn9LwYVnqirzaBoJ"),
    ).toBeNull();
  });

  it("rejects dev-origin links when no dev origin is injected", () => {
    expect(
      parseWhimsicalUrl(`${DEV_ORIGIN}/board-Ku85wgQn9LwYVnqirzaBoJ`),
    ).toBeNull();
  });
});

describe("buildEmbedUrl", () => {
  it("builds an embed URL with the given color mode", () => {
    expect(
      buildEmbedUrl(
        "https://whimsical.com",
        "board-Ku85wgQn9LwYVnqirzaBoJ",
        "dark",
      ),
    ).toBe(
      "https://whimsical.com/embed/board-Ku85wgQn9LwYVnqirzaBoJ?color-mode=dark&login-mode=inline",
    );
  });

  it("builds an embed URL for light mode", () => {
    expect(
      buildEmbedUrl(
        "https://whimsical.com",
        "board-Ku85wgQn9LwYVnqirzaBoJ",
        "light",
      ),
    ).toBe(
      "https://whimsical.com/embed/board-Ku85wgQn9LwYVnqirzaBoJ?color-mode=light&login-mode=inline",
    );
  });

  it("builds an embed URL on a non-default origin", () => {
    expect(
      buildEmbedUrl(
        "https://dev.example:4443",
        "board-Ku85wgQn9LwYVnqirzaBoJ",
        "dark",
      ),
    ).toBe(
      "https://dev.example:4443/embed/board-Ku85wgQn9LwYVnqirzaBoJ?color-mode=dark&login-mode=inline",
    );
  });

  it("preserves an @-suffixed slug verbatim", () => {
    expect(
      buildEmbedUrl(
        "https://whimsical.com",
        "board-Ku85wgQn9LwYVnqirzaBoJ@111",
        "dark",
      ),
    ).toBe(
      "https://whimsical.com/embed/board-Ku85wgQn9LwYVnqirzaBoJ@111?color-mode=dark&login-mode=inline",
    );
  });
});
