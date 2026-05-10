import type { CodeBlock } from "@local-md-editor/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { CodeBlockView } from "../CodeBlockView.js";

vi.mock("../../mermaid/index.js", () => ({
  MermaidView: () => <div data-testid="mermaid-stub" />,
}));

const code = (lang: string, value: string): CodeBlock => ({
  id: "c",
  kind: "code",
  lang,
  value,
  source: value,
});

const setup = (
  block: CodeBlock,
  overrides: Partial<Parameters<typeof CodeBlockView>[0]> = {},
) => {
  const handlers = {
    onChange: vi.fn(),
    onCommit: vi.fn(),
    onDelete: vi.fn(),
    onInsertAfter: vi.fn(),
    onNavigateOut: vi.fn(),
    onFocus: vi.fn(),
  };
  const result = render(
    <CodeBlockView block={block} {...handlers} {...overrides} />,
  );
  return { ...handlers, ...result };
};

const ta = (): HTMLTextAreaElement => screen.getByRole("textbox") as HTMLTextAreaElement;

// when: <CodeBlockView /> をマウントして編集 / キーボード操作する
describe("CodeBlockView", () => {
  describe("非編集モード (preview)", () => {
    test("initiallyEditing=false なら preview を表示できる", () => {
      const { container } = setup(code("js", "x"));
      expect(container.querySelector("textarea")).toBeNull();
      expect(container.querySelector("pre")).not.toBeNull();
    });

    test("preview をクリックすると編集モードに入れる", () => {
      const { container } = setup(code("js", "x"));
      const pre = container.querySelector("pre")!;
      fireEvent.click(pre);
      expect(container.querySelector("textarea")).not.toBeNull();
    });
  });

  describe("編集モード (textarea)", () => {
    test("initiallyEditing=true なら textarea を表示できる", () => {
      setup(code("js", "x"), { initiallyEditing: true });
      expect(ta()).toBeInTheDocument();
    });

    test("textarea の入力で onChange に新 value を渡せる", () => {
      const { onChange } = setup(code("js", "x"), { initiallyEditing: true });
      fireEvent.change(ta(), { target: { value: "y" } });
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ value: "y" }));
    });

    test("textarea の blur で編集モードを抜けて onCommit を呼べる", () => {
      const { onCommit } = setup(code("js", "x"), { initiallyEditing: true });
      fireEvent.blur(ta());
      expect(onCommit).toHaveBeenCalled();
    });
  });

  describe("キーボード (編集モード中)", () => {
    test("Cmd+Enter で onInsertAfter を呼べる", () => {
      const { onInsertAfter } = setup(code("js", "x"), { initiallyEditing: true });
      fireEvent.keyDown(ta(), { key: "Enter", metaKey: true });
      expect(onInsertAfter).toHaveBeenCalled();
    });

    test("Tab はインデントとして 2 スペースを value に挿入できる", () => {
      const { onChange } = setup(code("js", "ab"), { initiallyEditing: true });
      ta().setSelectionRange(1, 1);
      fireEvent.keyDown(ta(), { key: "Tab" });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ value: "a  b" }),
      );
    });

    test("空 value で Backspace を押すと onDelete を呼べる", () => {
      const { onDelete } = setup(code("js", ""), { initiallyEditing: true });
      fireEvent.keyDown(ta(), { key: "Backspace" });
      expect(onDelete).toHaveBeenCalled();
    });

    test("先頭行で ArrowUp を押すと onNavigateOut('up') を呼べる", () => {
      const { onNavigateOut } = setup(code("js", "x"), { initiallyEditing: true });
      ta().setSelectionRange(0, 0);
      fireEvent.keyDown(ta(), { key: "ArrowUp" });
      expect(onNavigateOut).toHaveBeenCalledWith("up");
    });

    test("末尾行で ArrowDown を押すと onNavigateOut('down') を呼べる", () => {
      const { onNavigateOut } = setup(code("js", "x"), { initiallyEditing: true });
      ta().setSelectionRange(1, 1);
      fireEvent.keyDown(ta(), { key: "ArrowDown" });
      expect(onNavigateOut).toHaveBeenCalledWith("down");
    });

    test("複数行の途中行 ArrowUp は onNavigateOut を呼ばない", () => {
      const { onNavigateOut } = setup(code("js", "a\nb"), { initiallyEditing: true });
      ta().setSelectionRange(2, 2); // "b" の前
      fireEvent.keyDown(ta(), { key: "ArrowUp" });
      expect(onNavigateOut).not.toHaveBeenCalled();
    });

    test("IME 変換中のキー入力は handler を発火させない", () => {
      const { onInsertAfter } = setup(code("js", "x"), { initiallyEditing: true });
      fireEvent.keyDown(ta(), { key: "Enter", metaKey: true, isComposing: true });
      expect(onInsertAfter).not.toHaveBeenCalled();
    });
  });

  describe("言語セレクト", () => {
    test("select 変更で onChange に新 lang を渡せる", () => {
      const { onChange } = setup(code("js", "x"));
      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "py" } });
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ lang: "py" }));
    });
  });

  describe("非編集モードでのキーボード", () => {
    test("選択状態で Backspace を押すと onDelete を呼べる", () => {
      const { container, onDelete } = setup(code("js", "x"));
      const wrapper = container.firstChild as HTMLElement;
      wrapper.focus();
      fireEvent.keyDown(wrapper, { key: "Backspace" });
      expect(onDelete).toHaveBeenCalled();
    });

    test("選択状態で Enter を押すと onInsertAfter を呼べる", () => {
      const { container, onInsertAfter } = setup(code("js", "x"));
      const wrapper = container.firstChild as HTMLElement;
      wrapper.focus();
      fireEvent.keyDown(wrapper, { key: "Enter" });
      expect(onInsertAfter).toHaveBeenCalled();
    });

    test("Escape は editing=true から非編集モードへ抜ける契機にできる", () => {
      // 編集モードで Escape → setEditing(false) → wrapper にフォーカス
      const { container } = setup(code("js", "x"), { initiallyEditing: true });
      fireEvent.keyDown(ta(), { key: "Escape" });
      // textarea が消えれば editing=false に戻った証拠
      expect(container.querySelector("textarea")).toBeNull();
    });

    test("ラッパーの focus / blur で selected state を切り替えられる", () => {
      // onFocus / onBlur の `if (e.target === e.currentTarget)` 真分岐 (line 138, 141)
      const { container } = setup(code("js", "x"));
      const wrapper = container.firstChild as HTMLElement;
      // happy-dom は outline をパース後 "var(...)" だけ残すなど挙動が緩いので
      // outlineOffset で selected state を観測する
      fireEvent.focus(wrapper);
      expect(wrapper.style.outlineOffset).toBe("-2px");
      fireEvent.blur(wrapper);
      expect(wrapper.style.outlineOffset).toBe("");
    });

    test("非編集モードでも IME 変換中のキー入力は handler を発火させない", () => {
      // wrapper の onKeyDown 内 `if (e.nativeEvent.isComposing) return;` 分岐
      const { container, onDelete } = setup(code("js", "x"));
      const wrapper = container.firstChild as HTMLElement;
      wrapper.focus();
      fireEvent.keyDown(wrapper, { key: "Backspace", isComposing: true });
      expect(onDelete).not.toHaveBeenCalled();
    });
  });
});
