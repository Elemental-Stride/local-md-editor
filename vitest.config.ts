import { defineConfig } from "vitest/config";
import { CleanTreeReporter } from "./vitest.reporters.ts";

// 業界標準のしきい値。新規 / 既存ファイルが満たすべきデフォルト。
const STANDARD = { lines: 80, branches: 70, functions: 80 };

export default defineConfig({
  test: {
    reporters: [new CleanTreeReporter()],
    projects: ["./shared", "./webview", "./extension"],
    coverage: {
      provider: "v8",
      // include で指定したファイルは「テスト未到達でも計上」される (vitest 4 の
      // 既定挙動)。実体ある全コードに対する真の coverage を見るため、明示的に
      // 全 src を include。exclude で「そもそもテスト不要」と判断したファイル
      // (型のみ・薄ラッパ・index re-export) を除外。
      include: [
        "shared/src/**/*.ts",
        "extension/src/**/*.ts",
        "webview/src/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/__tests__/**",
        "**/*.test.{ts,tsx}",
        "**/index.ts", // re-export のみ
        "**/types/types.ts", // 型定義のみ
        "webview/src/main.tsx", // entry: createRoot のみ
        "webview/src/App.tsx", // 1 行 wrapper
        "extension/src/extension.ts", // 6 行の activate
        "webview/src/vscode.ts", // VS Code postMessage 薄ラッパ
        "webview/src/resources.ts", // VS Code resource 薄ラッパ
      ],
      reporter: ["text", "html"],
      // 全測定対象を STANDARD (line 80 / branch 70 / func 80) で gate
      thresholds: {
        "shared/src/**": STANDARD,
        "extension/src/**": STANDARD,
        "webview/src/**": STANDARD,
      },
    },
  },
});
