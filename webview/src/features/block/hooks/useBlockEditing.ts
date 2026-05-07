import type { Block } from "@local-md-editor/shared";
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  enteredViaClick: { current: boolean; };
};

// 編集モードの開閉と textarea のサイズ・カーソル位置を司る hook。
// 高さは内容に応じた auto-grow、初期カーソルは「start: マーカー直後 /
// end: 末尾」、クリックで入った場合は末尾に移動する。
export const useBlockEditing = ({ block, initiallyEditing, initialCursor }: Args): Return => {
  const [editing, setEditing] = useState(initiallyEditing);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const initialEditMount = useRef(initiallyEditing);
  const enteredViaClick = useRef(false);

  // initiallyEditing が false → true へ動くのは、別ブロックから ↑/↓ で
  // navigateOut されてフォーカスが回ってきたとき。useState は初期値しか
  // 反映しないため、再エントリでは editing 状態を明示的に立て直し、
  // initialEditMount を再アームして initialCursor の位置にカーソルを置かせる。
  // useLayoutEffect でも同じ位置に置くつもりだが、textarea の autoFocus と
  // layout effect の前後関係でカーソルが先頭に残ることがあるため、
  // requestAnimationFrame で次フレームに再度カーソルを確定させる。
  useEffect(() => {
    if (!initiallyEditing) return;
    setEditing(true);
    initialEditMount.current = true;
    const cursor = initialCursor;
    const handle = requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      const pos = cursor === "start" ? 0 : ta.value.length;
      ta.setSelectionRange(pos, pos);
    });
    return () => cancelAnimationFrame(handle);
  }, [initiallyEditing, initialCursor]);

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
