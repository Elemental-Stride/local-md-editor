import { defineConfig } from "vitest/config";
import { CleanTreeReporter } from "../../vitest.reporters.ts";

// CI 用スクリプト (.github/scripts) のテスト。拡張本体のコードではないので
// coverage threshold の対象外 (ルート vitest.config.ts の include に入れていない)。
export default defineConfig({
  test: {
    name: "scripts",
    environment: "node",
    include: ["**/*.test.mjs"],
    reporters: [new CleanTreeReporter()],
  },
});
