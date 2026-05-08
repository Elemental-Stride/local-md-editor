import type { Block, BlockId, Document, ParagraphBlock } from "@local-md-editor/shared";
import { useEffect, useMemo, useRef, useState } from "react";

export type Command = {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
};

type Props = {
  document: Document;
  activeBlockId: BlockId | null;
  onApply: (next: Document, focus?: { id: BlockId; cursor: "start" | "end"; }) => void;
  onClose: () => void;
};

const transformBlock = (b: Block, kind: string): Block => {
  const id = b.id;
  switch (kind) {
    case "paragraph":
      return { id, kind: "paragraph", source: "", inlines: [] } satisfies ParagraphBlock;
    case "h1":
      return { id, kind: "heading", level: 1, source: "# ", inlines: [] };
    case "h2":
      return { id, kind: "heading", level: 2, source: "## ", inlines: [] };
    case "h3":
      return { id, kind: "heading", level: 3, source: "### ", inlines: [] };
    case "bullet":
      return { id, kind: "bulletItem", source: "- ", inlines: [] };
    case "ordered":
      return { id, kind: "orderedItem", source: "1. ", inlines: [] };
    case "todo":
      return { id, kind: "taskItem", checked: false, source: "- [ ] ", inlines: [] };
    case "code":
      return { id, kind: "code", lang: "", value: "", source: "" };
    case "quote":
      return { id, kind: "blockquote", source: "> " };
    case "divider":
      return { id, kind: "thematicBreak", source: "---" };
    default:
      return b;
  }
};

export const CommandPalette = (
  { document, activeBlockId, onApply, onClose }: Props,
): JSX.Element => {
  const [filter, setFilter] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const idx = activeBlockId
    ? document.blocks.findIndex((b) => b.id === activeBlockId)
    : -1;

  const commands: Command[] = useMemo(() => {
    if (idx === -1) return [];
    const cmds: Command[] = [];
    const transform = (label: string, kind: string, hint = ""): Command => ({
      id: `transform-${kind}`,
      label,
      hint,
      run: () => {
        if (idx === -1) return;
        const blocks = [...document.blocks];
        blocks[idx] = transformBlock(blocks[idx], kind);
        onApply({ blocks }, { id: blocks[idx].id, cursor: "end" });
      },
    });
    cmds.push(transform("テキストに変換", "paragraph"));
    cmds.push(transform("見出し 1 に変換", "h1"));
    cmds.push(transform("見出し 2 に変換", "h2"));
    cmds.push(transform("見出し 3 に変換", "h3"));
    cmds.push(transform("箇条書きに変換", "bullet"));
    cmds.push(transform("番号付きリストに変換", "ordered"));
    cmds.push(transform("タスクに変換", "todo"));
    cmds.push(transform("コードブロックに変換", "code"));
    cmds.push(transform("引用に変換", "quote"));
    cmds.push(transform("区切り線に変換", "divider"));

    if (idx > 0) {
      cmds.push({
        id: "move-up",
        label: "ブロックを上に移動",
        hint: "Cmd+Shift+↑",
        run: () => {
          const blocks = [...document.blocks];
          [blocks[idx - 1], blocks[idx]] = [blocks[idx], blocks[idx - 1]];
          onApply({ blocks }, { id: blocks[idx - 1].id, cursor: "end" });
        },
      });
    }
    if (idx !== -1 && idx < document.blocks.length - 1) {
      cmds.push({
        id: "move-down",
        label: "ブロックを下に移動",
        hint: "Cmd+Shift+↓",
        run: () => {
          const blocks = [...document.blocks];
          [blocks[idx], blocks[idx + 1]] = [blocks[idx + 1], blocks[idx]];
          onApply({ blocks }, { id: blocks[idx + 1].id, cursor: "end" });
        },
      });
    }
    if (idx !== -1) {
      cmds.push({
        id: "duplicate",
        label: "ブロックを複製",
        run: () => {
          const blocks = [...document.blocks];
          const orig = blocks[idx];
          const copy: Block = { ...orig, id: makeId() } as Block;
          blocks.splice(idx + 1, 0, copy);
          onApply({ blocks }, { id: copy.id, cursor: "end" });
        },
      });
      cmds.push({
        id: "delete",
        label: "ブロックを削除",
        run: () => {
          const blocks = document.blocks.filter((_, i) => i !== idx);
          const focusTarget = blocks[Math.max(0, idx - 1)];
          onApply(
            { blocks },
            focusTarget ? { id: focusTarget.id, cursor: "end" } : undefined,
          );
        },
      });
    }
    return cmds;
  }, [document, idx, onApply]);

  const filtered = useMemo(() => {
    if (filter === "") return commands;
    const q = filter.toLowerCase();
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.id.includes(q));
  }, [commands, filter]);

  useEffect(() => {
    setIndex(0);
  }, [filter]);

  const select = (c: Command): void => {
    c.run();
    onClose();
  };

  return (
    <div
      data-overlay-input
      className="fixed left-1/2 top-20 z-30 w-[28rem] -translate-x-1/2 rounded border shadow-lg"
      style={{
        background: "var(--vscode-editorWidget-background)",
        borderColor: "var(--vscode-editorWidget-border)",
        color: "var(--vscode-editorWidget-foreground)",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={activeBlockId ? "ブロック操作を検索…" : "ブロックを選択してください"}
        className="block w-full bg-transparent px-3 py-2 text-sm outline-none"
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex((i) => Math.min(filtered.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter" && filtered[index]) {
            e.preventDefault();
            select(filtered[index]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <div
        className="max-h-72 overflow-y-auto border-t"
        style={{ borderColor: "var(--vscode-editorWidget-border)" }}
      >
        {filtered.length === 0
          ? <div className="px-3 py-2 text-xs opacity-60">該当なし</div>
          : filtered.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                select(c);
              }}
              className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm"
              style={i === index
                ? {
                  background: "var(--vscode-list-activeSelectionBackground)",
                  color: "var(--vscode-list-activeSelectionForeground)",
                }
                : undefined}
            >
              <span>{c.label}</span>
              {c.hint && <span className="text-xs opacity-60">{c.hint}</span>}
            </button>
          ))}
      </div>
    </div>
  );
};

const makeId = (): string =>
  `wb${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
