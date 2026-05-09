import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { CleanTreeReporter } from "../vitest.reporters.ts";

export default defineConfig({
  resolve: {
    alias: {
      "@local-md-editor/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
    },
  },
  test: {
    name: "extension",
    environment: "node",
    include: ["src/**/*.test.ts"],
    reporters: [new CleanTreeReporter()],
  },
});
