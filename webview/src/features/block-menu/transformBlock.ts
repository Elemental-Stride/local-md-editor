import type { Block, ParagraphBlock } from "@local-md-editor/shared";
import { contentOf } from "../block/blockTransforms.js";

// 変換可能なブロック種別。code/table 等は kind だけで完結しない構造を持つので、
// この一覧 (= block menu の「○○ に変換」UI) と一対一対応する文字列キー。
export type TransformKind =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "ordered"
  | "todo"
  | "code"
  | "quote"
  | "divider";

// ブロックを別の kind へ変換する。可能な範囲で本文テキストを保持する。
// - 区切り線は内容を持たないため本文を捨てる
// - code への変換は value/source 両方を本文で初期化（lang は空）
// - table からの変換は contentOf が空文字を返すので本文は失われる（許容）
export const transformBlock = (b: Block, kind: TransformKind): Block => {
  const id = b.id;
  const text = b.kind === "code" ? b.value : contentOf(b);
  switch (kind) {
    case "paragraph":
      return { id, kind: "paragraph", source: text, inlines: [] } satisfies ParagraphBlock;
    case "h1":
      return { id, kind: "heading", level: 1, source: `# ${text}`, inlines: [] };
    case "h2":
      return { id, kind: "heading", level: 2, source: `## ${text}`, inlines: [] };
    case "h3":
      return { id, kind: "heading", level: 3, source: `### ${text}`, inlines: [] };
    case "bullet":
      return { id, kind: "bulletItem", source: `- ${text}`, inlines: [] };
    case "ordered":
      return { id, kind: "orderedItem", source: `1. ${text}`, inlines: [] };
    case "todo":
      return { id, kind: "taskItem", checked: false, source: `- [ ] ${text}`, inlines: [] };
    case "code":
      return { id, kind: "code", lang: "", value: text, source: text };
    case "quote":
      return { id, kind: "blockquote", source: `> ${text}` };
    case "divider":
      return { id, kind: "thematicBreak", source: "---" };
  }
};
