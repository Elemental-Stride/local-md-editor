import type { Block, BlockId } from "@local-md-editor/shared";
import type { DragEvent } from "react";
import { CodeBlockView } from "../code-block/index.js";
import { useLinkPrompt } from "../link-modal/index.js";
import { useSlashMenu } from "../slash-menu/index.js";
import { TableView } from "../table/index.js";
import { BlockEditor } from "./BlockEditor.js";
import { searchHighlightClass } from "./blockTransforms.js";
import { useBlockEditing } from "./hooks/useBlockEditing.js";
import { useBlockKeyHandler } from "./hooks/useBlockKeyHandler.js";
import { useImageDrop } from "./hooks/useImageDrop.js";
import { RenderedBlock } from "./RenderedBlock.js";

type Props = {
  block: Block;
  onChange: (next: Block) => void;
  onCommit: () => void;
  onInsertAfter: (block: Block) => void;
  onSplitBlock: (block: Block, before: string, after: string) => void;
  onDeleteAndFocusPrev: (blockId: BlockId) => void;
  onNavigateOut: (blockId: BlockId, dir: "up" | "down") => void;
  onFocus: (blockId: BlockId) => void;
  onDragStart?: (e: DragEvent<HTMLElement>) => void;
  initiallyEditing?: boolean;
  initialCursor?: "start" | "end";
  searchHighlight?: { current: boolean; } | null;
};

// すべてのフックは早期 return より上で必ず呼ぶ。block.kind がテキスト系と
// table / code を行き来したときにフック数が揺れて React が壊れるのを避ける。
export const BlockView = (props: Props): JSX.Element => {
  const {
    block,
    onChange,
    onCommit,
    onInsertAfter,
    onSplitBlock,
    onDeleteAndFocusPrev,
    onNavigateOut,
    onFocus,
    onDragStart,
    initiallyEditing,
    initialCursor,
    searchHighlight,
  } = props;

  const editing = useBlockEditing({
    block,
    initiallyEditing: !!initiallyEditing,
    initialCursor,
  });
  const slashMenu = useSlashMenu({
    block,
    onChange,
    onInsertAfter,
    taRef: editing.taRef,
  });
  const linkPrompt = useLinkPrompt({ block, onChange, taRef: editing.taRef });
  const imageDrop = useImageDrop({
    block,
    onChange,
    taRef: editing.taRef,
    editing: editing.editing,
  });
  const onKeyDown = useBlockKeyHandler({
    block,
    onChange,
    onInsertAfter,
    onSplitBlock,
    onDeleteAndFocusPrev,
    onNavigateOut,
    taRef: editing.taRef,
    slashMenu,
    openLinkPrompt: linkPrompt.openFromTextarea,
  });

  if (block.kind === "table") {
    return (
      <TableView
        block={block}
        onChange={onChange}
        onDelete={() => onDeleteAndFocusPrev(block.id)}
        onDragStart={onDragStart}
      />
    );
  }

  if (block.kind === "code") {
    return (
      <CodeBlockView
        block={block}
        onChange={onChange}
        onCommit={onCommit}
        onDelete={() => onDeleteAndFocusPrev(block.id)}
        onInsertAfter={() => onInsertAfter(block)}
        onDragStart={onDragStart}
        onNavigateOut={(dir) => onNavigateOut(block.id, dir)}
        onFocus={() => onFocus(block.id)}
        initiallyEditing={initiallyEditing}
        initialCursor={initialCursor}
      />
    );
  }

  if (editing.editing) {
    return (
      <BlockEditor
        block={block}
        onChange={onChange}
        onCommit={onCommit}
        onFocus={onFocus}
        setEditing={editing.setEditing}
        taRef={editing.taRef}
        slashMenu={slashMenu}
        linkPrompt={linkPrompt}
        onKeyDown={onKeyDown}
        onTextareaDrop={imageDrop.onTextareaDrop}
        searchHighlight={searchHighlight}
      />
    );
  }

  const highlight = searchHighlight ? searchHighlightClass(searchHighlight.current) : "";
  return (
    <div
      className={`cursor-text rounded px-1 hover:bg-white/5 ${highlight}`}
      onClick={() => {
        editing.enteredViaClick.current = true;
        editing.setEditing(true);
        onFocus(block.id);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={imageDrop.onDisplayDrop}
    >
      <RenderedBlock block={block} onChange={onChange} />
    </div>
  );
};
