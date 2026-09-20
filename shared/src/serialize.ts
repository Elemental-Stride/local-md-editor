import type { Block, Document } from "./blocks.js";
import { tableBlockToHtml, tableBlockToMarkdown } from "./tables.js";

// 意図的な空段落（Notion 風の空行スペーサ）を往復させるためのマーカー。
// シリアライズ時は単独行に `\` を出力し、パース時は中身が単一のバック
// スラッシュだけの段落を検出して source: "" に正規化するので、エディタ
// 上では空行として表示される。
export const EMPTY_PARAGRAPH_MARKER = "\\";

const listFamily = (b: Block): "unordered" | "ordered" | null => {
  if (b.kind === "bulletItem" || b.kind === "taskItem") return "unordered";
  if (b.kind === "orderedItem") return "ordered";
  return null;
};

const separatorBetween = (a: Block, b: Block): string => {
  const fa = listFamily(a);
  if (fa !== null && fa === listFamily(b)) return "\n";
  return "\n\n";
};

// `value` 内のバッククォート連続でフェンスが早期に閉じられないよう、
// 十分な長さのフェンスを選ぶ。デフォルトは 3、必要に応じて (最長連続 + 1)
// まで増える。
const fenceFor = (value: string): string => {
  let max = 0;
  let cur = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "`") {
      cur++;
      if (cur > max) max = cur;
    } else {
      cur = 0;
    }
  }
  return "`".repeat(Math.max(3, max + 1));
};

const codeBlockSource = (b: { lang: string; value: string; }): string => {
  const fence = fenceFor(b.value);
  return `${fence}${b.lang}\n${b.value}\n${fence}`;
};

// テーブルはシリアライズ時に特別扱いする: 構造的な編集（セルテキスト、
// rowspan/colspan の変更）後は `source` が古くなる可能性があるため、常に
// 生きた構造から正規 HTML を再生成する。コードブロックも同様に (lang, value)
// から再生成し、webview での編集が正しく往復するようにする。
const blockSource = (b: Block): string => {
  // パイプ形式で表現可能な単純構造ならパイプを優先、そうでなければ HTML。
  // rowspan/colspan・改行セル・ヘッダ行不整合などは tableBlockToMarkdown が
  // null を返すので、その場合は HTML フォールバックで構造を保つ。
  if (b.kind === "table") return tableBlockToMarkdown(b) ?? tableBlockToHtml(b);
  if (b.kind === "code") return codeBlockSource(b);
  // 意図的な空段落は、ハード改行風のプレースホルダで保存して markdown
  // 往復時に消えないようにする（markdown は連続する空行を畳み込むため）。
  // EMPTY_PARAGRAPH_MARKER を参照。
  if (b.kind === "paragraph" && b.source === "") return EMPTY_PARAGRAPH_MARKER;
  return b.source;
};

export const documentToMarkdown = (doc: Document): string => {
  if (doc.blocks.length === 0) return "";
  const parts: string[] = [];
  for (let i = 0; i < doc.blocks.length; i++) {
    parts.push(blockSource(doc.blocks[i]));
    if (i < doc.blocks.length - 1) {
      parts.push(separatorBetween(doc.blocks[i], doc.blocks[i + 1]));
    }
  }
  parts.push("\n");
  return parts.join("");
};
