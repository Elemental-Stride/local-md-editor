import type { Document } from "@local-md-editor/shared";
import { type MutableRefObject, useEffect } from "react";
import { isInEditableTarget } from "../../../selection.js";
import { selectionToMarkdown } from "../selectionMarkdown.js";

type Args = {
  docRef: MutableRefObject<Document | null>;
};

// プレビュー上の選択をコピーしたとき、クリップボードへ見た目どおりの素の
// テキストではなく markdown を載せる。これがないとリンクや強調が失われ、
// 他の markdown へ貼り直せない。編集中の textarea からのコピーは既に
// markdown そのものなので既定動作に任せる。
export const useMarkdownCopy = ({ docRef }: Args): void => {
  useEffect(() => {
    const handler = (e: ClipboardEvent): void => {
      if (isInEditableTarget(e.target)) return;
      const doc = docRef.current;
      if (!doc) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const md = selectionToMarkdown(sel.getRangeAt(0), doc.blocks);
      if (md === null) return;
      e.clipboardData?.setData("text/plain", md);
      e.preventDefault();
    };
    document.addEventListener("copy", handler);
    return () => document.removeEventListener("copy", handler);
  }, [docRef]);
};
