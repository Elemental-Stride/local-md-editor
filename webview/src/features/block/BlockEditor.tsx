import type { Block, BlockId } from "@local-md-editor/shared";
import type { DragEvent, KeyboardEvent, ReactNode, RefObject } from "react";
import { LinkModal, type LinkPromptController } from "../link-modal/index.js";
import { SlashMenu, type SlashMenuController } from "../slash-menu/index.js";
import {
  contentOf,
  headingClass,
  indentStyle,
  orderedMarker,
  reclassify,
  searchHighlightClass,
  toggleTaskSource,
  withDisplayValue,
} from "./blockTransforms.js";

type Props = {
  block: Block;
  onChange: (next: Block) => void;
  onCommit: () => void;
  onFocus: (id: BlockId) => void;
  setEditing: (next: boolean) => void;
  taRef: RefObject<HTMLTextAreaElement>;
  slashMenu: SlashMenuController;
  linkPrompt: LinkPromptController;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onTextareaDrop: (e: DragEvent<HTMLTextAreaElement>) => void;
  searchHighlight: { current: boolean; } | null | undefined;
};

// 編集中（textarea が出ている状態）のブロック表示。スラッシュメニューと
// リンク挿入モーダルもここに配置する。マーカー付きブロック（リスト類）は
// flex でマーカー要素と並べる。
export const BlockEditor = (
  {
    block,
    onChange,
    onCommit,
    onFocus,
    setEditing,
    taRef,
    slashMenu,
    linkPrompt,
    onKeyDown,
    onTextareaDrop,
    searchHighlight,
  }: Props,
): JSX.Element => {
  const editorClass = block.kind === "heading"
    ? `${headingClass[block.level]} leading-tight`
    : "font-mono text-sm leading-relaxed";
  const display = contentOf(block);

  const editor = (
    <textarea
      ref={taRef}
      autoFocus
      className={`w-full resize-none overflow-hidden bg-transparent outline-none ${editorClass}`}
      value={display}
      spellCheck={false}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={onTextareaDrop}
      onFocus={() => onFocus(block.id)}
      onChange={(e) => {
        const newDisplay = e.target.value;
        const newSource = withDisplayValue(block, newDisplay);
        const newBlock = reclassify(block, newSource);
        slashMenu.syncFromContentChange(contentOf(block), contentOf(newBlock));
        onChange(newBlock);
      }}
      onBlur={(e) => {
        // リンクモーダルにフォーカスが移った直後は編集を抜けない
        // （モーダル側で適用 / キャンセル後に textarea へ戻す）。
        if (linkPrompt.state) return;
        setEditing(false);
        slashMenu.close();
        if (e.relatedTarget instanceof HTMLTextAreaElement) return;
        onCommit();
      }}
      onKeyDown={onKeyDown}
    />
  );

  const slashMenuEl = slashMenu.open
    ? (
      <SlashMenu
        items={slashMenu.filteredItems}
        selectedIndex={slashMenu.index}
        onSelect={slashMenu.selectItem}
      />
    )
    : null;

  const linkPromptEl = linkPrompt.state
    ? (
      <LinkModal
        defaultLabel={linkPrompt.state.defaultLabel}
        defaultUrl={linkPrompt.state.defaultUrl}
        onApply={linkPrompt.apply}
        onCancel={linkPrompt.cancel}
      />
    )
    : null;

  const markerEl = makeMarkerEl(block, onChange);
  const highlight = searchHighlight ? searchHighlightClass(searchHighlight.current) : "";

  if (markerEl !== null) {
    return (
      <div
        className={`flex items-start gap-2 ${highlight}`}
        style={"source" in block ? indentStyle(block.source) : undefined}
      >
        {markerEl}
        <div className="relative flex-1">
          {editor}
          {slashMenuEl}
          {linkPromptEl}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${highlight}`}>
      {editor}
      {slashMenuEl}
      {linkPromptEl}
    </div>
  );
};

const markerTextClass = "select-none font-mono text-sm leading-relaxed opacity-60";

const makeMarkerEl = (block: Block, onChange: (next: Block) => void): ReactNode => {
  if (block.kind === "bulletItem") {
    return <span className={markerTextClass}>•</span>;
  }
  if (block.kind === "orderedItem") {
    return (
      <span className={`${markerTextClass} tabular-nums`}>
        {orderedMarker(block.source)}
      </span>
    );
  }
  if (block.kind === "taskItem") {
    return (
      <input
        type="checkbox"
        className="mt-[5px]"
        checked={block.checked}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const next = e.currentTarget.checked;
          onChange({
            ...block,
            checked: next,
            source: toggleTaskSource(block.source, next),
          });
        }}
      />
    );
  }
  return null;
};
