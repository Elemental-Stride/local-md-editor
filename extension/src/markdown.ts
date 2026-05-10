import {
  type Block,
  type BulletItemBlock,
  type CodeBlock,
  type Document,
  type HeadingBlock,
  type InlineToken,
  type OrderedItemBlock,
  type ParagraphBlock,
  type RawBlock,
  type TableBlock,
  tableBlockToHtml,
  tableBlockToMarkdown,
  type TableCell,
  type TableRow,
  type TaskItemBlock,
} from "@local-md-editor/shared";
import type { List, PhrasingContent, Root, RootContent, Table } from "mdast";
import { type HTMLElement as ParsedHtmlElement, parse as parseHtml } from "node-html-parser";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

const parser = unified().use(remarkParse).use(remarkGfm);

let counter = 0;
const newId = (): string => `b${Date.now().toString(36)}-${(counter++).toString(36)}`;

const flattenText = (nodes: PhrasingContent[]): string => {
  let out = "";
  for (const n of nodes) {
    if (n.type === "text") out += n.value;
    else if ("children" in n) out += flattenText(n.children as PhrasingContent[]);
  }
  return out;
};

const buildInline = (node: PhrasingContent): InlineToken => {
  switch (node.type) {
    case "text":
      return { type: "text", value: node.value };
    case "strong":
      return { type: "strong", children: buildInlines(node.children) };
    case "emphasis":
      return { type: "em", children: buildInlines(node.children) };
    case "inlineCode":
      return { type: "code", value: node.value };
    case "link":
      return {
        type: "link",
        url: node.url,
        title: node.title ?? undefined,
        children: buildInlines(node.children),
      };
    case "image":
      return {
        type: "image",
        url: node.url,
        alt: node.alt ?? "",
        title: node.title ?? undefined,
      };
    case "break":
      return { type: "break" };
    default:
      return {
        type: "text",
        value: "children" in node ? flattenText(node.children as PhrasingContent[]) : "",
      };
  }
};

const buildInlines = (nodes: PhrasingContent[]): InlineToken[] => nodes.map(buildInline);

const rawKindOf = (type: RootContent["type"]): RawBlock["kind"] => {
  switch (type) {
    case "blockquote":
    case "thematicBreak":
    case "html":
      return type;
    default:
      return "other";
  }
};

const TABLE_PREFIX_RE = /^\s*<table[\s>]/i;

