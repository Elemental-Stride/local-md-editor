import type { BlockId, Document } from "@local-md-editor/shared";
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import type { FocusIntent } from "../../../types/document.js";

type Args = {
  setDoc: Dispatch<SetStateAction<Document | null>>;
};

type Return = {
  focus: FocusIntent | null;
  setFocus: Dispatch<SetStateAction<FocusIntent | null>>;
  // 履歴記録時に「直前のフォーカスヒント」を読みたい用途で使う ref。
  focusRef: MutableRefObject<FocusIntent | null>;
  navigateOut: (blockId: BlockId, dir: "up" | "down") => void;
};

// フォーカス遷移の状態と handler。doc 自体は変更せず、focus のみ更新する。
// navigateOut は ↑/↓ で隣接ブロックへキャレットを移す。↑/↓ どちらでも
// 移動先ブロックの「末尾」にカーソルを置く（次の入力をすぐ続けられる挙動）。
export const useDocumentNavigation = ({ setDoc }: Args): Return => {
  const [focus, setFocus] = useState<FocusIntent | null>(null);
  const focusRef = useRef<FocusIntent | null>(null);

  useEffect(() => {
    focusRef.current = focus;
  }, [focus]);

  // フォーカス指示は一度消費されたらすぐクリアする（再レンダで同じ意図が
  // 再適用されるのを防ぐため）。
  useEffect(() => {
    if (focus === null) return;
    const t = setTimeout(() => setFocus(null), 0);
    return () => clearTimeout(t);
  }, [focus]);

  const navigateOut = (blockId: BlockId, dir: "up" | "down"): void => {
    setDoc((prev) => {
      if (!prev) return prev;
      const idx = prev.blocks.findIndex((b) => b.id === blockId);
      if (idx === -1) return prev;
      const targetIdx = dir === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.blocks.length) return prev;
      const target = prev.blocks[targetIdx];
      setFocus({ id: target.id, cursor: "end" });
      return prev;
    });
  };

  return { focus, setFocus, focusRef, navigateOut };
};
