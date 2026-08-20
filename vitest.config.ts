import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["test/setup.ts"],
  },
  resolve: {
    alias: {
      // The `obsidian` package is types-only ("main": ""), so anything
      // importing it needs a runtime stand-in under test.
      obsidian: new URL("./test/stubs/obsidian.ts", import.meta.url).pathname,
    },
  },
});
