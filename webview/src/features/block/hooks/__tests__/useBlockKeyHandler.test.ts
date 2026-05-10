import type { Block, ParagraphBlock } from "@local-md-editor/shared";
import { renderHook } from "@testing-library/react";
import { createRef, type KeyboardEvent } from "react";
import { describe, expect, test, vi } from "vitest";
import type { SlashMenuController } from "../../../slash-menu/index.js";
import { useBlockKeyHandler } from "../useBlockKeyHandler.js";

const para = (source: string): ParagraphBlock => ({
  id: "p",
  kind: "paragraph",
  source,
  inlines: [],
});

const stubSlash = (overrides: Partial<SlashMenuController> = {}): SlashMenuController => ({
  open: false,
  filter: "",
  index: 0,
  setIndex: vi.fn(),
  filteredItems: [],
  close: vi.fn(),
  selectItem: vi.fn(),
  syncFromContentChange: vi.fn(),
  ...overrides,
});

const setup = (
  block: Block,
  overrides: {
    slashMenu?: SlashMenuController;
    openLinkPrompt?: () => void;
  } = {},
) => {
  const handlers = {
    onChange: vi.fn(),
    onInsertAfter: vi.fn(),
    onSplitBlock: vi.fn(),
    onDeleteAndFocusPrev: vi.fn(),
    onNavigateOut: vi.fn(),
  };
  const taRef = createRef<HTMLTextAreaElement>();
  const ta = document.createElement("textarea");
  (taRef as { current: HTMLTextAreaElement; }).current = ta;
  const slashMenu = overrides.slashMenu ?? stubSlash();
  const openLinkPrompt = overrides.openLinkPrompt ?? vi.fn();
  const { result } = renderHook(() =>
    useBlockKeyHandler({
      block,
      ...handlers,
      taRef,
      slashMenu,
      openLinkPrompt,
    })
  );
  return { ...handlers, slashMenu, openLinkPrompt, ta, handler: result.current };
};

