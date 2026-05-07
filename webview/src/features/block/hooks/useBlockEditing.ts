import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import type { Block } from "@local-md-editor/shared";
import { contentOf } from "../blockTransforms.js";

type Args = {
  block: Block;
  initiallyEditing: boolean;
  initialCursor: "start" | "end" | undefined;
};

type Return = {
  editing: boolean;
  setEditing: (next: boolean) => void;
  taRef: RefObject<HTMLTextAreaElement>;
  enteredViaClick: { current: boolean };
};

// 編集モードの開閉と textarea のサイズ・カーソル位置を司る hook。
// 高さは内容に応じた auto-grow、初期カーソルは「start: マーカー直後 /
// end: 末尾」、クリックで入った場合は末尾に移動する。
export const useBlockEditing = ({ block, initiallyEditing, initialCursor }: Args): Return => {
  const [editing, setEditing] = useState(initiallyEditing);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const initialEditMount = useRef(initiallyEditing);
  const enteredViaClick = useRef(false);

  // フォントサイズが変わるブロック（heading / 段落 etc）でサイズ計算を
  // やり直すために heading の level も依存に入れる。
  const fontSig = block.kind === "heading" ? `h${block.level}` : block.kind;

  useLayoutEffect(() => {
    if (!editing) return;
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    if (initialEditMount.current) {
      initialEditMount.current = false;
      if (initialCursor === "start") {
        const markerLen = block.kind === "heading"
            || block.kind === "code"
            || block.kind === "table"
          ? 0
          : "source" in block
          ? block.source.length - contentOf(block).length
          : 0;
        el.setSelectionRange(markerLen, markerLen);
      } else {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    } else if (enteredViaClick.current) {
      enteredViaClick.current = false;
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [editing, "source" in block ? block.source : "", fontSig, initialCursor]);

  return { editing, setEditing, taRef, enteredViaClick };
};
