# CLAUDE.md

## プロジェクト概要

local-md-editor は、VS Code 向けのローカルファーストかつプライバシー重視の Notion ライク Markdown エディタです。

目的は、Markdown の互換性を維持しながら、快適なブロックベース編集体験を提供することです。

---

## コア思想

- Local First
- Privacy First
- No Telemetry
- No External Network Access
- Minimal Dependencies
- Markdown Compatibility
- Safe File Handling

---

## ディレクトリ構成

```txt
local-md-editor/
├ extension/        # VS Code Extension 本体
├ webview/          # React ベースのエディタ UI
├ shared/           # 共通型・共通ユーティリティ
```

---

## 技術スタック

### extension/

- TypeScript
- VS Code Extension API
- Custom Editor API
- esbuild

### webview/

- React
- TypeScript
- Tailwind CSS

### Markdown 処理

- remark
- remark-parse
- remark-stringify

---

## 開発ルール

### セキュリティ最優先

以下は禁止：

- telemetry
- analytics
- tracking
- 外部ネットワーク通信
- cloud sync
- `eval` の使用
- remote code execution
- 不要な依存追加

この拡張は完全オフラインで動作すること。

### ファイルアクセス方針

アクセス対象は、ユーザーが VS Code 上で明示的に開いたファイルのみ。

禁止事項：

- ワークスペース外スキャン
- バックグラウンドインデックス
- 無断ファイル解析

### Markdown 互換性

Markdown は、他ツールでも読める状態を維持すること。
独自ファイル形式は禁止。

基本構造：

```txt
Markdown <-> Block UI <-> Markdown
```

エディタ専用状態を Markdown 内へ独自形式で保存しない。

### Dependency Policy

依存パッケージは最小限にする。

依存追加前に確認すること：

- 本当に必要か
- 自前実装できないか
- 信頼性はあるか
- メンテされているか
- 不要な通信をしないか
- bundle size を増やしすぎないか

小さく、実績あるライブラリを優先。

---

## コーディング方針

- TypeScript strict mode を使用
- 共通データ構造は明示的型定義
- extension と webview の責務を分離
- shared に共通型を置く
- 過度な abstraction を避ける
- 可読性を優先
- 小さくテスト可能な関数を意識

---

## モジュール責務

### extension/ の責務

extension 側では以下を担当：

- VS Code activation
- Custom Editor 登録
- Markdown ファイル読み書き
- Webview lifecycle 管理
- Webview との message 通信
- CSP / security 制御

UI ロジックは持たせすぎない。

### webview/ の責務

webview 側では以下を担当：

- Markdown block rendering
- Block editing UI
- Slash command UI
- Drag and drop
- Keyboard interaction
- Editor state 管理

webview から直接 filesystem へアクセスしない。

### shared/ の責務

shared には以下を配置：

- message types
- block types
- markdown related types
- utility functions
- constants

---

## Webview Security

厳格な Content Security Policy を使用。

禁止事項：

- remote script
- CDN asset
- arbitrary script execution

すべて local bundle で提供する。

---

## MVP 範囲

最初の MVP で実装するもの：

- `.md` を custom editor で開く
- Block rendering
- Paragraph 編集
- Heading 編集
- Bullet list 編集
- Checkbox 編集
- Markdown 保存
- Offline 動作

高度機能は MVP 安定後。

---

## 将来機能候補

- Slash commands
- Drag & drop block movement
- Code block editor
- Table support
- Keyboard-first editing
- Command palette
- Lightweight search

---

## やらないこと

以下は避ける：

- Notion 完全クローン化
- アカウント機能
- Cloud sync
- 独自保存形式
- 過剰な framework 導入
- Network 前提機能
- 過度な設計

---

## プロダクトポジション

> Notion-like comfort × Local-first editing × Safety

安全性そのものがプロダクト価値。

技術選定・設計判断は、必ずこの思想に沿うこと。
