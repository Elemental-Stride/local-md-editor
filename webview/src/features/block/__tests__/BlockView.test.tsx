import type { Block, ParagraphBlock, TableBlock } from "@local-md-editor/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { BlockView } from "../BlockView.js";

vi.mock("../../mermaid/index.js", () => ({
  MermaidView: () => <div data-testid="mermaid-stub" />,
}));
vi.mock("../../../vscode.js", () => ({ post: vi.fn() }));
vi.mock("../../../resources.js", () => ({
  classifyUrl: () => ({ kind: "remote" }),
  useResolvedUri: () => null,
}));

const para = (source: string): ParagraphBlock => ({
  id: "p",
  kind: "paragraph",
  source,
  inlines: [],
});

const tableBlock = (): TableBlock => ({
  id: "tb",
  kind: "table",
  source: "<table></table>",
  rows: [{
    id: "r0",
    cells: [{ id: "c0", text: "x", rowspan: 1, colspan: 1 }],
  }],
});

const setup = (
  block: Block,
  overrides: Partial<Parameters<typeof BlockView>[0]> = {},
) => {
  const handlers = {
    onChange: vi.fn(),
    onCommit: vi.fn(),
    onInsertAfter: vi.fn(),
    onSplitBlock: vi.fn(),
    onDeleteAndFocusPrev: vi.fn(),
    onNavigateOut: vi.fn(),
    onFocus: vi.fn(),
  };
  return {
    ...handlers,
    ...render(<BlockView block={block} {...handlers} {...overrides} />),
  };
};

// when: <BlockView /> をマウントして種別ごとのルーティングを確認する
describe("BlockView", () => {
  describe("kind ベースのルーティング", () => {
    test("table ブロックは TableView (table 要素) として描画できる", () => {
      const { container } = setup(tableBlock());
      expect(container.querySelector("table")).not.toBeNull();
    });

    test("code ブロックは <pre> ベースの CodeBlockView を描画できる", () => {
      const block: Block = { id: "c", kind: "code", lang: "js", value: "x", source: "x" };
      const { container } = setup(block);
      // CodeBlockView は preview <pre> を持つ
      expect(container.querySelector("pre")).not.toBeNull();
    });
  });

  describe("テキスト系ブロックの編集切替", () => {
    test("初期は preview (RenderedBlock) を表示できる", () => {
      const { container } = setup(para("hello"));
      expect(container.querySelector("textarea")).toBeNull();
      expect(container.querySelector("p")?.textContent).toBe("hello");
    });

    test("preview をクリックすると textarea が出る", () => {
      const { container, onFocus } = setup(para("hello"));
      const wrapper = container.querySelector(".cursor-text") as HTMLElement;
      fireEvent.click(wrapper);
      expect(container.querySelector("textarea")).not.toBeNull();
      expect(onFocus).toHaveBeenCalledWith("p");
    });

    test("initiallyEditing=true なら最初から textarea を出せる", () => {
      setup(para("x"), { initiallyEditing: true });
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });
  });

  describe("検索ハイライト", () => {
    test("searchHighlight が渡されると wrapper にハイライト用クラスが付く", () => {
      const { container } = setup(para("hi"), { searchHighlight: { current: true } });
      const wrapper = container.querySelector(".cursor-text") as HTMLElement;
      expect(wrapper.className).toContain("ring-2");
    });
  });
});