// セル配下の HTML を辿り、ユーザが編集した markdown ソースを復元する。
// node-html-parser はテキストノード (nodeType 3) を既にデコード済みの
// `.text` で、要素ノード (nodeType 1) を `.tagName`/`.childNodes` で公開する。
// インライン書式タグ (<strong>/<em>/<code>/<a>) は対応する markdown マーカー
// に戻し、<br> は `\n` に変換する。未知の要素は透過的に走査するので、認識
// していないラッパー要素があっても中身を落とさない。
const cellHtmlToText = (cellEl: ParsedHtmlElement): string => {
  let out = "";
  const walk = (node: unknown): void => {
    const n = node as {
      nodeType?: number;
      tagName?: string;
      text?: string;
      childNodes?: unknown[];
      getAttribute?: (k: string) => string | undefined;
    };
    if (n.nodeType === 3) {
      out += n.text ?? "";
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = (n.tagName ?? "").toLowerCase();
    const kids = n.childNodes ?? [];
    if (tag === "br") {
      out += "\n";
      return;
    }
    if (tag === "strong" || tag === "b") {
      out += "**";
      for (const c of kids) walk(c);
      out += "**";
      return;
    }
    if (tag === "em" || tag === "i") {
      out += "*";
      for (const c of kids) walk(c);
      out += "*";
      return;
    }
    if (tag === "code") {
      out += "`";
      for (const c of kids) walk(c);
      out += "`";
      return;
    }
    if (tag === "a") {
      const href = n.getAttribute?.("href") ?? "";
      out += "[";
      for (const c of kids) walk(c);
      out += `](${href})`;
      return;
    }
    if (tag === "img") {
      const src = n.getAttribute?.("src") ?? "";
      const alt = n.getAttribute?.("alt") ?? "";
      out += `![${alt}](${src})`;
      return;
    }
    for (const c of kids) walk(c);
  };
  for (const c of cellEl.childNodes) walk(c);
  return out.trim();
};

// MDAST のインライン群を markdown ソース文字列に戻す。GFM パイプテーブルの
// セル内インラインから cell.text (markdown) を復元するために使う。
// cellHtmlToText の MDAST 版にあたるが、入力ノード形が異なるため別関数。
const mdastInlineToMarkdown = (nodes: PhrasingContent[]): string => {
  let out = "";
  for (const n of nodes) {
    switch (n.type) {
      case "text":
        out += n.value;
        break;
      case "strong":
        out += `**${mdastInlineToMarkdown(n.children)}**`;
        break;
      case "emphasis":
        out += `*${mdastInlineToMarkdown(n.children)}*`;
        break;
      case "inlineCode":
        out += `\`${n.value}\``;
        break;
      case "link":
        out += `[${mdastInlineToMarkdown(n.children)}](${n.url})`;
        break;
      case "image":
        out += `![${n.alt ?? ""}](${n.url})`;
        break;
      case "break":
        // GFM パイプテーブルのセル内に hard break は出ないが、念のため空白扱いにする。
        out += " ";
        break;
      default:
        if ("children" in n) {
          out += mdastInlineToMarkdown(n.children as PhrasingContent[]);
        }
    }
  }
  return out;
};

const mdastTableToBlock = (node: Table, source: string): TableBlock => {
  const rows: TableRow[] = node.children.map((rowNode, rowIdx) => ({
    id: newId(),
    cells: rowNode.children.map((cellNode): TableCell => ({
      id: newId(),
      text: mdastInlineToMarkdown(cellNode.children),
      rowspan: 1,
      colspan: 1,
      // GFM のパイプテーブルは構造的にヘッダ行が常に最初の 1 行のみ。
      isHeader: rowIdx === 0,
    })),
  }));
  return {
    id: newId(),
    kind: "table",
    source,
    rows,
  };
};

const parseTableHtml = (html: string): TableBlock | null => {
  let root;
  try {
    root = parseHtml(html);
  } catch {
    return null;
  }
  const tableEl = root.querySelector("table");
  if (!tableEl) return null;
  const rows: TableRow[] = [];
  const trEls = tableEl.querySelectorAll("tr");
  for (const trEl of trEls) {
    const cells: TableCell[] = [];
    const cellEls = (trEl as ParsedHtmlElement).querySelectorAll("td, th");
    for (const cellEl of cellEls) {
      const el = cellEl as ParsedHtmlElement;
      const text = cellHtmlToText(el);
      const rs = parseInt(el.getAttribute("rowspan") ?? "1", 10);
      const cs = parseInt(el.getAttribute("colspan") ?? "1", 10);
      cells.push({
        id: newId(),
        text,
        rowspan: Number.isFinite(rs) && rs > 0 ? rs : 1,
        colspan: Number.isFinite(cs) && cs > 0 ? cs : 1,
        isHeader: el.tagName.toLowerCase() === "th",
      });
    }
    rows.push({ id: newId(), cells });
  }
  return {
    id: newId(),
    kind: "table",
    source: html,
    rows,
  };
};

const extractListBlocks = (node: List, md: string): Block[] => {
  const out: Block[] = [];
  for (const item of node.children) {
    if (!item.position) continue;
    const startOffset = item.position.start.offset;
    const startCol = item.position.start.column;
    if (startOffset === undefined) continue;
    // 行頭からスライスして先頭のインデントを保持する。
    const lineStart = startOffset - (startCol - 1);

    let leadEnd: number | null = null;
    let firstParagraphChildren: PhrasingContent[] | null = null;
    const after: Block[] = [];

    for (let i = 0; i < item.children.length; i++) {
      const child = item.children[i];
      if (i === 0 && child.type === "paragraph") {
        firstParagraphChildren = child.children;
        leadEnd = child.position?.end.offset ?? null;
        continue;
      }
      if (child.type === "list") {
        after.push(...extractListBlocks(child, md));
        continue;
      }
      if (child.type === "paragraph") {
        // ルーズリストアイテム内の継続段落。独立した段落ブロックとして
        // 出力する。先頭インデントを `source` に保持しておくので、次回
        // パース時にリストアイテムの継続位置として markdown が往復する。
        const start = child.position?.start.offset;
        const end = child.position?.end.offset;
        const startC = child.position?.start.column;
        if (start === undefined || end === undefined || startC === undefined) continue;
        const ls = start - (startC - 1);
        after.push(
          {
            id: newId(),
            kind: "paragraph",
            source: md.slice(ls, end),
            inlines: buildInlines(child.children),
          } satisfies ParagraphBlock,
        );
        continue;
      }
      // それ以外の子要素（コードブロック、引用など）は依然として破棄する。
    }

    if (leadEnd === null) {
      // 空のアイテム（段落なし）— アイテムが報告する終端にフォールバック。
      leadEnd = item.position.end.offset ?? lineStart;
    }

    const source = md.slice(lineStart, leadEnd);
    const inlines = firstParagraphChildren ? buildInlines(firstParagraphChildren) : [];

    if (typeof item.checked === "boolean") {
      out.push(
        {
          id: newId(),
          kind: "taskItem",
          checked: item.checked,
          source,
          inlines,
        } satisfies TaskItemBlock,
      );
    } else if (node.ordered) {
      out.push(
        {
          id: newId(),
          kind: "orderedItem",
          source,
          inlines,
        } satisfies OrderedItemBlock,
      );
    } else {
      out.push(
        {
          id: newId(),
          kind: "bulletItem",
          source,
          inlines,
        } satisfies BulletItemBlock,
      );
    }

    out.push(...after);
  }
  return out;
};

// 意図的な空段落（Notion 風の空行スペーサ）を往復させるためのマーカー。
// シリアライズ時は単独行に `\` を出力し、パース時は中身が単一のバック
// スラッシュだけの段落を検出して source: "" に正規化するので、エディタ
// 上では空行として表示される。
const EMPTY_PARAGRAPH_MARKER = "\\";

const isEmptyParagraphMarker = (children: PhrasingContent[]): boolean =>
  children.length === 1
  && children[0].type === "text"
  && children[0].value === EMPTY_PARAGRAPH_MARKER;

const blockFromNode = (node: RootContent, source: string): Block => {
  if (node.type === "paragraph") {
    if (isEmptyParagraphMarker(node.children)) {
      return {
        id: newId(),
        kind: "paragraph",
        source: "",
        inlines: [],
      } satisfies ParagraphBlock;
    }
    return {
      id: newId(),
      kind: "paragraph",
      source,
      inlines: buildInlines(node.children),
    } satisfies ParagraphBlock;
  }
  if (node.type === "heading") {
    return {
      id: newId(),
      kind: "heading",
      level: node.depth as HeadingBlock["level"],
      source,
      inlines: buildInlines(node.children),
    } satisfies HeadingBlock;
  }
  if (node.type === "code") {
    return {
      id: newId(),
      kind: "code",
      lang: node.lang ?? "",
      value: node.value,
      source,
    } satisfies CodeBlock;
  }
  // 生 HTML テーブルを検出する（このエディタは常に <table>...</table> で出力する）。
  if (node.type === "html" && TABLE_PREFIX_RE.test(node.value)) {
    const tb = parseTableHtml(node.value);
    if (tb) return { ...tb, source };
  }
  if (node.type === "table") {
    return mdastTableToBlock(node, source);
  }
  return {
    id: newId(),
    kind: rawKindOf(node.type),
    source,
  } satisfies RawBlock;
};

export const markdownToDocument = (md: string): Document => {
  const tree = parser.parse(md) as Root;
  const blocks: Block[] = [];
  for (const node of tree.children) {
    if (node.type === "list") {
      blocks.push(...extractListBlocks(node, md));
      continue;
    }
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) continue;
    blocks.push(blockFromNode(node, md.slice(start, end)));
  }
  return { blocks };
};

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
