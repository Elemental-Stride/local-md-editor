import type { Block, BlockId } from "@local-md-editor/shared";
import type { KeyboardEvent, RefObject } from "react";
import type { SlashMenuController } from "../../slash-menu/index.js";
import { contentOf } from "../blockTransforms.js";

type Args = {
  block: Block;
  onChange: (next: Block) => void;
  onInsertAfter: (block: Block) => void;
  onSplitBlock: (block: Block, before: string, after: string) => void;
  onDeleteAndFocusPrev: (id: BlockId) => void;
  onNavigateOut: (id: BlockId, dir: "up" | "down") => void;
  taRef: RefObject<HTMLTextAreaElement>;
  slashMenu: SlashMenuController;
  openLinkPrompt: (ta: HTMLTextAreaElement) => void;
};

// ブロック間移動の判定。↑ はキャレットより前に `\n` が無いとき、↓ は後に
// 無いときブロック外へ抜ける（ソフトラップは textarea ネイティブの挙動）。
const isAtFirstLine = (ta: HTMLTextAreaElement): boolean =>
  !ta.value.slice(0, ta.selectionStart).includes("\n");
const isAtLastLine = (ta: HTMLTextAreaElement): boolean =>
  !ta.value.slice(ta.selectionEnd).includes("\n");

// 編集中の textarea に対する全キー操作をひとつの関数にまとめる。
// スラッシュメニューが開いているときは矢印 / Enter / Escape をそちらに
// 取られ、そうでないときはブロック編集側のショートカット
// （Cmd+K / Cmd+Enter / Tab / Backspace 等）を捌く。
export const useBlockKeyHandler = (
  {
    block,
    onChange,
    onInsertAfter,
    onSplitBlock,
    onDeleteAndFocusPrev,
    onNavigateOut,
    taRef,
    slashMenu,
    openLinkPrompt,
  }: Args,
): (e: KeyboardEvent<HTMLTextAreaElement>) => void => {
  const display = contentOf(block);

  return (e) => {
    if (e.nativeEvent.isComposing) return;

    if (slashMenu.open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        slashMenu.setIndex(Math.min(slashMenu.filteredItems.length - 1, slashMenu.index + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        slashMenu.setIndex(Math.max(0, slashMenu.index - 1));
        return;
      }
      if (e.key === "Enter" && slashMenu.filteredItems.length > 0) {
        e.preventDefault();
        slashMenu.selectItem(slashMenu.filteredItems[slashMenu.index]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        slashMenu.close();
        return;
      }
    }

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openLinkPrompt(e.currentTarget);
      return;
    }

    if (e.key === "Escape") {
      e.currentTarget.blur();
      return;
    }

    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onInsertAfter(block);
      return;
    }

    if (
      e.key === "Enter"
      && !e.shiftKey
      && !e.metaKey
      && !e.ctrlKey
      && block.kind !== "html"
      && block.kind !== "blockquote"
      && block.kind !== "thematicBreak"
      && block.kind !== "other"
    ) {
      e.preventDefault();
      const cursor = e.currentTarget.selectionStart;
      onSplitBlock(block, display.slice(0, cursor), display.slice(cursor));
      return;
    }

    if (e.key === "ArrowUp" && isAtFirstLine(e.currentTarget)) {
      e.preventDefault();
      onNavigateOut(block.id, "up");
      return;
    }
    if (e.key === "ArrowDown" && isAtLastLine(e.currentTarget)) {
      e.preventDefault();
      onNavigateOut(block.id, "down");
      return;
    }

    if (e.key === "Backspace") {
      const ta = e.currentTarget;
      const markered = block.kind === "heading"
        || block.kind === "bulletItem"
        || block.kind === "orderedItem"
        || block.kind === "taskItem";
      // マーカー行の先頭で Backspace を押すと、見出し / リストを段落に
      // 戻す（Notion 的な挙動）。
      if (markered && ta.selectionStart === 0 && ta.selectionEnd === 0) {
        e.preventDefault();
        onChange({
          id: block.id,
          kind: "paragraph",
          source: contentOf(block),
          inlines: [],
        });
        return;
      }
      // 完全に空のブロックでさらに Backspace を押すと、ブロック自体を
      // 削除して 1 つ上にフォーカスを移す。
      if (display === "") {
        e.preventDefault();
        onDeleteAndFocusPrev(block.id);
        return;
      }
    }

    if (e.key === "Tab") {
      e.preventDefault();
      if (block.kind === "heading") return;
      const ta = taRef.current;
      if (!ta) return;
      if (!("source" in block)) return;
      const oldStart = ta.selectionStart;
      const oldEnd = ta.selectionEnd;
      // リスト系はマーカーが画面上に出ない（hide）ため、インデント挿入位置は
      // source の先頭。それ以外は現在行頭にスペースを足す。
      const hidesMarker = block.kind === "bulletItem"
        || block.kind === "orderedItem"
        || block.kind === "taskItem";
      const insertPos = hidesMarker
        ? 0
        : block.source.lastIndexOf("\n", oldStart - 1) + 1;
      if (e.shiftKey) {
        const m = block.source.slice(insertPos).match(/^( {1,2})/);
        if (!m) return;
        const removed = m[1].length;
        const next = block.source.slice(0, insertPos)
          + block.source.slice(insertPos + removed);
        onChange({ ...block, source: next } as Block);
        if (!hidesMarker) {
          const cs = Math.max(insertPos, oldStart - removed);
          const ce = Math.max(insertPos, oldEnd - removed);
          requestAnimationFrame(() => ta.setSelectionRange(cs, ce));
        }
      } else {
        const next = block.source.slice(0, insertPos)
          + "  "
          + block.source.slice(insertPos);
        onChange({ ...block, source: next } as Block);
        if (!hidesMarker) {
          requestAnimationFrame(() => ta.setSelectionRange(oldStart + 2, oldEnd + 2));
        }
      }
    }
  };
};
