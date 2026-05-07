import { type TableBlock, tableBlockToHtml } from "@local-md-editor/shared";
import type { SlashItem } from "./types/types.js";

const makeTableId = (prefix: string): string =>
  `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const defaultTable = (id: string): TableBlock => {
  const rows = [
    {
      id: makeTableId("tr"),
      cells: [
        { id: makeTableId("tc"), text: "見出し 1", rowspan: 1, colspan: 1, isHeader: true },
        { id: makeTableId("tc"), text: "見出し 2", rowspan: 1, colspan: 1, isHeader: true },
        { id: makeTableId("tc"), text: "見出し 3", rowspan: 1, colspan: 1, isHeader: true },
      ],
    },
    {
      id: makeTableId("tr"),
      cells: [
        { id: makeTableId("tc"), text: "", rowspan: 1, colspan: 1 },
        { id: makeTableId("tc"), text: "", rowspan: 1, colspan: 1 },
        { id: makeTableId("tc"), text: "", rowspan: 1, colspan: 1 },
      ],
    },
    {
      id: makeTableId("tr"),
      cells: [
        { id: makeTableId("tc"), text: "", rowspan: 1, colspan: 1 },
        { id: makeTableId("tc"), text: "", rowspan: 1, colspan: 1 },
        { id: makeTableId("tc"), text: "", rowspan: 1, colspan: 1 },
      ],
    },
  ];
  const block: TableBlock = { id, kind: "table", source: "", rows };
  return { ...block, source: tableBlockToHtml(block) };
};

export const SLASH_ITEMS: SlashItem[] = [
  {
    id: "text",
    label: "テキスト",
    hint: "/text",
    apply: (b) => ({ id: b.id, kind: "paragraph", source: "", inlines: [] }),
  },
  {
    id: "h1",
    label: "見出し 1",
    hint: "/h1",
    apply: (b) => ({ id: b.id, kind: "heading", level: 1, source: "# ", inlines: [] }),
  },
  {
    id: "h2",
    label: "見出し 2",
    hint: "/h2",
    apply: (b) => ({ id: b.id, kind: "heading", level: 2, source: "## ", inlines: [] }),
  },
  {
    id: "h3",
    label: "見出し 3",
    hint: "/h3",
    apply: (b) => ({ id: b.id, kind: "heading", level: 3, source: "### ", inlines: [] }),
  },
  {
    id: "list",
    label: "箇条書き",
    hint: "/list",
    apply: (b) => ({ id: b.id, kind: "bulletItem", source: "- ", inlines: [] }),
  },
  {
    id: "numbered",
    label: "番号付きリスト",
    hint: "/numbered",
    apply: (b) => ({ id: b.id, kind: "orderedItem", source: "1. ", inlines: [] }),
  },
  {
    id: "todo",
    label: "タスク",
    hint: "/todo",
    apply: (b) => ({ id: b.id, kind: "taskItem", checked: false, source: "- [ ] ", inlines: [] }),
  },
  {
    id: "divider",
    label: "区切り線",
    hint: "/divider",
    apply: (b) => ({ id: b.id, kind: "thematicBreak", source: "---" }),
    thenInsertAfter: true,
  },
  {
    id: "table",
    label: "テーブル",
    hint: "/table",
    apply: (b) => defaultTable(b.id),
  },
];

export const filterItems = (filter: string): SlashItem[] => {
  if (filter === "") return SLASH_ITEMS;
  const lower = filter.toLowerCase();
  return SLASH_ITEMS.filter((item) => item.id.includes(lower) || item.label.includes(filter));
};

type Props = {
  items: SlashItem[];
  selectedIndex: number;
  onSelect: (item: SlashItem) => void;
};

export const SlashMenu = ({ items, selectedIndex, onSelect }: Props): JSX.Element => (
  <div
    className="absolute left-0 top-full z-10 mt-1 max-h-64 min-w-[14rem] overflow-y-auto rounded border py-1 shadow-lg"
    style={{
      background: "var(--vscode-editorWidget-background)",
      borderColor: "var(--vscode-editorWidget-border)",
      color: "var(--vscode-editorWidget-foreground)",
    }}
    onMouseDown={(e) => e.preventDefault()}
  >
    {items.length === 0
      ? <div className="px-3 py-1 text-xs opacity-60">該当なし</div>
      : items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(item);
          }}
          className="flex w-full items-center justify-between gap-3 px-3 py-1 text-left text-sm"
          style={i === selectedIndex
            ? {
              background: "var(--vscode-list-activeSelectionBackground)",
              color: "var(--vscode-list-activeSelectionForeground)",
            }
            : undefined}
        >
          <span>{item.label}</span>
          <span className="text-xs opacity-60">{item.hint}</span>
        </button>
      ))}
  </div>
);
