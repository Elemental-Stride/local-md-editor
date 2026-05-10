import type { Block, HeadingBlock, ParagraphBlock } from "@local-md-editor/shared";
import { act, render, renderHook } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, test } from "vitest";
import { useBlockEditing } from "../useBlockEditing.js";

// useBlockEditing は taRef を介して textarea にアクセスし、layout effect で
// 高さ調整 / カーソル位置設定を行う。useLayoutEffect の初期カーソル分岐や
// useEffect の RAF 経由のカーソル設定を exercise するには実 textarea を
// taRef に繋ぐ必要があるため、harness component を用意する。
type HarnessProps = {
  block: Block;
  initiallyEditing: boolean;
  initialCursor: "start" | "end" | undefined;
  onReady?: (api: ReturnType<typeof useBlockEditing>) => void;
};
const Harness = ({ block, initiallyEditing, initialCursor, onReady }: HarnessProps) => {
  const api = useBlockEditing({ block, initiallyEditing, initialCursor });
  useEffect(() => {
    onReady?.(api);
  });
  return <textarea ref={api.taRef} defaultValue={"source" in block ? block.source : ""} />;
};

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

  describe("textarea を taRef に繋いだとき (useLayoutEffect)", () => {
    test("initiallyEditing=true + initialCursor='end' で末尾にカーソルを置ける", () => {
      const { container } = render(
        <Harness
          block={{ ...para("hello"), source: "hello" }}
          initiallyEditing
          initialCursor="end"
        />,
      );
      const ta = container.querySelector("textarea") as HTMLTextAreaElement;
      // useLayoutEffect で markerLen=0 (paragraph) → setSelectionRange(value.length)
      expect(ta.selectionStart).toBe("hello".length);
    });

    test("initialCursor='start' の paragraph はマーカー長 0 で先頭にカーソルを置ける", () => {
      const { container } = render(
        <Harness
          block={{ ...para("hi"), source: "hi" }}
          initiallyEditing
          initialCursor="start"
        />,
      );
      const ta = container.querySelector("textarea") as HTMLTextAreaElement;
      // paragraph の markerLen は 0 → 先頭
      expect(ta.selectionStart).toBe(0);
    });

    test("initialCursor='start' の bullet item ではマーカー長分スキップしてカーソルを置ける", () => {
      const block: Block = {
        id: "b",
        kind: "bulletItem",
        source: "- hello",
        inlines: [],
      };
      const { container } = render(
        <Harness block={block} initiallyEditing initialCursor="start" />,
      );
      const ta = container.querySelector("textarea") as HTMLTextAreaElement;
      // source "- hello" の content は "hello" (5 文字), source.len(7) - content.len(5) = 2
      expect(ta.selectionStart).toBe(2);
    });

    test("heading の initialCursor='start' は markerLen=0 として扱える", () => {
      const heading: HeadingBlock = {
        id: "h",
        kind: "heading",
        level: 1,
        source: "# title",
        inlines: [],
      };
      const { container } = render(
        <Harness block={heading} initiallyEditing initialCursor="start" />,
      );
      const ta = container.querySelector("textarea") as HTMLTextAreaElement;
      // heading は markerLen=0 で扱われるので 0
      expect(ta.selectionStart).toBe(0);
    });

    test("editing 中に textarea の高さを auto-grow に設定できる", () => {
      const { container } = render(
        <Harness
          block={{ ...para("multi\nline"), source: "multi\nline" }}
          initiallyEditing
          initialCursor="end"
        />,
      );
      const ta = container.querySelector("textarea") as HTMLTextAreaElement;
      // useLayoutEffect で `el.style.height = "auto"; el.style.height = scrollHeight + "px"`
      // happy-dom では scrollHeight が 0 なので "0px" でも値は設定されている
      expect(ta.style.height).toMatch(/^\d+px$|^auto$/);
    });

    test("initiallyEditing=true 直後の RAF コールバックは textarea にカーソルを置ける (cursor='end')", async () => {
      // useEffect 内の requestAnimationFrame 経路 (lines 39-44) を観測する。
      // RAF を 1 フレーム進めて、再度カーソルが末尾に置かれることを確認。
      const { container } = render(
        <Harness
          block={{ ...para("foo"), source: "foo" }}
          initiallyEditing
          initialCursor="end"
        />,
      );
      const ta = container.querySelector("textarea") as HTMLTextAreaElement;
      // RAF の 1 フレームを待機
      await act(async () => {
        await new Promise((r) => requestAnimationFrame(() => r(undefined)));
      });
      // pos = ta.value.length
      expect(ta.selectionStart).toBe("foo".length);
    });

    test("initiallyEditing=true + cursor='start' の RAF コールバックは textarea の先頭にカーソルを置ける", async () => {
      const { container } = render(
        <Harness
          block={{ ...para("bar"), source: "bar" }}
          initiallyEditing
          initialCursor="start"
        />,
      );
      const ta = container.querySelector("textarea") as HTMLTextAreaElement;
      await act(async () => {
        await new Promise((r) => requestAnimationFrame(() => r(undefined)));
      });
      // RAF 経路は cursor === "start" なら pos=0
      expect(ta.selectionStart).toBe(0);
    });

    test("enteredViaClick=true の状態で再 effect が走ると末尾にカーソルを置ける", () => {
      // クリックで編集に入った想定: 最初は editing=false, click 後に
      // enteredViaClick.current=true が立ち、setEditing(true) で再 effect
      let api: ReturnType<typeof useBlockEditing> | null = null;
      const { container } = render(
        <Harness
          block={{ ...para("abcdef"), source: "abcdef" }}
          initiallyEditing={false}
          initialCursor={undefined}
          onReady={(a) => {
            api = a;
          }}
        />,
      );
      const ta = container.querySelector("textarea") as HTMLTextAreaElement;
      // クリック経由のフラグを立てて editing=true へ
      act(() => {
        api!.enteredViaClick.current = true;
        api!.setEditing(true);
      });
      // 末尾にカーソル
      expect(ta.selectionStart).toBe("abcdef".length);
    });
  });
});
