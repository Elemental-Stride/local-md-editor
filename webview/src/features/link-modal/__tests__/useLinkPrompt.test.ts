import type { Block } from "@local-md-editor/shared";
import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, test, vi } from "vitest";
import { useLinkPrompt } from "../hooks/useLinkPrompt.js";

const para = (id: string, source: string): Block => ({
  id,
  kind: "paragraph",
  source,
  inlines: [],
});

// taRef を実 textarea に向けて hook を回す harness。openFromTextarea へ渡す
// textarea も同じものを使う (apply 後の focus 復帰先と一致させる)。
const useLinkPromptHarness = (
  block: Block,
  onChange: (b: Block) => void = () => {},
) => {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const controller = useLinkPrompt({ block, onChange, taRef });
  return { taRef, controller };
};

const mountWithTextarea = (block: Block, onChange?: (b: Block) => void) => {
  const ta = document.createElement("textarea");
  ta.value = block.kind === "paragraph" ? block.source : "";
  document.body.appendChild(ta);
  const { result } = renderHook(() => useLinkPromptHarness(block, onChange));
  // 実際に React が ref に書き込むのは render 後なので、taRef を手動で結びつける
  (result.current.taRef as { current: HTMLTextAreaElement | null; }).current = ta;
  return { ta, result, cleanup: () => ta.remove() };
};

// when: useLinkPrompt() でリンク挿入モーダルの状態を扱う
describe("useLinkPrompt", () => {
  describe("初期状態", () => {
    test("state は null として初期化できる", () => {
      const { result } = renderHook(() => useLinkPromptHarness(para("p", "")));
      expect(result.current.controller.state).toBeNull();
    });
  });

  describe("openFromTextarea", () => {
    test("textarea の選択範囲を state に取り込める", () => {
      const { ta, result, cleanup } = mountWithTextarea(para("p", "hello world"));
      ta.setSelectionRange(0, 5); // "hello"
      act(() => result.current.controller.openFromTextarea(ta));
      expect(result.current.controller.state).toEqual({
        selStart: 0,
        selEnd: 5,
        defaultLabel: "hello",
        defaultUrl: "",
      });
      cleanup();
    });

    test("選択範囲が無い (caret のみ) なら defaultLabel は空文字になる", () => {
      const { ta, result, cleanup } = mountWithTextarea(para("p", "hello"));
      ta.setSelectionRange(2, 2);
      act(() => result.current.controller.openFromTextarea(ta));
      expect(result.current.controller.state?.defaultLabel).toBe("");
      cleanup();
    });
  });

  describe("apply", () => {
    test("選択範囲を [label](url) に置換した block を onChange に渡せる", () => {
      const onChange = vi.fn();
      const { ta, result, cleanup } = mountWithTextarea(para("p", "hello world"), onChange);
      ta.setSelectionRange(0, 5);
      act(() => result.current.controller.openFromTextarea(ta));
      act(() => result.current.controller.apply("hi", "https://e.x"));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "paragraph",
          source: "[hi](https://e.x) world",
        }),
      );
      cleanup();
    });

    test("label が空のときは url を表示テキストとして使える", () => {
      const onChange = vi.fn();
      const { ta, result, cleanup } = mountWithTextarea(para("p", "abc"), onChange);
      ta.setSelectionRange(0, 0);
      act(() => result.current.controller.openFromTextarea(ta));
      act(() => result.current.controller.apply("", "https://e.x"));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "[https://e.x](https://e.x)abc",
        }),
      );
      cleanup();
    });

    test("apply 完了後は state が null に戻せる", () => {
      const { ta, result, cleanup } = mountWithTextarea(para("p", "x"));
      ta.setSelectionRange(0, 0);
      act(() => result.current.controller.openFromTextarea(ta));
      act(() => result.current.controller.apply("L", "u"));
      expect(result.current.controller.state).toBeNull();
      cleanup();
    });

    test("state が null の状態で apply を呼ぶと no-op として扱える", () => {
      const onChange = vi.fn();
      const { result } = renderHook(() => useLinkPromptHarness(para("p", "x"), onChange));
      act(() => result.current.controller.apply("L", "u"));
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("cancel", () => {
    test("state を null に戻せる", () => {
      const { ta, result, cleanup } = mountWithTextarea(para("p", "x"));
      ta.setSelectionRange(0, 0);
      act(() => result.current.controller.openFromTextarea(ta));
      act(() => result.current.controller.cancel());
      expect(result.current.controller.state).toBeNull();
      cleanup();
    });
  });
});
