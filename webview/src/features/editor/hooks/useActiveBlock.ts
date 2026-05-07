import type { BlockId, Document } from "@local-md-editor/shared";
import { type Dispatch, type SetStateAction, useState } from "react";
import { post } from "../../../vscode.js";

type Args = {
  setDoc: Dispatch<SetStateAction<Document | null>>;
};

type Return = {
  activeBlockId: BlockId | null;
  setActiveBlockId: Dispatch<SetStateAction<BlockId | null>>;
  moveActiveBlock: (delta: -1 | 1) => void;
};

// 現在キーボードフォーカスのあるブロックの id を覚え、Cmd+Shift+矢印で
// その位置を上下に動かす。BlockList の onFocus が setActiveBlockId を呼ぶ。
export const useActiveBlock = ({ setDoc }: Args): Return => {
  const [activeBlockId, setActiveBlockId] = useState<BlockId | null>(null);

  const moveActiveBlock = (delta: -1 | 1): void => {
    setDoc((prev) => {
      if (!prev || !activeBlockId) return prev;
      const idx = prev.blocks.findIndex((b) => b.id === activeBlockId);
      if (idx === -1) return prev;
      const target = idx + delta;
      if (target < 0 || target >= prev.blocks.length) return prev;
      const blocks = [...prev.blocks];
      [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
      const next: Document = { blocks };
      post({ type: "edit", document: next });
      return next;
    });
  };

  return { activeBlockId, setActiveBlockId, moveActiveBlock };
};
