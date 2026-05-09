import { defineConfig } from "vitest/config";
import { CleanTreeReporter } from "../vitest.reporters.ts";

export default defineConfig({
  test: {
    name: "shared",
    environment: "node",
    include: ["src/**/*.test.ts"],
    reporters: [new CleanTreeReporter()],
  },
});
