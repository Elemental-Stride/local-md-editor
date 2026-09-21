import type { Block, ParagraphBlock, TableBlock } from "@local-md-editor/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

// Table / Code 系の delegate テストでは、子コンポーネントを「マウント直後に
// すべての callback prop を呼ぶ」スタブで差し替えて、BlockView が用意する
// 内部ラッパ (() => onDeleteAndFocusPrev(block.id) など) が実際に呼ばれる
// ことを確認する。これらのインライン関数は preview 経由では発火しないため
// 別途 exercise する必要がある。
vi.mock("../../mermaid/index.js", () => ({
  MermaidView: () => <div data-testid="mermaid-stub" />,
}));
vi.mock("../../../vscode.js", () => ({ post: vi.fn() }));
vi.mock("../../../resources.js", () => ({
  classifyUrl: () => ({ kind: "remote" }),
  useResolvedUri: () => null,
}));

import { BlockView } from "../BlockView.js";

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
      expect(container.querySelector("pre")).not.toBeNull();
    });
  });

  describe("テキスト系ブロックの編集切替", () => {
    test("初期は preview (RenderedBlock) を表示できる", () => {
      const { container } = setup(para("hello"));
      expect(container.querySelector("textarea")).toBeNull();
      expect(container.querySelector("p")?.textContent).toBe("hello");
    });

    test("preview をダブルクリックすると textarea が出る", () => {
      const { container, onFocus } = setup(para("hello"));
      const wrapper = container.querySelector(".cursor-text") as HTMLElement;
      fireEvent.doubleClick(wrapper);
      expect(container.querySelector("textarea")).not.toBeNull();
      expect(onFocus).toHaveBeenCalledWith("p");
    });

    test("シングルクリックでは preview のまま留まり選択を保てる", () => {
      const { container, onFocus } = setup(para("hello"));
      const wrapper = container.querySelector(".cursor-text") as HTMLElement;
      fireEvent.click(wrapper);
      expect(container.querySelector("textarea")).toBeNull();
      expect(onFocus).not.toHaveBeenCalled();
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

  describe("table delegate ラッパ", () => {
    test("TableView の onDelete を呼ぶと onDeleteAndFocusPrev(block.id) を呼べる", () => {
      // TableView 自体の「テーブルを削除」を動かすことで、BlockView 内の
      // 内部ラッパ () => onDeleteAndFocusPrev(block.id) が走ることを確認する。
      // 削除ボタンは左上に触れている間だけ出るので、先にそこへカーソルを置く。
      const { container, onDeleteAndFocusPrev } = setup(tableBlock());
      fireEvent.mouseEnter(container.querySelector('[data-zone="table-corner"]') as HTMLElement);
      fireEvent.click(screen.getByLabelText("テーブルを削除"));
      expect(onDeleteAndFocusPrev).toHaveBeenCalledWith("tb");
    });
  });

  describe("code delegate ラッパ", () => {
    const code = (): Block => ({
      id: "c",
      kind: "code",
      lang: "js",
      value: "x",
      source: "x",
    });

    test("CodeBlockView の preview ダブルクリックで onFocus(block.id) を呼べる", () => {
      const { container, onFocus } = setup(code());
      const pre = container.querySelector("pre")!;
      fireEvent.doubleClick(pre);
      expect(onFocus).toHaveBeenCalledWith("c");
    });

    test("CodeBlockView 編集中の Cmd+Enter で onInsertAfter(block) を呼べる", () => {
      const { onInsertAfter } = setup(code(), { initiallyEditing: true });
      fireEvent.keyDown(screen.getByRole("textbox"), {
        key: "Enter",
        metaKey: true,
      });
      expect(onInsertAfter).toHaveBeenCalledWith(
        expect.objectContaining({ id: "c", kind: "code" }),
      );
    });

    test("CodeBlockView 編集中の空 Backspace で onDeleteAndFocusPrev(block.id) を呼べる", () => {
      const { onDeleteAndFocusPrev } = setup(
        { id: "c", kind: "code", lang: "", value: "", source: "" },
        { initiallyEditing: true },
      );
      fireEvent.keyDown(screen.getByRole("textbox"), { key: "Backspace" });
      expect(onDeleteAndFocusPrev).toHaveBeenCalledWith("c");
    });

    test("CodeBlockView 編集中の先頭行 ArrowUp で onNavigateOut(block.id, 'up') を呼べる", () => {
      const { onNavigateOut } = setup(code(), { initiallyEditing: true });
      const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
      ta.setSelectionRange(0, 0);
      fireEvent.keyDown(ta, { key: "ArrowUp" });
      expect(onNavigateOut).toHaveBeenCalledWith("c", "up");
    });
  });

  describe("dragOver", () => {
    test("dataTransfer.types に Files が含まれていれば preventDefault する", () => {
      const { container } = setup(para("hi"));
      const wrapper = container.querySelector(".cursor-text") as HTMLElement;
      // happy-dom: DataTransfer の types は配列ライクでアクセスできるため、
      // fireEvent.dragOver で types 入りの dataTransfer を渡す。
      const result = fireEvent.dragOver(wrapper, {
        dataTransfer: { types: ["Files"] },
      });
      // preventDefault が呼ばれていれば bubbles 関係なく event.defaultPrevented が true
      expect(result).toBe(false); // fireEvent returns !defaultPrevented
    });
  });
});
