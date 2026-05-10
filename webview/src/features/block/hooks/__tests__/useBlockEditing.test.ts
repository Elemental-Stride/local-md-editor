import type { ParagraphBlock } from "@local-md-editor/shared";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useBlockEditing } from "../useBlockEditing.js";

const para = (source: string): ParagraphBlock => ({
  id: "p",
  kind: "paragraph",
  source,
  inlines: [],
});

// when: useBlockEditing() で編集モードのトグルと textarea ref を扱う
describe("useBlockEditing", () => {
  describe("初期状態", () => {
    test("initiallyEditing=false なら editing=false で開始できる", () => {
      const { result } = renderHook(() =>
        useBlockEditing({
          block: para("x"),
          initiallyEditing: false,
          initialCursor: undefined,
        })
      );
      expect(result.current.editing).toBe(false);
    });

    test("initiallyEditing=true なら editing=true で開始できる", () => {
      const { result } = renderHook(() =>
        useBlockEditing({
          block: para("x"),
          initiallyEditing: true,
          initialCursor: "end",
        })
      );
      expect(result.current.editing).toBe(true);
    });
  });

  describe("setEditing", () => {
    test("setEditing で編集モードを toggle できる", () => {
      const { result } = renderHook(() =>
        useBlockEditing({
          block: para("x"),
          initiallyEditing: false,
          initialCursor: undefined,
        })
      );
      act(() => result.current.setEditing(true));
      expect(result.current.editing).toBe(true);
      act(() => result.current.setEditing(false));
      expect(result.current.editing).toBe(false);
    });
  });

  describe("ref オブジェクト", () => {
    test("taRef は最初 null で初期化できる", () => {
      const { result } = renderHook(() =>
        useBlockEditing({
          block: para("x"),
          initiallyEditing: false,
          initialCursor: undefined,
        })
      );
      expect(result.current.taRef.current).toBeNull();
    });

    test("enteredViaClick は最初 false で初期化できる", () => {
      const { result } = renderHook(() =>
        useBlockEditing({
          block: para("x"),
          initiallyEditing: false,
          initialCursor: undefined,
        })
      );
      expect(result.current.enteredViaClick.current).toBe(false);
    });
  });

  describe("再エントリ", () => {
    test("initiallyEditing が false→true へ変わると editing=true に再アームできる", () => {
      const { result, rerender } = renderHook(
        (props: { initiallyEditing: boolean; }) =>
          useBlockEditing({
            block: para("x"),
            initiallyEditing: props.initiallyEditing,
            initialCursor: undefined,
          }),
        { initialProps: { initiallyEditing: false } },
      );
      expect(result.current.editing).toBe(false);
      rerender({ initiallyEditing: true });
      expect(result.current.editing).toBe(true);
    });
  });
});
