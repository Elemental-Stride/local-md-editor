import { defineConfig } from "vitest/config";
import { CleanTreeReporter } from "./vitest.reporters.ts";

export default defineConfig({
  test: {
    reporters: [new CleanTreeReporter()],
    projects: ["./shared", "./webview", "./extension"],
  },
});
