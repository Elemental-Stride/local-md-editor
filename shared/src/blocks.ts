export type BlockId = string;

export type InlineToken =
  | { type: "text"; value: string }
  | { type: "strong"; children: InlineToken[] }
  | { type: "em"; children: InlineToken[] }
  | { type: "code"; value: string }
  | { type: "link"; url: string; title?: string; children: InlineToken[] }
  | { type: "image"; url: string; alt: string; title?: string }
  | { type: "break" };

export type ParagraphBlock = {
  id: BlockId;
  kind: "paragraph";
  source: string;
  inlines: InlineToken[];
};

export type HeadingBlock = {
  id: BlockId;
  kind: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  source: string;
  inlines: InlineToken[];
};

export type BulletItemBlock = {
  id: BlockId;
  kind: "bulletItem";
  source: string;
  inlines: InlineToken[];
};

export type OrderedItemBlock = {
  id: BlockId;
  kind: "orderedItem";
  source: string;
  inlines: InlineToken[];
};

export type TaskItemBlock = {
  id: BlockId;
  kind: "taskItem";
  checked: boolean;
  source: string;
  inlines: InlineToken[];
};

export type TableCellId = string;
export type TableRowId = string;

export type TableCell = {
  id: TableCellId;
  text: string;
  rowspan: number;
  colspan: number;
  isHeader?: boolean;
};

export type TableRow = {
  id: TableRowId;
  cells: TableCell[];
};

export type TableBlock = {
  id: BlockId;
  kind: "table";
  source: string;
  rows: TableRow[];
};

export type CodeBlock = {
  id: BlockId;
  kind: "code";
  lang: string;
  value: string;
  source: string;
};

export type RawBlock = {
  id: BlockId;
  kind: "blockquote" | "thematicBreak" | "html" | "other";
  source: string;
};

export type Block =
  | ParagraphBlock
  | HeadingBlock
  | BulletItemBlock
  | OrderedItemBlock
  | TaskItemBlock
  | TableBlock
  | CodeBlock
  | RawBlock;

export type BlockKind = Block["kind"];

export type Document = {
  blocks: Block[];
};
