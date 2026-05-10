# 開発者向けガイド

Local MD Editor のソースコードからのビルド・開発手順です。エンドユーザー向けの利用方法は [README.md](./README.md) を参照してください。

## 必要環境

- Node.js >= 20
- pnpm >= 10
- VS Code >= 1.90

## セットアップ

```bash
pnpm install
pnpm build
```

## 開発

VS Code でこのフォルダを開き、`F5`（Run Extension）で拡張ホストを起動。 新しい VS Code ウィンドウで `.md` を「アプリケーションで開く」→ `Local MD Editor` を選択。

ウォッチモードで開発する場合：

```bash
pnpm dev
```

## スクリプト

| コマンド            | 内容                                  |
| ------------------- | ------------------------------------- |
| `pnpm build`        | shared / extension / webview をビルド |
| `pnpm dev`          | extension と webview をウォッチ       |
| `pnpm typecheck`    | 全パッケージで型チェック              |
| `pnpm lint`         | oxlint でリント                       |
| `pnpm format`       | dprint でフォーマット                 |
| `pnpm format:check` | フォーマット差分チェック              |
| `pnpm test`         | vitest でテスト実行                   |
| `pnpm clean`        | ビルド成果物を削除                    |

## 構成

```txt
local-md-editor/
├ shared/      # ブロック型 / メッセージ型（依存ゼロ）
├ extension/   # VS Code 拡張本体（Custom Editor、Markdown ↔ Block 変換）
└ webview/     # React + Tailwind 製エディタ UI
```

責務分離の方針：

- **extension** がファイル I/O と `remark` による Markdown ↔ Block 変換を担当
- **webview** はブロック JSON を受け取って描画・編集するのみで、ファイルシステムには触れない
- **shared** には両者で共有する型と定数のみを置く

技術選定や設計方針は [.claude/CLAUDE.md](./.claude/CLAUDE.md) を参照。

## パッケージング

`extension/` 配下で vsce パッケージを生成します。`vscode:prepublish` がリポジトリルートの `README.md` / `LICENSE` / `CHANGELOG.md` を `extension/` にコピーするので、これらは extension/ では編集せずルートで編集してください。

```bash
cd extension
pnpm package    # local-md-editor-<version>.vsix を出力
pnpm publish    # vsce publish で marketplace に公開
```