const fakeKey = (
  init: {
    key: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    isComposing?: boolean;
    selectionStart?: number;
    selectionEnd?: number;
    value?: string;
  },
  ta: HTMLTextAreaElement,
): KeyboardEvent<HTMLTextAreaElement> => {
  if (init.value !== undefined) ta.value = init.value;
  if (init.selectionStart !== undefined) {
    ta.setSelectionRange(init.selectionStart, init.selectionEnd ?? init.selectionStart);
  }
  return {
    key: init.key,
    metaKey: !!init.metaKey,
    ctrlKey: !!init.ctrlKey,
    shiftKey: !!init.shiftKey,
    nativeEvent: { isComposing: !!init.isComposing },
    currentTarget: ta,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent<HTMLTextAreaElement>;
};

// when: useBlockKeyHandler() の返り値である key handler を呼ぶ
describe("useBlockKeyHandler", () => {
  describe("IME 変換中", () => {
    test("isComposing 中は handler を素通りさせる", () => {
      const { handler, ta, onSplitBlock } = setup(para("hi"));
      handler(fakeKey({ key: "Enter", isComposing: true, value: "hi" }, ta));
      expect(onSplitBlock).not.toHaveBeenCalled();
    });
  });

  describe("Enter (split)", () => {
    test("通常 Enter で onSplitBlock を呼べる", () => {
      const { handler, ta, onSplitBlock } = setup(para("hello"));
      handler(fakeKey({ key: "Enter", value: "hello", selectionStart: 5 }, ta));
      expect(onSplitBlock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "p" }),
        "hello",
        "",
      );
    });

    test("Cmd+Enter で onInsertAfter を呼べる", () => {
      const { handler, ta, onInsertAfter } = setup(para("x"));
      handler(fakeKey({ key: "Enter", metaKey: true, value: "x" }, ta));
      expect(onInsertAfter).toHaveBeenCalled();
    });
  });

  describe("Escape", () => {
    test("Escape で textarea から blur できる", () => {
      const { handler, ta } = setup(para("x"));
      ta.focus();
      handler(fakeKey({ key: "Escape" }, ta));
      // happy-dom: blur 後 activeElement が body に戻る
      expect(document.activeElement).not.toBe(ta);
    });
  });

  describe("Cmd+K (link prompt)", () => {
    test("Cmd+K で openLinkPrompt を呼べる", () => {
      const openLinkPrompt = vi.fn();
      const { handler, ta } = setup(para("x"), { openLinkPrompt });
      handler(fakeKey({ key: "k", metaKey: true }, ta));
      expect(openLinkPrompt).toHaveBeenCalledWith(ta);
    });
  });

  describe("矢印キーでブロック離脱", () => {
    test("先頭行 ArrowUp で onNavigateOut('up') を呼べる", () => {
      const { handler, ta, onNavigateOut } = setup(para("x"));
      handler(fakeKey({ key: "ArrowUp", value: "x", selectionStart: 0 }, ta));
      expect(onNavigateOut).toHaveBeenCalledWith("p", "up");
    });

    test("末尾行 ArrowDown で onNavigateOut('down') を呼べる", () => {
      const { handler, ta, onNavigateOut } = setup(para("x"));
      handler(fakeKey({ key: "ArrowDown", value: "x", selectionStart: 1 }, ta));
      expect(onNavigateOut).toHaveBeenCalledWith("p", "down");
    });

    test("複数行の途中行 ArrowUp は onNavigateOut を呼ばない", () => {
      const { handler, ta, onNavigateOut } = setup(para("a\nb"));
      handler(fakeKey({ key: "ArrowUp", value: "a\nb", selectionStart: 2 }, ta));
      expect(onNavigateOut).not.toHaveBeenCalled();
    });
  });

  describe("Backspace", () => {
    test("見出しの先頭で Backspace を押すと paragraph に戻せる", () => {
      const heading: Block = {
        id: "h",
        kind: "heading",
        level: 1,
        source: "# title",
        inlines: [],
      };
      const { handler, ta, onChange } = setup(heading);
      handler(fakeKey({ key: "Backspace", value: "title", selectionStart: 0 }, ta));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "paragraph", source: "title" }),
      );
    });

    test("空の paragraph で Backspace を押すと onDeleteAndFocusPrev を呼べる", () => {
      const { handler, ta, onDeleteAndFocusPrev } = setup(para(""));
      handler(fakeKey({ key: "Backspace", value: "" }, ta));
      expect(onDeleteAndFocusPrev).toHaveBeenCalledWith("p");
    });
  });

  describe("Tab (インデント)", () => {
    test("Tab で paragraph の行頭に 2 スペースを挿入できる", () => {
      const { handler, ta, onChange } = setup(para("hello"));
      handler(fakeKey({ key: "Tab", value: "hello" }, ta));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ source: "  hello" }),
      );
    });

    test("Shift+Tab でインデントを 1 段戻せる", () => {
      const { handler, ta, onChange } = setup(para("  hello"));
      handler(fakeKey({ key: "Tab", shiftKey: true, value: "  hello" }, ta));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ source: "hello" }),
      );
    });

    test("heading では Tab を無視できる", () => {
      const heading: Block = {
        id: "h",
        kind: "heading",
        level: 1,
        source: "# x",
        inlines: [],
      };
      const { handler, ta, onChange } = setup(heading);
      handler(fakeKey({ key: "Tab", value: "x" }, ta));
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("スラッシュメニュー操作", () => {
    test("メニュー open 中の ArrowDown で index を 1 進められる", () => {
      const setIndex = vi.fn();
      const slashMenu = stubSlash({
        open: true,
        index: 0,
        filteredItems: [{ id: "h1", label: "h1", hint: "/h1", apply: (b) => b }, {
          id: "h2",
          label: "h2",
          hint: "/h2",
          apply: (b) => b,
        }],
        setIndex,
      });
      const { handler, ta } = setup(para("/"), { slashMenu });
      handler(fakeKey({ key: "ArrowDown" }, ta));
      expect(setIndex).toHaveBeenCalledWith(1);
    });

    test("メニュー open 中の Enter で 現在 index のアイテムを選択できる", () => {
      const selectItem = vi.fn();
      const item = { id: "h1", label: "h1", hint: "/h1", apply: (b: Block) => b };
      const slashMenu = stubSlash({
        open: true,
        index: 0,
        filteredItems: [item],
        selectItem,
      });
      const { handler, ta } = setup(para("/"), { slashMenu });
      handler(fakeKey({ key: "Enter" }, ta));
      expect(selectItem).toHaveBeenCalledWith(item);
    });

    test("メニュー open 中の Escape で close を呼べる", () => {
      const close = vi.fn();
      const slashMenu = stubSlash({ open: true, close });
      const { handler, ta } = setup(para("/"), { slashMenu });
      handler(fakeKey({ key: "Escape" }, ta));
      expect(close).toHaveBeenCalled();
    });
  });
});
