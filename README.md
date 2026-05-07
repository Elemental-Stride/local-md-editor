# local-md-editor

VS Code 向けのローカルファースト・プライバシー重視な Notion ライク Markdown エディタ。

Markdown 互換性を保ちながら、ブロックベースの編集体験を提供します。

## 特長

- **Local First** — すべての編集はローカルで完結
- **Privacy First** — テレメトリ・解析・外部通信なし
- **Markdown 互換** — 独自フォーマットを使わず、他ツールでも読める
- **Safe by Design** — 厳格な CSP、ローカルバンドルのみ

詳細は [PRIVACY.md](./PRIVACY.md) を参照。

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

## 使い方

`.md` を「アプリケーションで開く」から `Local MD Editor` を選択するとブロックエディタで開きます。

### スラッシュコマンドでブロックを挿入・変換

空のブロックで `/` を入力するとメニューが開き、`↑` `↓` で選択 / `Enter` で確定します。

| コマンド          | 種別             |
| ----------------- | ---------------- |
| `/text`           | 段落             |
| `/h1` `/h2` `/h3` | 見出し           |
| `/list`           | 箇条書き         |
| `/numbered`       | 番号付きリスト   |
| `/todo`           | チェックボックス |
| `/divider`        | 区切り線         |
| `/table`          | テーブル         |

行頭で Markdown 記法（`#`、`-`、`1.`、`- [ ]` の後ろに半角スペース）を直接タイプしてもブロック種別が自動で切り替わります。

### キーボード操作

| キー                  | 動作                                                 |
| --------------------- | ---------------------------------------------------- |
| `Enter`               | カーソル位置でブロックを分割                         |
| `Shift + Enter`       | ブロック内で改行                                     |
| `Cmd / Ctrl + Enter`  | 直後に新しい段落を挿入                               |
| `Tab` / `Shift + Tab` | インデント / アンインデント                          |
| `Backspace`（行頭で） | リスト・見出しを段落に降格、空なら前のブロックへ移動 |
| `Esc`                 | 編集を終了                                           |

### ブロックの並べ替え

ブロックの左側にホバーで現れる `⋮⋮` ハンドルをドラッグして並べ替えできます。

### インライン書式

Markdown 記法をそのまま書けます: `**太字**` / `*イタリック*` / `` `コード` `` / `[ラベル](URL)`。

## スクリプト

| コマンド            | 内容                                  |
| ------------------- | ------------------------------------- |
| `pnpm build`        | shared / extension / webview をビルド |
| `pnpm dev`          | extension と webview をウォッチ       |
| `pnpm typecheck`    | 全パッケージで型チェック              |
| `pnpm lint`         | oxlint でリント                       |
| `pnpm format`       | dprint でフォーマット                 |
| `pnpm format:check` | フォーマット差分チェック              |
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

## MVP 範囲

- `.md` を Custom Editor で開く
- 段落 / 見出し / 箇条書き / チェックボックスの編集
- Markdown として保存
- オフライン動作

## やらないこと

- アカウント機能 / クラウド同期
- 独自ファイル形式
- 外部ネットワーク通信を前提とした機能

## ライセンス

MIT
