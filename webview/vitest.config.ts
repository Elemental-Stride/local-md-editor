import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { CleanTreeReporter } from "../vitest.reporters.js";

export default defineConfig({
  resolve: {
    alias: {
      "@local-md-editor/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
    },
  },
  test: {
    name: "webview",
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    reporters: [new CleanTreeReporter()],
  },
});
