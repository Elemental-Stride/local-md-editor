import type { BlockId } from "@local-md-editor/shared";
import { useEffect } from "react";

type Args = {
  deleteBlocks: (ids: ReadonlySet<BlockId>) => void;
};

// 非編集モード（textarea / input / contenteditable にフォーカスが無い状態）で
// Cmd+A 等によりブラウザネイティブの DOM 選択が複数ブロックに跨っているときに
// Delete / Backspace を捕まえ、選択範囲に重なるブロックをまとめて削除する。
// 編集中の textarea ではネイティブ動作（範囲削除）に任せたいので、ここでは
// なにもしない。
export const useDomSelectionDelete = ({ deleteBlocks }: Args): void => {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (isInEditableTarget(e.target)) return;
      const ids = collectSelectedBlockIds();
      if (ids.size === 0) return;
      e.preventDefault();
      deleteBlocks(ids);
      // 削除後にネイティブ選択範囲が宙に浮き、次の Cmd+A まで残ると
      // 操作感が悪いので明示的にクリアする。
      window.getSelection()?.removeAllRanges();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [deleteBlocks]);
};

const isInEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") return true;
  if (target.isContentEditable) return true;
  return false;
};

// 現在の DOM 選択範囲が触れている `[data-block-id]` 要素をすべて拾う。
// 1 ブロック内に閉じた選択でも、その block 1 件分のみ含まれる。
const collectSelectedBlockIds = (): ReadonlySet<BlockId> => {
  const sel = window.getSelection();
  const ids = new Set<BlockId>();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return ids;
  const range = sel.getRangeAt(0);
  document.querySelectorAll<HTMLElement>("[data-block-id]").forEach((el) => {
    if (!range.intersectsNode(el)) return;
    const id = el.getAttribute("data-block-id");
    if (id) ids.add(id as BlockId);
  });
  return ids;
};
