import type { Document } from "@local-md-editor/shared";
import { useCallback, useRef } from "react";
import type { FocusIntent } from "../../../types/document.js";

// 履歴エントリは「その状態を表す Document スナップショット」と
// 「復元したいフォーカス位置」をペアで保持する。focus は復元の質を上げる
// ためのヒント（Notion 的な「undo するとカーソルも戻ってくる」体験）。
type HistoryEntry = {
  doc: Document;
  focus: FocusIntent | null;
  // soft = 連続タイピングを 1 ステップにまとめるためのコアレッシング対象。
  // hard = 必ず境界を作る（構造変更）。redo を逆方向へ復元するときも保持。
  kind: "soft" | "hard";
  at: number;
};

type RecordKind = "soft" | "hard";

// 直前 soft エントリにマージする時間ウィンドウ。短い pause で粒度が
// 切り替わるよう 250ms 程度に絞る。これを超えてからの編集は新しいステップ
// として積む。さらに word-boundary（空白入力）でも切る（呼び出し側で hard 指定）。
const COALESCE_MS = 250;

// セッション中の最大エントリ数。長時間編集でメモリが膨張しないよう、
// 古い past から落とす。redo 側は新規変更のたびに必ずクリアされるため
// 同じ上限で頭打ち。
const HISTORY_LIMIT = 100;

export type DocumentHistory = {
  // 変更を行う直前に呼ぶ。`prev` は今から差し替える前の Document、
  // `prevFocus` は同タイミングのフォーカスヒント。`kind` がコアレッシングを決める。
  recordCheckpoint: (
    prev: Document,
    prevFocus: FocusIntent | null,
    kind: RecordKind,
  ) => void;
  // 履歴をすべて破棄する。init や外部 update 受信時に呼ぶ。
  reset: () => void;
  // 現在状態を future に積み、past の末尾を返す。null は「戻れる先がない」。
  popUndo: (currentDoc: Document, currentFocus: FocusIntent | null) => {
    doc: Document;
    focus: FocusIntent | null;
  } | null;
  // 現在状態を past に積み、future の末尾を返す。null は「進める先がない」。
  popRedo: (currentDoc: Document, currentFocus: FocusIntent | null) => {
    doc: Document;
    focus: FocusIntent | null;
  } | null;
};

export const useDocumentHistory = (): DocumentHistory => {
  const pastRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);

  const recordCheckpoint = useCallback(
    (prev: Document, prevFocus: FocusIntent | null, kind: RecordKind): void => {
      const past = pastRef.current;
      const last = past[past.length - 1];
      const now = Date.now();
      // 連続タイピングのコアレッシング: 直前も soft で時間ウィンドウ内なら、
      // 既存の「変更前スナップショット」を保ったまま新しい中間状態を捨てる。
      // → undo した結果が「typing 開始直前」に戻る挙動になる。
      if (
        kind === "soft"
        && last !== undefined
        && last.kind === "soft"
        && now - last.at < COALESCE_MS
      ) {
        last.at = now;
      } else {
        past.push({ doc: prev, focus: prevFocus, kind, at: now });
        if (past.length > HISTORY_LIMIT) past.shift();
      }
      // どんな新規変更も redo スタックを破棄する（標準的な undo モデル）。
      futureRef.current = [];
    },
    [],
  );

  const reset = useCallback((): void => {
    pastRef.current = [];
    futureRef.current = [];
  }, []);

  const popUndo = useCallback(
    (currentDoc: Document, currentFocus: FocusIntent | null) => {
      const entry = pastRef.current.pop();
      if (entry === undefined) return null;
      futureRef.current.push({
        doc: currentDoc,
        focus: currentFocus,
        kind: "hard",
        at: Date.now(),
      });
      return { doc: entry.doc, focus: entry.focus };
    },
    [],
  );

  const popRedo = useCallback(
    (currentDoc: Document, currentFocus: FocusIntent | null) => {
      const entry = futureRef.current.pop();
      if (entry === undefined) return null;
      pastRef.current.push({
        doc: currentDoc,
        focus: currentFocus,
        kind: "hard",
        at: Date.now(),
      });
      return { doc: entry.doc, focus: entry.focus };
    },
    [],
  );

  return { recordCheckpoint, reset, popUndo, popRedo };
};
