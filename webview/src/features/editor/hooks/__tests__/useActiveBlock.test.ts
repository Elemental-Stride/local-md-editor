import type { Document } from "@local-md-editor/shared";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useActiveBlock } from "../useActiveBlock.js";

// vscode.ts は VS Code webview グローバル (acquireVsCodeApi) に依存するため
// テストではモックして post を観測可能にする。
const postSpy = vi.fn();
vi.mock("../../../../vscode.js", () => ({
  post: (msg: unknown) => postSpy(msg),
}));

afterEach(() => {
  postSpy.mockClear();
});

const para = (id: string): Document["blocks"][number] => ({
  id,
  kind: "paragraph",
  source: id,
  inlines: [],
});

const useActiveBlockWithDoc = (initial: Document) => {
  const [doc, setDoc] = useState<Document | null>(initial);
  const active = useActiveBlock({ setDoc });
  return { doc, ...active };
};

// when: useActiveBlock + setDoc で activeBlockId を操作する
describe("useActiveBlock", () => {
  describe("初期状態", () => {
    test("activeBlockId は null として初期化できる", () => {
      const { result } = renderHook(() => useActiveBlock({ setDoc: vi.fn() }));
      expect(result.current.activeBlockId).toBeNull();
    });
  });

  describe("setActiveBlockId", () => {
    test("外部からフォーカス対象の id を設定できる", () => {
      const { result } = renderHook(() => useActiveBlock({ setDoc: vi.fn() }));
      act(() => result.current.setActiveBlockId("b2"));
      expect(result.current.activeBlockId).toBe("b2");
    });
  });

  describe("moveActiveBlock", () => {
    test("activeBlockId が null のときは doc を変更しない", () => {
      const { result } = renderHook(() =>
        useActiveBlockWithDoc({ blocks: [para("a"), para("b")] })
      );
      act(() => result.current.moveActiveBlock(1));
      expect(result.current.doc?.blocks.map((b) => b.id)).toEqual(["a", "b"]);
      expect(postSpy).not.toHaveBeenCalled();
    });

    test("delta=+1 でアクティブブロックを 1 つ下へ移動できる", () => {
      const { result } = renderHook(() =>
        useActiveBlockWithDoc({ blocks: [para("a"), para("b"), para("c")] })
      );
      act(() => result.current.setActiveBlockId("a"));
      act(() => result.current.moveActiveBlock(1));
      expect(result.current.doc?.blocks.map((b) => b.id)).toEqual(["b", "a", "c"]);
    });

    test("delta=-1 でアクティブブロックを 1 つ上へ移動できる", () => {
      const { result } = renderHook(() =>
        useActiveBlockWithDoc({ blocks: [para("a"), para("b"), para("c")] })
      );
      act(() => result.current.setActiveBlockId("c"));
      act(() => result.current.moveActiveBlock(-1));
      expect(result.current.doc?.blocks.map((b) => b.id)).toEqual(["a", "c", "b"]);
    });

    test("先頭で delta=-1 を試みても移動しない", () => {
      const { result } = renderHook(() =>
        useActiveBlockWithDoc({ blocks: [para("a"), para("b")] })
      );
      act(() => result.current.setActiveBlockId("a"));
      act(() => result.current.moveActiveBlock(-1));
      expect(result.current.doc?.blocks.map((b) => b.id)).toEqual(["a", "b"]);
    });

    test("末尾で delta=+1 を試みても移動しない", () => {
      const { result } = renderHook(() =>
        useActiveBlockWithDoc({ blocks: [para("a"), para("b")] })
      );
      act(() => result.current.setActiveBlockId("b"));
      act(() => result.current.moveActiveBlock(1));
      expect(result.current.doc?.blocks.map((b) => b.id)).toEqual(["a", "b"]);
    });

    test("移動成功時に extension へ edit メッセージを送信できる", () => {
      const { result } = renderHook(() =>
        useActiveBlockWithDoc({ blocks: [para("a"), para("b")] })
      );
      act(() => result.current.setActiveBlockId("a"));
      act(() => result.current.moveActiveBlock(1));
      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "edit" }),
      );
    });
  });
});
