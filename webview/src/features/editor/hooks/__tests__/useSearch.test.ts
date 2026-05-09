import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useSearch } from "../useSearch.js";

// when: useSearch() で検索パネル状態を操作する
describe("useSearch", () => {
  describe("初期状態", () => {
    test("searchOpen=false / matches=空 / current=null として初期化できる", () => {
      const { result } = renderHook(() => useSearch());
      expect(result.current.searchOpen).toBe(false);
      expect(result.current.searchMatches.size).toBe(0);
      expect(result.current.currentMatchId).toBeNull();
    });
  });

  describe("開閉", () => {
    test("openSearch で searchOpen=true に切り替えられる", () => {
      const { result } = renderHook(() => useSearch());
      act(() => result.current.openSearch());
      expect(result.current.searchOpen).toBe(true);
    });

    test("closeSearch で searchOpen=false に戻せる", () => {
      const { result } = renderHook(() => useSearch());
      act(() => result.current.openSearch());
      act(() => result.current.closeSearch());
      expect(result.current.searchOpen).toBe(false);
    });
  });

  describe("マッチ更新", () => {
    test("handleSearchChange で current と matches を同時更新できる", () => {
      const { result } = renderHook(() => useSearch());
      const ids = new Set(["b1", "b2"]);
      act(() => result.current.handleSearchChange("b1", ids));
      expect(result.current.currentMatchId).toBe("b1");
      expect(result.current.searchMatches).toBe(ids);
    });

    test("マッチが空集合のとき current=null として扱える", () => {
      const { result } = renderHook(() => useSearch());
      act(() => result.current.handleSearchChange(null, new Set()));
      expect(result.current.currentMatchId).toBeNull();
      expect(result.current.searchMatches.size).toBe(0);
    });
  });
});
