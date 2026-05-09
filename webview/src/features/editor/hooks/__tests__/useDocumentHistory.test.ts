import type { Document } from "@local-md-editor/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { FocusIntent } from "../../../../types/document.js";
import { useDocumentHistory } from "../useDocumentHistory.js";

const doc = (id: string): Document => ({
  blocks: [{ id, kind: "paragraph", source: id, inlines: [] }],
});

const focus = (id: string): FocusIntent => ({ id, cursor: "end" });

// COALESCE_MS = 250ms (実装側の定数と一致させて時間ジャンプを制御する)
const COALESCE_MS = 250;

// when: useDocumentHistory() を呼び履歴を操作する
describe("useDocumentHistory", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("初期状態", () => {
    test("undo / redo は最初は空でいずれも null を返せる", () => {
      const { result } = renderHook(() => useDocumentHistory());
      expect(result.current.popUndo(doc("cur"), null)).toBeNull();
      expect(result.current.popRedo(doc("cur"), null)).toBeNull();
    });
  });

  describe("基本的な undo / redo", () => {
    test("checkpoint 後に undo すると変更前の doc を取り戻せる", () => {
      const { result } = renderHook(() => useDocumentHistory());
      const before = doc("a");
      act(() => result.current.recordCheckpoint(before, focus("a"), "hard"));
      const undone = result.current.popUndo(doc("b"), focus("b"));
      expect(undone?.doc).toEqual(before);
      expect(undone?.focus).toEqual(focus("a"));
    });

    test("undo 直後に redo すると現在状態 (undo 直前の doc) に戻れる", () => {
      const { result } = renderHook(() => useDocumentHistory());
      act(() => result.current.recordCheckpoint(doc("a"), null, "hard"));
      result.current.popUndo(doc("b"), null);
      const redone = result.current.popRedo(doc("a"), null);
      expect(redone?.doc).toEqual(doc("b"));
    });

    test("新しい checkpoint は redo スタックを破棄できる", () => {
      const { result } = renderHook(() => useDocumentHistory());
      act(() => result.current.recordCheckpoint(doc("a"), null, "hard"));
      result.current.popUndo(doc("b"), null);
      // 新規変更が走った想定で別の checkpoint を積む
      act(() => result.current.recordCheckpoint(doc("a"), null, "hard"));
      expect(result.current.popRedo(doc("c"), null)).toBeNull();
    });
  });

  describe("コアレッシング", () => {
    test("連続する soft checkpoint を 1 ステップに統合できる", () => {
      const { result } = renderHook(() => useDocumentHistory());
      act(() => result.current.recordCheckpoint(doc("a"), null, "soft"));
      vi.advanceTimersByTime(COALESCE_MS - 50); // ウィンドウ内
      act(() => result.current.recordCheckpoint(doc("b"), null, "soft"));
      // undo は 1 回で「最初の checkpoint」に戻る
      const undone = result.current.popUndo(doc("c"), null);
      expect(undone?.doc).toEqual(doc("a"));
      expect(result.current.popUndo(doc("a"), null)).toBeNull();
    });

    test("ウィンドウを越えた soft checkpoint は別ステップにできる", () => {
      const { result } = renderHook(() => useDocumentHistory());
      act(() => result.current.recordCheckpoint(doc("a"), null, "soft"));
      vi.advanceTimersByTime(COALESCE_MS + 50); // ウィンドウ外
      act(() => result.current.recordCheckpoint(doc("b"), null, "soft"));
      // 2 回 undo できる
      const first = result.current.popUndo(doc("c"), null);
      expect(first?.doc).toEqual(doc("b"));
      const second = result.current.popUndo(doc("b"), null);
      expect(second?.doc).toEqual(doc("a"));
    });

    test("hard checkpoint は連続でもコアレッシングしない", () => {
      const { result } = renderHook(() => useDocumentHistory());
      act(() => result.current.recordCheckpoint(doc("a"), null, "hard"));
      vi.advanceTimersByTime(10);
      act(() => result.current.recordCheckpoint(doc("b"), null, "hard"));
      // 2 回 undo できる
      result.current.popUndo(doc("c"), null);
      expect(result.current.popUndo(doc("b"), null)).not.toBeNull();
    });
  });

  describe("reset", () => {
    test("past / future の両方を破棄できる", () => {
      const { result } = renderHook(() => useDocumentHistory());
      act(() => result.current.recordCheckpoint(doc("a"), null, "hard"));
      result.current.popUndo(doc("b"), null);
      // この時点で future に 1 つ、past に 0 つ。reset でクリアされる。
      act(() => result.current.reset());
      expect(result.current.popUndo(doc("c"), null)).toBeNull();
      expect(result.current.popRedo(doc("c"), null)).toBeNull();
    });
  });
});
