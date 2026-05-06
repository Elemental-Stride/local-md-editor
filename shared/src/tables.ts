import type { InlineToken, TableBlock } from "./blocks.js";
import { parseInlines } from "./inlineParser.js";

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const inlineToHtml = (t: InlineToken): string => {
  switch (t.type) {
    case "text":
      return escapeHtml(t.value);
    case "strong":
      return `<strong>${t.children.map(inlineToHtml).join("")}</strong>`;
    case "em":
      return `<em>${t.children.map(inlineToHtml).join("")}</em>`;
    case "code":
      return `<code>${escapeHtml(t.value)}</code>`;
    case "link": {
      const titleAttr = t.title ? ` title="${escapeHtml(t.title)}"` : "";
      return `<a href="${escapeHtml(t.url)}"${titleAttr}>${
        t.children.map(inlineToHtml).join("")
      }</a>`;
    }
    case "image": {
      const titleAttr = t.title ? ` title="${escapeHtml(t.title)}"` : "";
      return `<img src="${escapeHtml(t.url)}" alt="${escapeHtml(t.alt)}"${titleAttr} />`;
    }
    case "break":
      return "<br />";
  }
};

// セルの markdown ソース（ユーザが `**bold**` や `[x](u)` のように入力した
// もの）を、テーブルブロックのシリアライズ形式である HTML に変換する。
// 改行は `<br />` に変換され、複数行セルが markdown 往復後も保持される
// （markdown テーブル / HTML セルは通常空白を畳み込むため）。
export const cellTextToHtml = (text: string): string => {
  if (text === "") return "";
  return text.split("\n").map((line) => parseInlines(line).map(inlineToHtml).join("")).join(
    "<br />",
  );
};

// TableBlock の構造化された行を正規の HTML 形式にレンダリングする。
// extension（永続化のためにドキュメントをシリアライズする際）と webview
// （編集中に block.source を rows と同期させ、ドキュメント全体の再パース時に
// reuseIds がブロックを照合できるように保つ）の両方で使用する。
export const tableBlockToHtml = (block: TableBlock): string => {
  const lines: string[] = ["<table>"];
  for (const row of block.rows) {
    lines.push("  <tr>");
    for (const cell of row.cells) {
      const tag = cell.isHeader ? "th" : "td";
      const attrs: string[] = [];
      if (cell.rowspan > 1) attrs.push(`rowspan="${cell.rowspan}"`);
      if (cell.colspan > 1) attrs.push(`colspan="${cell.colspan}"`);
      const attrStr = attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
      lines.push(`    <${tag}${attrStr}>${cellTextToHtml(cell.text)}</${tag}>`);
    }
    lines.push("  </tr>");
  }
  lines.push("</table>");
  return lines.join("\n");
};
