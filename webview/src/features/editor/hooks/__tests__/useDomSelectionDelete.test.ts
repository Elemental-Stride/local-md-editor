import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useDomSelectionDelete } from "../useDomSelectionDelete.js";

afterEach(() => {
  document.body.innerHTML = "";
});

const setupHook = () => {
  const deleteBlocks = vi.fn();
  renderHook(() => useDomSelectionDelete({ deleteBlocks }));
  return { deleteBlocks };
};

const fireKey = (key: string, target?: EventTarget): KeyboardEvent => {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  if (target) Object.defineProperty(e, "target", { value: target, configurable: true });
  window.dispatchEvent(e);
  return e;
};

const makeBlocks = (ids: string[]): HTMLElement[] => {
  return ids.map((id) => {
    const el = document.createElement("div");
    el.setAttribute("data-block-id", id);
    el.textContent = `block ${id}`;
    document.body.appendChild(el);
    return el;
  });
};

const selectRange = (start: Node, end: Node): void => {
  const range = document.createRange();
  range.setStart(start, 0);
  range.setEnd(end, end.childNodes.length);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
};

// when: useDomSelectionDelete() マウント中に Delete/Backspace を発火する
describe("useDomSelectionDelete", () => {
  describe("非編集モード", () => {
    test("DOM 選択が複数ブロックに跨る場合 Delete でブロックを一括削除できる", () => {
      const blocks = makeBlocks(["a", "b", "c"]);
      const { deleteBlocks } = setupHook();
      selectRange(blocks[0], blocks[2]);
      fireKey("Delete");
      expect(deleteBlocks).toHaveBeenCalled();
      const ids = deleteBlocks.mock.calls[0][0] as Set<string>;
      expect(ids.has("a")).toBe(true);
      expect(ids.has("b")).toBe(true);
      expect(ids.has("c")).toBe(true);
    });

    test("Backspace でも同じ削除ができる", () => {
      const blocks = makeBlocks(["a", "b"]);
      const { deleteBlocks } = setupHook();
      selectRange(blocks[0], blocks[1]);
      fireKey("Backspace");
      expect(deleteBlocks).toHaveBeenCalled();
    });

    test("選択範囲が無い (collapsed) なら何もしない", () => {
      makeBlocks(["a"]);
      const { deleteBlocks } = setupHook();
      window.getSelection()?.removeAllRanges();
      fireKey("Delete");
      expect(deleteBlocks).not.toHaveBeenCalled();
    });
  });

  describe("編集モード (textarea / input)", () => {
    test("textarea にフォーカスがある状態の Delete はネイティブに任せる", () => {
      const ta = document.createElement("textarea");
      document.body.appendChild(ta);
      const { deleteBlocks } = setupHook();
      fireKey("Delete", ta);
      expect(deleteBlocks).not.toHaveBeenCalled();
    });

    test("input フォーカス中の Backspace もネイティブに任せる", () => {
      const inp = document.createElement("input");
      document.body.appendChild(inp);
      const { deleteBlocks } = setupHook();
      fireKey("Backspace", inp);
      expect(deleteBlocks).not.toHaveBeenCalled();
    });
  });

  describe("関係ないキー", () => {
    test("Delete / Backspace 以外のキーは無視できる", () => {
      makeBlocks(["a", "b"]);
      const { deleteBlocks } = setupHook();
      fireKey("a");
      fireKey("Enter");
      expect(deleteBlocks).not.toHaveBeenCalled();
    });
  });
});
