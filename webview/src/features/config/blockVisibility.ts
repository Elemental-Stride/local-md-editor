import type { Block, EditorConfig } from "@local-md-editor/shared";

// Editor 上で当該ブロックを描画しないかどうかを判定する。
// 判定対象は html ノードのうち `<!--` で始まるもの (= HTML コメント) のみ。
// `<div>` 等の素の HTML タグは従来どおり描画する。
// ファイル本体には残るため、markdownlint 等の他ツールは影響を受けない。
export const isHiddenBlock = (block: Block, config: EditorConfig): boolean => {
  if (block.kind === "html" && config.compatibility.hideHtmlComments) {
    return block.source.trim().startsWith("<!--");
  }
  return false;
};
