import type { Block, BlockId, Document, ParagraphBlock } from "@local-md-editor/shared";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { FocusIntent } from "../../../types/document.js";
import { post } from "../../../vscode.js";
import type { BlockBuilders } from "./useBlockBuilders.js";
import type { DocumentHistory } from "./useDocumentHistory.js";

type Args = {
  setDoc: Dispatch<SetStateAction<Document | null>>;
  setFocus: Dispatch<SetStateAction<FocusIntent | null>>;
  builders: BlockBuilders;
  history: DocumentHistory;
  docRef: MutableRefObject<Document | null>;
  focusRef: MutableRefObject<FocusIntent | null>;
};

type DocumentMutations = {
  handleChange: (next: Document) => void;
  handleCommit: () => void;
  insertAfter: (current: Block) => void;
  splitBlock: (current: Block, before: string, after: string) => void;
  deleteAndFocusPrev: (blockId: BlockId) => void;
  deleteBlocks: (ids: ReadonlySet<BlockId>) => void;
  reorder: (sourceId: BlockId, targetId: BlockId, where: "before" | "after") => void;
  startWriting: () => void;
  applySearchReplacement: (next: Document) => void;
  applyBlockCommand: (next: Document, nextFocus?: FocusIntent) => void;
};

// ドキュメント本体を変更する handler 群。state そのものは useDocumentSync が
// 所有しており、ここでは setDoc を借りて操作する。`edit` は逐次反映で、
// `commit` はファイル保存と再パースのトリガ。
// 各 mutation はミューテーション直前に history.recordCheckpoint を呼ぶ。
// kind=soft はテキスト連続入力のコアレッシング対象、hard は構造変更で必ず
// 1 ステップとして積む。
export const useDocumentMutations = (
  { setDoc, setFocus, builders, history, docRef, focusRef }: Args,
): DocumentMutations => {
  const handleChange = (next: Document): void => {
    const prev = docRef.current;
    if (prev) {
      // 空白文字を入力した直後は word boundary とみなして hard で境界を作る
      // （VS Code の typing-history と同じ感覚）。それ以外は soft で連続入力を
      // ひとまとまりに coalesce する。
      const kind = appendedWhitespace(prev, next) ? "hard" : "soft";
      history.recordCheckpoint(prev, focusRef.current, kind);
    }
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
    const prev = docRef.current;
    if (!prev) return;
    history.recordCheckpoint(prev, focusRef.current, "hard");
    setDoc(() => {
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
    const prev = docRef.current;
    if (!prev) return;
    history.recordCheckpoint(prev, focusRef.current, "hard");
    setDoc(() => {
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
    const prev = docRef.current;
    if (!prev) return;
    history.recordCheckpoint(prev, focusRef.current, "hard");
    setDoc(() => {
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

  // 非編集モード時の DOM 範囲選択 (Cmd+A など) からの一括削除。残りが空に
  // なったら空段落 1 個を作って `startWriting` 同等の状態に戻す。これがないと
  // doc.blocks が空になり、ユーザは「クリックして書き始める…」ボタンを
  // 経由しないと再入力できない。
  const deleteBlocks = (ids: ReadonlySet<BlockId>): void => {
    const prev = docRef.current;
    if (!prev || ids.size === 0) return;
    history.recordCheckpoint(prev, focusRef.current, "hard");
    const remaining = prev.blocks.filter((b) => !ids.has(b.id));
    if (remaining.length === 0) {
      const newBlock = builders.emptyParagraph();
      const next: Document = { blocks: [newBlock] };
      setFocus({ id: newBlock.id, cursor: "end" });
      setDoc(next);
      post({ type: "edit", document: next });
      return;
    }
    const next: Document = { blocks: remaining };
    setFocus(null);
    setDoc(next);
    post({ type: "edit", document: next });
  };

  const reorder = (
    sourceId: BlockId,
    targetId: BlockId,
    where: "before" | "after",
  ): void => {
    if (sourceId === targetId) return;
    const prev = docRef.current;
    if (!prev) return;
    history.recordCheckpoint(prev, focusRef.current, "hard");
    setDoc(() => {
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
    const prev = docRef.current;
    if (prev) history.recordCheckpoint(prev, focusRef.current, "hard");
    const newBlock = builders.emptyParagraph();
    const next: Document = { blocks: [newBlock] };
    setFocus({ id: newBlock.id, cursor: "end" });
    setDoc(next);
    post({ type: "edit", document: next });
  };

  const applySearchReplacement = (next: Document): void => {
    const prev = docRef.current;
    if (prev) history.recordCheckpoint(prev, focusRef.current, "hard");
    setDoc(next);
    post({ type: "commit", document: next });
  };

  const applyBlockCommand = (next: Document, nextFocus?: FocusIntent): void => {
    const prev = docRef.current;
    if (prev) history.recordCheckpoint(prev, focusRef.current, "hard");
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
    deleteBlocks,
    reorder,
    startWriting,
    applySearchReplacement,
    applyBlockCommand,
  };
};

// prev → next で「最初に source が変わった block」に注目し、長さが伸び、かつ
// 末尾に追記された 1 文字以上の中に空白文字が含まれていたら true を返す。
// undo の粒度を「単語」スケールにするための word-boundary 検出に使う。
// 中央挿入や貼り付けなど、末尾追記でないケースは false 扱い（coalesce 継続）。
const appendedWhitespace = (prev: Document, next: Document): boolean => {
  const len = Math.min(prev.blocks.length, next.blocks.length);
  for (let i = 0; i < len; i++) {
    const p = prev.blocks[i];
    const n = next.blocks[i];
    if (!("source" in p) || !("source" in n)) continue;
    if (p.source === n.source) continue;
    if (n.source.length <= p.source.length) return false;
    if (!n.source.startsWith(p.source)) return false;
    return /\s/.test(n.source.slice(p.source.length));
  }
  return false;
};
