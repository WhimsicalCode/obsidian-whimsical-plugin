import js from "@eslint/js";
import json from "@eslint/json";
import globals from "globals";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

// `js.configs.recommended`, `tseslint.configs.recommended`, and
// `obsidianmd.configs.recommended` each include entries with no `files`
// property. An unscoped entry applies to every file the linter processes,
// including JSON files matched by the `**/*.json` block below. Some of
// those unscoped entries carry core ESLint rules (e.g.
// `no-irregular-whitespace`) that assume a JS/TS-like SourceCode API and
// crash fatally when run against the JSON language. Entries that already
// declare their own `files` (js-only, ts-only, `package.json`-only, etc.)
// are correct as-is and must stay untouched; only the genuinely unscoped,
// rule-bearing entries need to be confined to code files.
const CODE_GLOBS = ["**/*.ts", "**/*.js", "**/*.mjs", "**/*.cjs"];
const scopeToCode = (config) =>
  config.files ? config : { ...config, files: CODE_GLOBS };

export default tseslint.config(
  {
    ignores: [
      "main.js",
      "node_modules/**",
      ".superpowers/**",
      "scratch/**",
      "package-lock.json",
    ],
  },
  scopeToCode(js.configs.recommended),
  ...tseslint.configs.recommended.map(scopeToCode),
  ...obsidianmd.configs.recommended.map(scopeToCode),
  {
    // prefer-create-el assumes Obsidian's DOM helpers exist; it only
    // makes sense for plugin runtime code under src/. The test harness is
    // exactly where they don't apply: test/setup.ts *implements* those
    // helpers (it must call the raw DOM APIs), and test fixtures build the
    // DOM shapes Obsidian's renderer would hand the plugin. Scoped off
    // here in config because inline eslint-disable comments are rejected
    // by Obsidian's plugin review.
    files: ["test/**/*.ts"],
    rules: {
      "obsidianmd/prefer-create-el": "off",
    },
  },
  {
    // Scoped to exactly the files tsconfig.json's `include` covers.
    // Root-level TS config files (vitest.config.ts, etc.) are intentionally
    // outside that program, so type-aware parserOptions.project must not be
    // applied to them or the parser fails with a fatal "file not found in
    // any of the provided project(s)" error.
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
      },
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // vitest.config.ts is a root-level tooling file outside tsconfig.json's
    // `include`, but the ts-only glob entries in tseslint.configs.recommended
    // and obsidianmd.configs.recommended (correctly scoped for src/test) still
    // match it, and some of those rules (from both @typescript-eslint and
    // eslint-plugin-obsidianmd) require type information. `projectService`
    // with `allowDefaultProject` is typescript-eslint's documented mechanism
    // for exactly this case: it builds a synthetic single-file program for
    // named out-of-tsconfig files instead of erroring or leaving type-aware
    // rules with no parser services to call.
    files: ["vitest.config.ts"],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["vitest.config.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.json"],
    language: "json/json",
    plugins: {
      json,
    },
    rules: {
      ...json.configs.recommended.rules,
    },
  },
);
