import type { Block, BlockId, ParagraphBlock } from "@local-md-editor/shared";

const makeBlockId = (): BlockId =>
  `wb${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const emptyParagraph = (): ParagraphBlock => ({
  id: makeBlockId(),
  kind: "paragraph",
  source: "",
  inlines: [],
});

const indentOf = (
  block: Block,
): string => ("source" in block ? (block.source.match(/^( *)/)?.[0] ?? "") : "");

// 既存ブロックの kind / インデント / マーカーを保ったまま、本文だけを
// 差し替えた `source` を組み立てる。新しい兄弟ブロックを作る際の
// テンプレ生成にも使う。
const sourceWithContent = (block: Block, content: string): string => {
  switch (block.kind) {
    case "heading":
      return `${"#".repeat(block.level)} ${content}`;
    case "bulletItem":
      return `${indentOf(block)}- ${content}`;
    case "orderedItem": {
      const m = block.source.match(/^(\s*)(\d+[.)])\s/);
      const indent = m?.[1] ?? indentOf(block);
      const marker = m?.[2] ?? "1.";
      return `${indent}${marker} ${content}`;
    }
    case "taskItem":
      return `${indentOf(block)}- [${block.checked ? "x" : " "}] ${content}`;
    default:
      return content;
  }
};

// 番号付きリストの次の項目用のマーカー。元が `3.` なら `4.`、`3)` なら `4)`。
const nextOrderedMarker = (current: Block): { indent: string; marker: string; } => {
  const indent = indentOf(current);
  const m = "source" in current
    ? current.source.match(/^(\s*)(\d+)([.)])\s/)
    : null;
  if (!m) return { indent, marker: "1." };
  return {
    indent: m[1],
    marker: `${parseInt(m[2], 10) + 1}${m[3]}`,
  };
};

// Enter で次の兄弟ブロックを作るときの雛形。リスト系は同じ kind を引き継ぎ、
// それ以外は段落へ落とす。
const createSiblingWithContent = (current: Block, content: string): Block => {
  const indent = indentOf(current);
  switch (current.kind) {
    case "bulletItem":
      return {
        id: makeBlockId(),
        kind: "bulletItem",
        source: `${indent}- ${content}`,
        inlines: [],
      };
    case "orderedItem": {
      const { indent: i, marker } = nextOrderedMarker(current);
      return {
        id: makeBlockId(),
        kind: "orderedItem",
        source: `${i}${marker} ${content}`,
        inlines: [],
      };
    }
    case "taskItem":
      return {
        id: makeBlockId(),
        kind: "taskItem",
        checked: false,
        source: `${indent}- [ ] ${content}`,
        inlines: [],
      };
    default:
      return {
        id: makeBlockId(),
        kind: "paragraph",
        source: content,
        inlines: [],
      };
  }
};

export type BlockBuilders = {
  makeBlockId: () => BlockId;
  emptyParagraph: () => ParagraphBlock;
  indentOf: (block: Block) => string;
  sourceWithContent: (block: Block, content: string) => string;
  nextOrderedMarker: (current: Block) => { indent: string; marker: string; };
  createSiblingWithContent: (current: Block, content: string) => Block;
};

const BUILDERS: BlockBuilders = {
  makeBlockId,
  emptyParagraph,
  indentOf,
  sourceWithContent,
  nextOrderedMarker,
  createSiblingWithContent,
};

// 純関数の集まりだが、利用側を hook 経由で統一したいため wrapper にする。
// 中身は不変の参照を返す（毎レンダ同じオブジェクト）。
export const useBlockBuilders = (): BlockBuilders => BUILDERS;
