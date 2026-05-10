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

// TableBlock を GFM パイプテーブルとしてシリアライズする。表現できない構造
// （rowspan/colspan あり、ヘッダ行なし、セルに改行あり、列数不一致、空テーブル）
// のときは null を返し、呼び出し側に HTML フォールバックを促す。GFM はヘッダ行を
// 必須としているため、最初の行がすべて header かどうかで判定する。
export const tableBlockToMarkdown = (block: TableBlock): string | null => {
  const rows = block.rows;
  if (rows.length === 0) return null;

  const colCount = rows[0].cells.length;
  if (colCount === 0) return null;

  for (const row of rows) {
    if (row.cells.length !== colCount) return null;
    for (const cell of row.cells) {
      if (cell.rowspan > 1 || cell.colspan > 1) return null;
      if (cell.text.includes("\n")) return null;
    }
  }

  if (!rows[0].cells.every((c) => c.isHeader)) return null;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].cells.some((c) => c.isHeader)) return null;
  }

  const escapeCell = (text: string): string => text.replace(/\|/g, "\\|");
  const renderRow = (cells: TableBlock["rows"][number]["cells"]): string =>
    `| ${cells.map((c) => escapeCell(c.text)).join(" | ")} |`;

  const lines: string[] = [];
  lines.push(renderRow(rows[0].cells));
  lines.push(`| ${rows[0].cells.map(() => "---").join(" | ")} |`);
  for (let i = 1; i < rows.length; i++) {
    lines.push(renderRow(rows[i].cells));
  }
  return lines.join("\n");
};
