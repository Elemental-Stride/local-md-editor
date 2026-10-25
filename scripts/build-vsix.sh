#!/usr/bin/env bash
#
# ソースから .vsix を 1 コマンドで生成する。
#
#   ./scripts/build-vsix.sh
#
# 依存インストール時だけ npm registry と通信する。拡張機能自体は
# 実行時に一切通信しない (PRIVACY.md を参照)。

set -euo pipefail

# どこから呼ばれても動くように、スクリプト位置からリポジトリルートを決める。
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

readonly REQUIRED_NODE_MAJOR=20

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m警告:\033[0m %s\n' "$1" >&2; }
die() {
  printf '\033[1;31mエラー:\033[0m %s\n' "$1" >&2
  exit 1
}

info "前提ツールを確認します"

command -v node >/dev/null 2>&1 || die "Node.js が見つかりません。https://nodejs.org から v${REQUIRED_NODE_MAJOR} 以上を入れてください。"

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt "$REQUIRED_NODE_MAJOR" ]; then
  die "Node.js v${REQUIRED_NODE_MAJOR} 以上が必要です (検出: $(node -v))。"
fi

# pnpm のバージョンは package.json の packageManager でピンしてある。
# corepack 経由ならそのピンが効くので、素の pnpm より優先する。
if command -v corepack >/dev/null 2>&1; then
  pnpm_cmd=(corepack pnpm)
elif command -v pnpm >/dev/null 2>&1; then
  pnpm_cmd=(pnpm)
  warn "corepack が無いため、PATH 上の pnpm $(pnpm -v) を使います。package.json でピンしたバージョンとは異なる可能性があります。"
else
  die "pnpm も corepack も見つかりません。Node.js v${REQUIRED_NODE_MAJOR}+ に同梱の corepack を有効化してください: corepack enable"
fi

info "依存をインストールします (lockfile 固定)"
"${pnpm_cmd[@]}" install --frozen-lockfile

info "shared / extension / webview をビルドします"
"${pnpm_cmd[@]}" build

info "vsce で .vsix を生成します"
cd extension
"${pnpm_cmd[@]}" exec vsce package --no-dependencies

vsix_path="$(ls -t "$REPO_ROOT"/extension/*.vsix | head -n 1)"

cat <<EOF

完了しました。

  $vsix_path

VS Code へ入れる場合:

  code --install-extension "$vsix_path"
EOF
