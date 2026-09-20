import { type Block, documentToMarkdown } from "@local-md-editor/shared";

// レンダリング済みの DOM 選択範囲を markdown に戻す。プレビュー上でコピー
// したときに `[text](url)` や `**bold**` を失わないために使う。
//
// 粒度は 2 通り。複数ブロックに跨る選択と、ブロック全体を覆う選択は、元の
// `source` をそのまま並べる（見出しの `#` やリストの `-` も保たれる）。
// ブロック内の一部だけを選んだ場合はインライン記法だけを復元する。

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

type RowSelection = {
  block: Block;
  content: HTMLElement;
  clipped: Range;
};

// 選択範囲の端が別のブロックにあるときは、この要素の端まで縮める。
// 端のノードが el の外（前のブロックや共通の祖先）を指すことがあるので、
// contains ではなく境界点の前後比較で判定する。
const clipToElement = (range: Range, el: HTMLElement): Range => {
  const clipped = document.createRange();
  clipped.selectNodeContents(el);
  const whole = clipped.cloneRange();
  if (range.compareBoundaryPoints(Range.START_TO_START, whole) > 0) {
    clipped.setStart(range.startContainer, range.startOffset);
  }
  if (range.compareBoundaryPoints(Range.END_TO_END, whole) < 0) {
    clipped.setEnd(range.endContainer, range.endOffset);
  }
  return clipped;
};

// 表示上のテキスト。リストのマーカー (• / 1.) は source 側に含まれるので除く。
const visibleText = (node: Node): string => {
  if (node.nodeType === TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType === ELEMENT_NODE && (node as Element).hasAttribute("data-md-marker")) {
    return "";
  }
  return Array.from(node.childNodes).map(visibleText).join("");
};

const childrenMarkdown = (node: Node): string =>
  Array.from(node.childNodes).map(inlineMarkdown).join("");

const imageMarkdown = (el: Element, url: string): string => {
  const alt = el.getAttribute("alt") ?? el.getAttribute("data-md-alt") ?? "";
  return `![${alt}](${url})`;
};

// インライン要素を markdown 記法へ戻す。未知の要素は透過的に子を辿るので、
// 装飾目的のラッパーが増えても中身を落とさない。
const inlineMarkdown = (node: Node): string => {
  if (node.nodeType === TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== ELEMENT_NODE) return childrenMarkdown(node);
  const el = node as HTMLElement;
  if (el.hasAttribute("data-md-marker")) return "";
  const url = el.getAttribute("data-md-url");
  if (url !== null) return imageMarkdown(el, url);
  switch (el.tagName.toLowerCase()) {
    case "br":
      return "\n";
    case "strong":
    case "b":
      return `**${childrenMarkdown(el)}**`;
    case "em":
    case "i":
      return `*${childrenMarkdown(el)}*`;
    case "code":
      return `\`${childrenMarkdown(el)}\``;
    case "a":
      return `[${childrenMarkdown(el)}](${el.getAttribute("href") ?? ""})`;
    case "img":
      return imageMarkdown(el, el.getAttribute("src") ?? "");
    default:
      return childrenMarkdown(el);
  }
};

const rowsInRange = (range: Range, blocks: readonly Block[]): RowSelection[] => {
  const out: RowSelection[] = [];
  for (const row of Array.from(document.querySelectorAll<HTMLElement>("[data-block-id]"))) {
    if (!range.intersectsNode(row)) continue;
    const block = blocks.find((b) => b.id === row.getAttribute("data-block-id"));
    if (!block) continue;
    const content = row.querySelector<HTMLElement>("[data-block-content]") ?? row;
    const clipped = clipToElement(range, content);
    // 行に触れているだけで文字を含まない端のブロックは落とす。
    if (clipped.collapsed) continue;
    out.push({ block, content, clipped });
  }
  return out;
};

const blocksToMarkdown = (blocks: Block[]): string =>
  documentToMarkdown({ blocks }).replace(/\n+$/, "");

export const selectionToMarkdown = (range: Range, blocks: readonly Block[]): string | null => {
  const rows = rowsInRange(range, blocks);
  if (rows.length === 0) return null;
  if (rows.length > 1) return blocksToMarkdown(rows.map((r) => r.block));

  const [row] = rows;
  // コードとテーブルは部分選択を markdown へ戻す意味がないので、ブラウザ
  // 既定のプレーンテキストコピーに任せる。
  if (row.block.kind === "code" || row.block.kind === "table") return null;

  const fragment = row.clipped.cloneContents();
  if (visibleText(fragment).trim() === visibleText(row.content).trim()) {
    return blocksToMarkdown([row.block]);
  }
  const md = inlineMarkdown(fragment);
  return md.trim() === "" ? null : md;
};
