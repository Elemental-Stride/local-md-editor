import type { Block, ParagraphBlock, TaskItemBlock } from "@local-md-editor/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, test, vi } from "vitest";
import type { LinkPromptController } from "../../link-modal/index.js";
import type { SlashMenuController } from "../../slash-menu/index.js";
import { BlockEditor } from "../BlockEditor.js";

const para = (source: string): ParagraphBlock => ({
  id: "p",
  kind: "paragraph",
  source,
  inlines: [],
});

const stubSlashMenu = (overrides: Partial<SlashMenuController> = {}): SlashMenuController => ({
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

const stubLinkPrompt = (overrides: Partial<LinkPromptController> = {}): LinkPromptController => ({
  state: null,
  openFromTextarea: vi.fn(),
  apply: vi.fn(),
  cancel: vi.fn(),
  ...overrides,
});

const setup = (
  block: Block,
  overrides: Partial<Parameters<typeof BlockEditor>[0]> = {},
) => {
  const handlers = {
    onChange: vi.fn(),
    onCommit: vi.fn(),
    onFocus: vi.fn(),
    setEditing: vi.fn(),
    onKeyDown: vi.fn(),
    onTextareaDrop: vi.fn(),
  };
  const slashMenu = overrides.slashMenu ?? stubSlashMenu();
  const linkPrompt = overrides.linkPrompt ?? stubLinkPrompt();
  const taRef = overrides.taRef ?? createRef<HTMLTextAreaElement>();
  const result = render(
    <BlockEditor
      block={block}
      taRef={taRef}
      slashMenu={slashMenu}
      linkPrompt={linkPrompt}
      searchHighlight={null}
      {...handlers}
      {...overrides}
    />,
  );
  return { ...handlers, slashMenu, linkPrompt, ...result };
};

const ta = (): HTMLTextAreaElement => screen.getByRole("textbox") as HTMLTextAreaElement;

// when: <BlockEditor /> をマウントして編集挙動を観測する
describe("BlockEditor", () => {
  describe("textarea", () => {
    test("contentOf(block) を初期 value として描画できる", () => {
      setup({ ...para("hello"), source: "hello" });
      expect(ta().value).toBe("hello");
    });

    test("onChange で reclassify した block を渡せる", () => {
      const { onChange } = setup(para("hello"));
      fireEvent.change(ta(), { target: { value: "# new" } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "heading", level: 1 }),
      );
    });

    test("onBlur で setEditing(false) と onCommit を呼べる", () => {
      const { onCommit, setEditing } = setup(para("x"));
      fireEvent.blur(ta());
      expect(setEditing).toHaveBeenCalledWith(false);
      expect(onCommit).toHaveBeenCalled();
    });

    test("linkPrompt state が立っているときは onBlur で離脱しない", () => {
      const linkPrompt = stubLinkPrompt({
        state: { selStart: 0, selEnd: 0, defaultLabel: "", defaultUrl: "" },
      });
      const { onCommit, setEditing, container } = setup(para("x"), { linkPrompt });
      // LinkModal も textbox を含むため getByRole では特定できない。
      // textarea (block 編集用) を直接取得して blur する
      const textarea = container.querySelector("textarea")!;
      fireEvent.blur(textarea);
      expect(setEditing).not.toHaveBeenCalled();
      expect(onCommit).not.toHaveBeenCalled();
    });
  });

  describe("マーカー", () => {
    test("bulletItem では • マーカーを描画できる", () => {
      const block: Block = { id: "b", kind: "bulletItem", source: "- x", inlines: [] };
      const { container } = setup(block);
      expect(container.textContent).toContain("•");
    });

    test("orderedItem では 1. のようなマーカーを描画できる", () => {
      const block: Block = { id: "o", kind: "orderedItem", source: "5) x", inlines: [] };
      const { container } = setup(block);
      expect(container.textContent).toContain("5)");
    });

    test("taskItem ではチェックボックスを描画し、トグルで onChange を呼べる", () => {
      const onChange = vi.fn();
      const block: TaskItemBlock = {
        id: "t",
        kind: "taskItem",
        checked: false,
        source: "- [ ] x",
        inlines: [],
      };
      setup(block, { onChange });
      fireEvent.click(screen.getByRole("checkbox"));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ checked: true }),
      );
    });
  });

  describe("blockquote", () => {
    test("引用ブロックは <textarea> を直接描画 (マーカーなし)", () => {
      const block: Block = { id: "q", kind: "blockquote", source: "> x" };
      const { container } = setup(block);
      expect(container.querySelector("textarea")).not.toBeNull();
    });
  });

  describe("オーバーレイ", () => {
    test("slashMenu.open=true で <SlashMenu> を描画できる", () => {
      const slashMenu = stubSlashMenu({
        open: true,
        filteredItems: [{
          id: "h1",
          label: "見出し 1",
          hint: "/h1",
          apply: (b) => b,
        }],
      });
      setup(para("/h"), { slashMenu });
      expect(screen.getByText("見出し 1")).toBeInTheDocument();
    });

    test("linkPrompt.state が立っていれば <LinkModal> を描画できる", () => {
      const linkPrompt = stubLinkPrompt({
        state: { selStart: 0, selEnd: 0, defaultLabel: "", defaultUrl: "" },
      });
      setup(para("x"), { linkPrompt });
      expect(screen.getByPlaceholderText("https://example.com")).toBeInTheDocument();
    });
  });
});
