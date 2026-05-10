import type { Document } from "@local-md-editor/shared";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useDocumentNavigation } from "../useDocumentNavigation.js";

const para = (id: string): Document["blocks"][number] => ({
  id,
  kind: "paragraph",
  source: id,
  inlines: [],
});

const useNavigationWithDoc = (initial: Document) => {
  const [doc, setDoc] = useState<Document | null>(initial);
  const nav = useDocumentNavigation({ setDoc });
  return { doc, ...nav };
};

// when: useDocumentNavigation() で focus / navigateOut を操作する
describe("useDocumentNavigation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("初期状態", () => {
    test("focus は null として初期化できる", () => {
      const { result } = renderHook(() => useDocumentNavigation({ setDoc: vi.fn() }));
      expect(result.current.focus).toBeNull();
      expect(result.current.focusRef.current).toBeNull();
    });
  });

  describe("focus と focusRef の同期", () => {
    test("setFocus 後に focusRef.current が同じ値を指せる", () => {
      const { result } = renderHook(() => useDocumentNavigation({ setDoc: vi.fn() }));
      act(() => result.current.setFocus({ id: "b1", cursor: "end" }));
      expect(result.current.focusRef.current).toEqual({ id: "b1", cursor: "end" });
    });

    test("focus は次の tick で自動的に null へクリアされる", () => {
      const { result } = renderHook(() => useDocumentNavigation({ setDoc: vi.fn() }));
      act(() => result.current.setFocus({ id: "b1", cursor: "end" }));
      // setTimeout(0) で fire-and-forget クリア
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(result.current.focus).toBeNull();
    });
  });

  describe("navigateOut", () => {
    test("dir=down で次の隣接ブロックの末尾にフォーカスを移せる", () => {
      const { result } = renderHook(() =>
        useNavigationWithDoc({ blocks: [para("a"), para("b"), para("c")] })
      );
      act(() => result.current.navigateOut("a", "down"));
      expect(result.current.focus).toEqual({ id: "b", cursor: "end" });
    });

    test("dir=up で前の隣接ブロックの末尾にフォーカスを移せる", () => {
      const { result } = renderHook(() =>
        useNavigationWithDoc({ blocks: [para("a"), para("b"), para("c")] })
      );
      act(() => result.current.navigateOut("c", "up"));
      expect(result.current.focus).toEqual({ id: "b", cursor: "end" });
    });

    test("先頭で dir=up を指示しても focus は更新されない", () => {
      const { result } = renderHook(() => useNavigationWithDoc({ blocks: [para("a"), para("b")] }));
      act(() => result.current.navigateOut("a", "up"));
      expect(result.current.focus).toBeNull();
    });

    test("末尾で dir=down を指示しても focus は更新されない", () => {
      const { result } = renderHook(() => useNavigationWithDoc({ blocks: [para("a"), para("b")] }));
      act(() => result.current.navigateOut("b", "down"));
      expect(result.current.focus).toBeNull();
    });

    test("存在しない blockId を指定しても focus は更新されない", () => {
      const { result } = renderHook(() => useNavigationWithDoc({ blocks: [para("a"), para("b")] }));
      act(() => result.current.navigateOut("nonexistent", "down"));
      expect(result.current.focus).toBeNull();
    });

    test("doc=null (init 未受信) でも navigateOut は no-op として安全に動作する", () => {
      // setDoc updater 内 `if (!prev) return prev;` true 分岐
      const useNavWithNullDoc = () => {
        const [, setDoc] = useState<Document | null>(null);
        return useDocumentNavigation({ setDoc });
      };
      const { result } = renderHook(() => useNavWithNullDoc());
      // 例外を投げず、focus も変更しないこと
      act(() => result.current.navigateOut("any-id", "down"));
      expect(result.current.focus).toBeNull();
    });
  });
});
