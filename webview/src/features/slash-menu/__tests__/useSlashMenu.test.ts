import type { Block } from "@local-md-editor/shared";
import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, test, vi } from "vitest";
import { useSlashMenu } from "../hooks/useSlashMenu.js";
import { SLASH_ITEMS } from "../SlashMenu.js";

const para = (id: string): Block => ({ id, kind: "paragraph", source: "", inlines: [] });

const useSlashMenuHarness = (args: {
  block?: Block;
  onChange?: (b: Block) => void;
  onInsertAfter?: (b: Block) => void;
} = {}) => {
  const taRef = useRef<HTMLTextAreaElement>(null);
  return useSlashMenu({
    block: args.block ?? para("p"),
    onChange: args.onChange ?? (() => {}),
    onInsertAfter: args.onInsertAfter ?? (() => {}),
    taRef,
  });
};

// when: useSlashMenu() でスラッシュメニューの開閉と選択を行う
describe("useSlashMenu", () => {
  describe("初期状態", () => {
    test("open=false / filter=空 / index=0 / 全 SLASH_ITEMS を返せる", () => {
      const { result } = renderHook(() => useSlashMenuHarness());
      expect(result.current.open).toBe(false);
      expect(result.current.filter).toBe("");
      expect(result.current.index).toBe(0);
      expect(result.current.filteredItems).toEqual(SLASH_ITEMS);
    });
  });

  describe("syncFromContentChange", () => {
    test("空 → / の遷移でメニューを開ける", () => {
      const { result } = renderHook(() => useSlashMenuHarness());
      act(() => result.current.syncFromContentChange("", "/"));
      expect(result.current.open).toBe(true);
      expect(result.current.filter).toBe("");
    });

    test("メニューが開いていて / 接頭の文字列なら filter を更新できる", () => {
      const { result } = renderHook(() => useSlashMenuHarness());
      act(() => result.current.syncFromContentChange("", "/"));
      act(() => result.current.syncFromContentChange("/", "/h1"));
      expect(result.current.open).toBe(true);
      expect(result.current.filter).toBe("h1");
    });

    test("メニュー開いていても / で始まらなくなったら閉じられる", () => {
      const { result } = renderHook(() => useSlashMenuHarness());
      act(() => result.current.syncFromContentChange("", "/"));
      act(() => result.current.syncFromContentChange("/", "regular text"));
      expect(result.current.open).toBe(false);
    });

    test("メニュー開いていて空白文字を含むようになったら閉じられる", () => {
      const { result } = renderHook(() => useSlashMenuHarness());
      act(() => result.current.syncFromContentChange("", "/"));
      act(() => result.current.syncFromContentChange("/", "/h1 extra"));
      expect(result.current.open).toBe(false);
    });

    test("閉じている状態の更新は無視できる", () => {
      const { result } = renderHook(() => useSlashMenuHarness());
      act(() => result.current.syncFromContentChange("", "abc"));
      expect(result.current.open).toBe(false);
    });
  });

  describe("filter による index リセット", () => {
    test("filter が変わると index が 0 に戻せる", () => {
      const { result } = renderHook(() => useSlashMenuHarness());
      act(() => result.current.syncFromContentChange("", "/"));
      act(() => result.current.setIndex(2));
      expect(result.current.index).toBe(2);
      act(() => result.current.syncFromContentChange("/", "/h"));
      expect(result.current.index).toBe(0);
    });
  });

  describe("close", () => {
    test("open / filter を初期値に戻せる", () => {
      const { result } = renderHook(() => useSlashMenuHarness());
      act(() => result.current.syncFromContentChange("", "/"));
      act(() => result.current.syncFromContentChange("/", "/h1"));
      act(() => result.current.close());
      expect(result.current.open).toBe(false);
      expect(result.current.filter).toBe("");
    });
  });

  describe("selectItem", () => {
    test("選択された SlashItem の apply 結果を onChange に渡せる", () => {
      const onChange = vi.fn();
      const { result } = renderHook(() => useSlashMenuHarness({ onChange }));
      const h1 = SLASH_ITEMS.find((i) => i.id === "h1")!;
      act(() => result.current.selectItem(h1));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "heading", level: 1 }),
      );
    });

    test("thenInsertAfter を持つアイテム (divider) は onInsertAfter も呼べる", () => {
      const onInsertAfter = vi.fn();
      const { result } = renderHook(() => useSlashMenuHarness({ onInsertAfter }));
      const divider = SLASH_ITEMS.find((i) => i.id === "divider")!;
      act(() => result.current.selectItem(divider));
      expect(onInsertAfter).toHaveBeenCalled();
    });

    test("thenInsertAfter が無いアイテムでは onInsertAfter を呼ばない", () => {
      const onInsertAfter = vi.fn();
      const { result } = renderHook(() => useSlashMenuHarness({ onInsertAfter }));
      const h1 = SLASH_ITEMS.find((i) => i.id === "h1")!;
      act(() => result.current.selectItem(h1));
      expect(onInsertAfter).not.toHaveBeenCalled();
    });

    test("selectItem の後はメニューが閉じられる", () => {
      const { result } = renderHook(() => useSlashMenuHarness());
      act(() => result.current.syncFromContentChange("", "/"));
      const h1 = SLASH_ITEMS.find((i) => i.id === "h1")!;
      act(() => result.current.selectItem(h1));
      expect(result.current.open).toBe(false);
    });
  });
});
