export type EmbedColorMode = "light" | "dark";

export interface WhimsicalItemUrl {
  slug: string;
  origin: string;
  canonicalUrl: string;
}

// Optionally injected by esbuild when the WHIMSICAL_DEV_ORIGIN env var is
// set at build time, adding a local dev server origin to the recognized
// set. Absent — and therefore undefined — in release builds and under
// vitest (tests inject it via globalThis instead).
declare const __WHIMSICAL_DEV_ORIGIN__: string | undefined;

interface KnownOrigin {
  hostname: string;
  port: string;
  origin: string;
}

// Every origin the plugin recognizes. A link's origin is preserved
// end-to-end — the embed iframe loads from the same origin the link named —
// so links to different origins coexist in one build. www is canonicalized
// to the bare production host.
const KNOWN_ORIGINS: KnownOrigin[] = [
  { hostname: "whimsical.com", port: "", origin: "https://whimsical.com" },
  {
    hostname: "www.whimsical.com",
    port: "",
    origin: "https://whimsical.com",
  },
];

if (typeof __WHIMSICAL_DEV_ORIGIN__ === "string") {
  const dev = new URL(__WHIMSICAL_DEV_ORIGIN__);
  KNOWN_ORIGINS.push({
    hostname: dev.hostname,
    port: dev.port,
    origin: dev.origin,
  });
}

// Mirrors the server's item-slug grammar exactly: an optional hyphenated
// title prefix, a 16-22 character id, and an optional "@"-suffixed id. The
// id alphabet excludes lowercase l, uppercase I/O, and digit 0 to avoid
// characters that are easily confused with one another.
const ITEM_SLUG_PATTERN =
  /^([a-zA-Z0-9-]+-)?[a-km-zA-HJ-NP-Z1-9]{16,22}(@[a-km-zA-HJ-NP-Z1-9]+)?$/;

// Workspace-prefixed URLs (https://whimsical.com/<workspace>/<item-slug>)
// carry the workspace slug as the first path segment. Segments matching
// known non-workspace routes must not be treated as workspace slugs.
const WORKSPACE_SLUG_PATTERN = /^[a-zA-Z0-9-]+$/;
const RESERVED_FIRST_SEGMENTS = new Set(["embed", "templates"]);

export function parseWhimsicalUrl(rawUrl: string): WhimsicalItemUrl | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") {
    return null;
  }
  if (url.username !== "" || url.password !== "") {
    return null;
  }
  const known = KNOWN_ORIGINS.find(
    (o) => o.hostname === url.hostname && o.port === url.port,
  );
  if (known === undefined) {
    return null;
  }

  const segments = url.pathname.slice(1).split("/");
  if (segments.length > 2) {
    return null;
  }
  const [first = "", second] = segments;
  const slug = second ?? first;
  if (second !== undefined) {
    if (
      !WORKSPACE_SLUG_PATTERN.test(first) ||
      RESERVED_FIRST_SEGMENTS.has(first)
    ) {
      return null;
    }
  }
  if (!ITEM_SLUG_PATTERN.test(slug)) {
    return null;
  }

  // Item ids are globally unique, so the workspace prefix is dropped: the
  // bare-slug URL resolves to the same item.
  return {
    slug,
    origin: known.origin,
    canonicalUrl: `${known.origin}/${slug}`,
  };
}

export function buildEmbedUrl(
  origin: string,
  slug: string,
  colorMode: EmbedColorMode,
): string {
  // login-mode=inline: Obsidian routes window.open to the system browser,
  // whose cookie jar this iframe can never read, so a login popup is
  // useless here — Whimbed navigates in-frame instead (and returns to this
  // embed URL after login). Unknown to older servers, which ignore it.
  return `${origin}/embed/${slug}?color-mode=${colorMode}&login-mode=inline`;
}
