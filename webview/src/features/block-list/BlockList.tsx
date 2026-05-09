import type { Block, BlockId, Document } from "@local-md-editor/shared";
import { type DragEvent, useState } from "react";
import type { FocusIntent } from "../../types/document.js";
import { BlockMenu, type BlockMenuApply } from "../block-menu/index.js";
import { BlockView } from "../block/index.js";

type Props = {
  document: Document;
  focus: FocusIntent | null;
  onChange: (next: Document) => void;
  onCommit: () => void;
  onInsertAfter: (block: Block) => void;
  onSplitBlock: (block: Block, before: string, after: string) => void;
  onDeleteAndFocusPrev: (blockId: BlockId) => void;
  onReorder: (sourceId: BlockId, targetId: BlockId, where: "before" | "after") => void;
  onNavigateOut: (blockId: BlockId, dir: "up" | "down") => void;
  onFocus: (blockId: BlockId) => void;
  // ハンドル経由のブロック操作（kind 変換 / move / duplicate / delete）の適用先。
  onApplyBlockCommand: BlockMenuApply;
  searchMatches: Set<BlockId>;
  currentMatchId: BlockId | null;
};

type MenuState = { id: BlockId; anchorRect: DOMRect; };

const DRAG_MIME = "application/x-local-md-editor-block";

export const BlockList = (
  {
    document,
    focus,
    onChange,
    onCommit,
    onInsertAfter,
    onSplitBlock,
    onDeleteAndFocusPrev,
    onReorder,
    onNavigateOut,
    onFocus,
    onApplyBlockCommand,
    searchMatches,
    currentMatchId,
  }: Props,
): JSX.Element => {
  const [dropAt, setDropAt] = useState<{ id: BlockId; pos: "before" | "after"; } | null>(null);
  const [dragId, setDragId] = useState<BlockId | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuBlock = menu ? document.blocks.find((b) => b.id === menu.id) ?? null : null;

  const updateBlock = (next: Block): void => {
    onChange({
      blocks: document.blocks.map((b) => (b.id === next.id ? next : b)),
    });
  };

  const handleDragStart = (e: DragEvent<HTMLElement>, id: BlockId): void => {
    e.dataTransfer.setData(DRAG_MIME, id);
    e.dataTransfer.effectAllowed = "move";
    const row = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-block-row]");
    if (row) e.dataTransfer.setDragImage(row, 0, 0);
    setDragId(id);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, id: BlockId): void => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const pos: "before" | "after" = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setDropAt((prev) => (prev?.id === id && prev.pos === pos ? prev : { id, pos }));
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, id: BlockId): void => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    const sourceId = e.dataTransfer.getData(DRAG_MIME);
    const where = dropAt?.pos ?? "after";
    setDropAt(null);
    setDragId(null);
    if (sourceId && sourceId !== id) onReorder(sourceId, id, where);
  };

  return (
    <div
      className="flex flex-col"
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDropAt(null);
      }}
      onDragEnd={() => {
        setDropAt(null);
        setDragId(null);
      }}
    >
      {menu && menuBlock && (
        <BlockMenu
          block={menuBlock}
          document={document}
          anchorRect={menu.anchorRect}
          onApply={onApplyBlockCommand}
          onClose={() => setMenu(null)}
        />
      )}
      {document.blocks.map((block) => {
        const showBefore = dropAt?.id === block.id && dropAt.pos === "before";
        const showAfter = dropAt?.id === block.id && dropAt.pos === "after";
        const isMatch = searchMatches.has(block.id);
        const highlight = isMatch
          ? { current: currentMatchId === block.id }
          : null;
        return (
          <div
            key={block.id}
            data-block-row
            data-block-id={block.id}
            className={`group relative flex items-start gap-1 py-1 ${
              dragId === block.id ? "opacity-40" : ""
            }`}
            onDragOver={(e) => handleDragOver(e, block.id)}
            onDrop={(e) => handleDrop(e, block.id)}
          >
            {showBefore && (
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
                style={{ background: "var(--vscode-focusBorder)" }}
              />
            )}
            <button
              type="button"
              draggable
              data-block-handle
              aria-label="ブロックメニューを開く"
              aria-haspopup="menu"
              aria-expanded={menu?.id === block.id}
              onDragStart={(e) => handleDragStart(e, block.id)}
              onClick={(e) => {
                // ハンドル再クリック時はトグルで閉じる。BlockMenu 側の外部
                // mousedown ハンドラはハンドル自身を除外するので、ここで
                // toggle 判定して問題ない。
                if (menu?.id === block.id) {
                  setMenu(null);
                  return;
                }
                const rect = e.currentTarget.getBoundingClientRect();
                setMenu({ id: block.id, anchorRect: rect });
              }}
              className="select-none border-0 bg-transparent p-0 pt-1 text-xs leading-none opacity-0 transition group-hover:opacity-50"
              style={{ cursor: "grab" }}
              title="クリック: メニュー / ドラッグ: 並べ替え"
            >
              ⋮⋮
            </button>
            <div className="min-w-0 flex-1">
              <BlockView
                block={block}
                onChange={updateBlock}
                onCommit={onCommit}
                onInsertAfter={onInsertAfter}
                onSplitBlock={onSplitBlock}
                onDeleteAndFocusPrev={onDeleteAndFocusPrev}
                onNavigateOut={onNavigateOut}
                onFocus={onFocus}
                onDragStart={(e) => handleDragStart(e, block.id)}
                initiallyEditing={focus?.id === block.id}
                initialCursor={focus?.id === block.id ? focus.cursor : undefined}
                searchHighlight={highlight}
              />
            </div>
            {showAfter && (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5"
                style={{ background: "var(--vscode-focusBorder)" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
