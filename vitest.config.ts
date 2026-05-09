import { defineConfig } from "vitest/config";
import { CleanTreeReporter } from "./vitest.reporters.ts";

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
      // 段階的にカバレッジを広げる方針なので global threshold は設けず、Phase 1
      // 対象ファイルにだけ業界標準 (line 80 / branch 70 / function 80) を gate
      // として課す。Phase 2 以降で対象ファイルが増えたらここに glob を追加する。
      thresholds: {
        // shared/src は Phase 1 で全ファイル網羅 (型のみと index は include / exclude 経由で対象外)
        "shared/src/**": { lines: 80, branches: 70, functions: 80 },
        // extension/src は markdown.ts のみ Phase 1 対象。markdownEditorProvider は Phase 3+
        "extension/src/markdown.ts": { lines: 80, branches: 70, functions: 80 },
        // webview の Phase 1 対象
        "webview/src/features/highlight/**": { lines: 80, branches: 70, functions: 80 },
        // webview の Phase 2 対象 (pure utilities)
        "webview/src/features/block/blockId.ts": { lines: 80, branches: 70, functions: 80 },
        "webview/src/features/block/blockTransforms.ts": { lines: 80, branches: 70, functions: 80 },
        "webview/src/features/block-menu/transformBlock.ts": {
          lines: 80,
          branches: 70,
          functions: 80,
        },
        // webview の Phase 2 対象 (hooks)
        "webview/src/features/editor/hooks/useDocumentHistory.ts": {
          lines: 80,
          branches: 70,
          functions: 80,
        },
        "webview/src/features/editor/hooks/useSearch.ts": {
          lines: 80,
          branches: 70,
          functions: 80,
        },
        "webview/src/features/editor/hooks/useActiveBlock.ts": {
          lines: 80,
          branches: 70,
          functions: 80,
        },
        // webview の Phase 3 対象 (主要 hook 群)
        "webview/src/features/editor/hooks/useBlockReconciliation.ts": {
          lines: 80,
          branches: 70,
          functions: 80,
        },
        "webview/src/features/editor/hooks/useBlockBuilders.ts": {
          lines: 80,
          branches: 70,
          functions: 80,
        },
        "webview/src/features/editor/hooks/useDocumentNavigation.ts": {
          lines: 80,
          branches: 70,
          functions: 80,
        },
        "webview/src/features/editor/hooks/useDocumentMutations.ts": {
          lines: 80,
          branches: 70,
          functions: 80,
        },
        "webview/src/features/editor/hooks/useDocumentSync.ts": {
          lines: 80,
          branches: 70,
          functions: 80,
        },
      },
    },
  },
});
