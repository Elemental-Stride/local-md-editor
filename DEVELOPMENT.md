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

## 依存更新とセキュリティ

依存の更新は Dependabot に任せています。設定は [.github/dependabot.yml](./.github/dependabot.yml)。

| 種類       | 契機                         | PR を作るもの                                             |
| ---------- | ---------------------------- | --------------------------------------------------------- |
| 脆弱性修正 | Advisory Database で検知次第 | Dependabot security updates（リポジトリ設定で有効化済み） |
| 定期更新   | 毎週月曜 09:00 (Asia/Tokyo)  | Dependabot version updates（`.github/dependabot.yml`）    |

Dependabot の PR は英語でしか作られないため、[.github/workflows/dependabot-ja.yml](./.github/workflows/dependabot-ja.yml) がタイトルと本文を日本語へ差し替えます（原文は本文の details 内に残るので情報は失われません）。翻訳 API は使わず、Dependabot が commit message に書く機械可読な更新情報（`updated-dependencies` ブロック）を定型文へ差し込む方式です。外部サービスに依存せず、同じ入力から常に同じ文面になります。

ロジックは [.github/scripts/dependabot-ja/](./.github/scripts/dependabot-ja/) にあり、`pnpm vitest run --project scripts` でテストできます。

### 公開 7 日ルール（minimumReleaseAge）との関係

`pnpm-workspace.yaml` の `minimumReleaseAge: 10080` により、公開から 7 日未満のバージョンは install 自体が拒否されます。Dependabot 側にも同じ待機期間（`cooldown.default-days: 7`）を設定していますが、**security updates は cooldown の対象外**です。そのため公開直後の修正版を掴んだ PR は lockfile 更新に失敗することがあります。その場合は次のいずれかを選び、判断の理由を PR に残してください。

1. 7 日経過を待ち、PR に `@dependabot recreate` とコメントして作り直す
2. 緊急時のみ、`pnpm-workspace.yaml` の `minimumReleaseAgeExclude` に対象パッケージを一時追加して手動更新する（マージ後に除外を戻す）

### range 内で直せない脆弱性の扱い

修正版が親パッケージの semver range 外にしか無い場合は、`pnpm-workspace.yaml` の `overrides` で強制的に上げる。ただし major を跨ぐ override は親パッケージの内部実装を壊しうるので、「脆弱性の実リスク > override のリスク」と言える場合だけ入れる。入れたら必ず `pnpm build` と `pnpm test` で確認し、親側が十分新しいバージョンを引くようになったらエントリを削除する。

pnpm 10.33.4 には 2 つの落とし穴がある。

- `overrides` に範囲（`^8.1.6` / `>=8.1.6`）を書いても transitive dependency の解決には反映されない（peer 検査にしか効かず、`unmet peer` の警告だけが出る）。**完全固定で書くこと。**
- 既存 lockfile の解決が再利用されるため、`pnpm install` や `pnpm dedupe` では override が反映されない。lockfile を作り直す。

```bash
rm pnpm-lock.yaml
pnpm install --lockfile-only --no-frozen-lockfile
pnpm install
```

### 手元での確認

```bash
pnpm audit                      # 既知の脆弱性を一覧
pnpm audit --audit-level high   # high 以上のみ
```

`pnpm audit` は npm registry の advisory API を参照するため通信します（開発時のコマンドのみ。拡張本体は通信しません）。

## パッケージング

`extension/` 配下で vsce パッケージを生成します。`vscode:prepublish` がリポジトリルートの `README.md` / `LICENSE` / `CHANGELOG.md` を `extension/` にコピーするので、これらは extension/ では編集せずルートで編集してください。

```bash
cd extension
pnpm package    # local-md-editor-<version>.vsix を出力
pnpm publish    # vsce publish で marketplace に公開
```

### ワンコマンドでのビルド

リポジトリを落としてきた人がそのまま `.vsix` を作れるよう、前提ツールの確認からパッケージングまでを通すスクリプトを置いてあります。

```bash
./scripts/build-vsix.sh
```

Node.js のバージョン確認 → `pnpm install --frozen-lockfile` → `pnpm build` → `vsce package` を順に実行し、生成された `.vsix` のパスとインストールコマンドを表示します。pnpm のバージョンは `packageManager` でピンしてあるため、corepack があればそちら経由で実行します。

### `@types/vscode` は `engines.vscode` と同じ版に固定する

vsce は `@types/vscode` が `engines.vscode` より新しいとパッケージングを拒否する。宣言が最低サポート版より新しいと、その版に無い API を使ったコードが型チェックを通ってしまい、古い VS Code で実行時エラーになるため。

caret 付き (`^1.90.0`) では 1.x の最新が解決されてこの歯止めが効かないので、完全固定 (`1.90.0`) で書く。`engines.vscode` を上げるときに手で同じ値へ揃える。Dependabot は `@types/vscode` を ignore 対象にしてある ([.github/dependabot.yml](./.github/dependabot.yml))。
