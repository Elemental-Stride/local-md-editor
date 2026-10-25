// vsce 用に README / LICENSE / CHANGELOG を extension/ へ配置する
// (extension/package.json の vscode:prepublish から呼ばれる)。
//
// README のバッジはローカル SVG を相対パスで参照している。GitHub でも
// エディタ上でも同じ見た目になる代わりに、vsce は Marketplace の制約から
// README 内の SVG を拒否するため、バッジ範囲だけを落としたコピーを渡す。

import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = join(repoRoot, "extension");

const BADGE_BLOCK = /<!-- badges:start -->[\s\S]*?<!-- badges:end -->\n\n/;

for (const name of ["LICENSE", "CHANGELOG.md"]) {
  copyFileSync(join(repoRoot, name), join(extensionDir, name));
}

const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
if (!BADGE_BLOCK.test(readme)) {
  throw new Error(
    "README.md に <!-- badges:start --> / <!-- badges:end --> が見つかりません。"
      + "マーカーを消すと SVG バッジが Marketplace 用 README に残り、vsce が失敗します。",
  );
}
writeFileSync(join(extensionDir, "README.md"), readme.replace(BADGE_BLOCK, ""));
