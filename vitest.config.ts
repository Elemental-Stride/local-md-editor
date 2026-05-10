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
      // 部分カバーの個別調整以外は全て STANDARD (line 80 / branch 70 / func 80)。
      // ディレクトリ単位で全ファイルが STANDARD を満たせる場所は glob でまとめ、
      // 新規ファイルが追加されたときに自動的に gate される形にする。
      thresholds: {
        // === 全ファイル STANDARD のディレクトリ (glob) ===
        "shared/src/**": STANDARD,
        "extension/src/**": STANDARD,
        "webview/src/features/code-block/**": STANDARD,
        "webview/src/features/editor/hooks/**": STANDARD,
        "webview/src/features/highlight/**": STANDARD,
        "webview/src/features/inline-render/**": STANDARD,
        "webview/src/features/link-modal/**": STANDARD,
        "webview/src/features/mermaid/**": STANDARD,
        "webview/src/features/slash-menu/**": STANDARD,
        "webview/src/features/table/**": STANDARD,
        // block/ は top-level (BlockView/Editor/RenderedBlock + blockId/blockTransforms) は STANDARD
        // hooks/ は useBlockEditing が非標準なので個別に列挙する
        "webview/src/features/block/*.{ts,tsx}": STANDARD,

        // === 混在ディレクトリ内の STANDARD 達成ファイル (個別) ===
        "webview/src/features/block-menu/transformBlock.ts": STANDARD,
        "webview/src/features/block/hooks/useBlockKeyHandler.ts": STANDARD,
        "webview/src/features/block/hooks/useImageDrop.ts": STANDARD,

        // === branch のみ standard 未達のファイル (line / func は STANDARD) ===
        "webview/src/features/block-menu/BlockMenu.tsx": {
          ...STANDARD,
          branches: 60,
        },
        "webview/src/features/search/SearchPanel.tsx": {
          ...STANDARD,
          branches: 60,
        },
        "webview/src/features/block/hooks/useBlockEditing.ts": {
          ...STANDARD,
          branches: 40,
        },
      },
    },
  },
});
