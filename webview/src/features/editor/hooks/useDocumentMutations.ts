import type { Block, BlockId, Document, ParagraphBlock } from "@local-md-editor/shared";
import type { Dispatch, SetStateAction } from "react";
import type { FocusIntent } from "../../../types/document.js";
import { post } from "../../../vscode.js";
import type { BlockBuilders } from "./useBlockBuilders.js";

type Args = {
  setDoc: Dispatch<SetStateAction<Document | null>>;
  setFocus: Dispatch<SetStateAction<FocusIntent | null>>;
  builders: BlockBuilders;
};

type DocumentMutations = {
  handleChange: (next: Document) => void;
  handleCommit: () => void;
  insertAfter: (current: Block) => void;
  splitBlock: (current: Block, before: string, after: string) => void;
  deleteAndFocusPrev: (blockId: BlockId) => void;
  reorder: (sourceId: BlockId, targetId: BlockId, where: "before" | "after") => void;
  startWriting: () => void;
  applySearchReplacement: (next: Document) => void;
  applyPaletteCommand: (next: Document, nextFocus?: FocusIntent) => void;
};

// ドキュメント本体を変更する handler 群。state そのものは useDocumentSync が
// 所有しており、ここでは setDoc を借りて操作する。`edit` は逐次反映で、
// `commit` はファイル保存と再パースのトリガ。
export const useDocumentMutations = (
  { setDoc, setFocus, builders }: Args,
): DocumentMutations => {
  const handleChange = (next: Document): void => {
    setDoc(next);
    post({ type: "edit", document: next });
  };

  const handleCommit = (): void => {
    setDoc((prev) => {
      if (prev) post({ type: "commit", document: prev });
      return prev;
    });
  };

  const insertAfter = (current: Block): void => {
    setDoc((prev) => {
      if (!prev) return prev;
      const idx = prev.blocks.findIndex((b) => b.id === current.id);
      if (idx === -1) return prev;
      const sibling = builders.createSiblingWithContent(current, "");
      const next: Document = {
        blocks: [
          ...prev.blocks.slice(0, idx + 1),
          sibling,
          ...prev.blocks.slice(idx + 1),
        ],
      };
      setFocus({ id: sibling.id, cursor: "end" });
      post({ type: "edit", document: next });
      return next;
    });
  };

  const splitBlock = (current: Block, before: string, after: string): void => {
    setDoc((prev) => {
      if (!prev) return prev;
      const idx = prev.blocks.findIndex((b) => b.id === current.id);
      if (idx === -1) return prev;

      // 番号付きリストの空項目で Enter したら、項目自体を段落へ落とす
      // （Notion 的な「リスト終了」操作）。
      if (current.kind === "orderedItem" && before === "" && after === "") {
        const demoted: ParagraphBlock = {
          id: current.id,
          kind: "paragraph",
          source: "",
          inlines: [],
        };
        const next: Document = {
          blocks: [
            ...prev.blocks.slice(0, idx),
            demoted,
            ...prev.blocks.slice(idx + 1),
          ],
        };
        post({ type: "edit", document: next });
        return next;
      }

      const updated = {
        ...current,
        source: builders.sourceWithContent(current, before),
      } as Block;

      let sibling: Block;
      if (current.kind === "orderedItem") {
        const { indent, marker } = builders.nextOrderedMarker(current);
        sibling = {
          id: builders.makeBlockId(),
          kind: "orderedItem",
          source: `${indent}${marker} ${after}`,
          inlines: [],
        };
      } else {
        sibling = {
          id: builders.makeBlockId(),
          kind: "paragraph",
          source: after,
          inlines: [],
        };
      }

      const next: Document = {
        blocks: [
          ...prev.blocks.slice(0, idx),
          updated,
          sibling,
          ...prev.blocks.slice(idx + 1),
        ],
      };
      setFocus({ id: sibling.id, cursor: "start" });
      post({ type: "edit", document: next });
      return next;
    });
  };

  const deleteAndFocusPrev = (blockId: BlockId): void => {
    setDoc((prev) => {
      if (!prev) return prev;
      const idx = prev.blocks.findIndex((b) => b.id === blockId);
      if (idx === -1) return prev;
      const next: Document = {
        blocks: [...prev.blocks.slice(0, idx), ...prev.blocks.slice(idx + 1)],
      };
      if (idx > 0) setFocus({ id: prev.blocks[idx - 1].id, cursor: "end" });
      post({ type: "edit", document: next });
      return next;
    });
  };

  const reorder = (
    sourceId: BlockId,
    targetId: BlockId,
    where: "before" | "after",
  ): void => {
    if (sourceId === targetId) return;
    setDoc((prev) => {
      if (!prev) return prev;
      const blocks = [...prev.blocks];
      const srcIdx = blocks.findIndex((b) => b.id === sourceId);
      if (srcIdx === -1) return prev;
      const [item] = blocks.splice(srcIdx, 1);
      let tgtIdx = blocks.findIndex((b) => b.id === targetId);
      if (tgtIdx === -1) {
        blocks.splice(srcIdx, 0, item);
        return prev;
      }
      if (where === "after") tgtIdx += 1;
      blocks.splice(tgtIdx, 0, item);
      const next: Document = { blocks };
      post({ type: "edit", document: next });
      return next;
    });
  };

  const startWriting = (): void => {
    const newBlock = builders.emptyParagraph();
    const next: Document = { blocks: [newBlock] };
    setFocus({ id: newBlock.id, cursor: "end" });
    setDoc(next);
    post({ type: "edit", document: next });
  };

  const applySearchReplacement = (next: Document): void => {
    setDoc(next);
    post({ type: "commit", document: next });
  };

  const applyPaletteCommand = (next: Document, nextFocus?: FocusIntent): void => {
    setDoc(next);
    if (nextFocus) setFocus(nextFocus);
    post({ type: "commit", document: next });
  };

  return {
    handleChange,
    handleCommit,
    insertAfter,
    splitBlock,
    deleteAndFocusPrev,
    reorder,
    startWriting,
    applySearchReplacement,
    applyPaletteCommand,
  };
};
