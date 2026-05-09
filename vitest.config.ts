import { defineConfig } from "vitest/config";
import { CleanTreeReporter } from "./vitest.reporters.js";

export default defineConfig({
  test: {
    reporters: [new CleanTreeReporter()],
    projects: ["./shared", "./webview", "./extension"],
  },
});
