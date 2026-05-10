import type { Block, TaskItemBlock } from "@local-md-editor/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { RenderedBlock } from "../RenderedBlock.js";

vi.mock("../../../vscode.js", () => ({ post: vi.fn() }));
vi.mock("../../../resources.js", () => ({
  classifyUrl: () => ({ kind: "remote" }),
  useResolvedUri: () => null,
}));

const para = (source: string): Block => ({ id: "p", kind: "paragraph", source, inlines: [] });

// when: <RenderedBlock /> をマウントして種別ごとの DOM を検証する
describe("RenderedBlock", () => {
  describe("heading", () => {
    test("level に応じた <h1>〜<h6> タグを描画できる", () => {
      const { container, rerender } = render(
        <RenderedBlock
          block={{ id: "h", kind: "heading", level: 1, source: "# t", inlines: [] }}
          onChange={vi.fn()}
        />,
      );
      expect(container.querySelector("h1")).not.toBeNull();
      rerender(
        <RenderedBlock
          block={{ id: "h", kind: "heading", level: 3, source: "### t", inlines: [] }}
          onChange={vi.fn()}
        />,
      );
      expect(container.querySelector("h3")).not.toBeNull();
    });
  });

  describe("paragraph", () => {
    test("source の本文を <p> として描画できる", () => {
      const { container } = render(<RenderedBlock block={para("hello")} onChange={vi.fn()} />);
      expect(container.querySelector("p")?.textContent).toBe("hello");
    });

    test("空 paragraph は <br /> を含む <p> として高さを保てる", () => {
      const { container } = render(<RenderedBlock block={para("")} onChange={vi.fn()} />);
      expect(container.querySelector("p > br")).not.toBeNull();
    });
  });

  describe("bulletItem", () => {
    test("• マーカーと本文を描画できる", () => {
      const block: Block = { id: "b", kind: "bulletItem", source: "- item", inlines: [] };
      const { container } = render(<RenderedBlock block={block} onChange={vi.fn()} />);
      expect(container.textContent).toContain("•");
      expect(container.textContent).toContain("item");
    });
  });

  describe("orderedItem", () => {
    test("マーカー (1.) と本文を描画できる", () => {
      const block: Block = { id: "o", kind: "orderedItem", source: "1. one", inlines: [] };
      const { container } = render(<RenderedBlock block={block} onChange={vi.fn()} />);
      expect(container.textContent).toContain("1.");
      expect(container.textContent).toContain("one");
    });
  });

  describe("taskItem", () => {
    test("checkbox 状態 (checked) を反映できる", () => {
      const block: TaskItemBlock = {
        id: "t",
        kind: "taskItem",
        checked: true,
        source: "- [x] done",
        inlines: [],
      };
      render(<RenderedBlock block={block} onChange={vi.fn()} />);
      const cb = screen.getByRole("checkbox") as HTMLInputElement;
      expect(cb.checked).toBe(true);
    });

    test("checkbox トグルで onChange に新 checked を渡せる", () => {
      const onChange = vi.fn();
      const block: TaskItemBlock = {
        id: "t",
        kind: "taskItem",
        checked: false,
        source: "- [ ] todo",
        inlines: [],
      };
      render(<RenderedBlock block={block} onChange={onChange} />);
      fireEvent.click(screen.getByRole("checkbox"));
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
        checked: true,
        source: expect.stringContaining("[x]"),
      }));
    });
  });

  describe("thematicBreak", () => {
    test("<hr /> を描画できる", () => {
      const { container } = render(
        <RenderedBlock
          block={{ id: "tb", kind: "thematicBreak", source: "---" }}
          onChange={vi.fn()}
        />,
      );
      expect(container.querySelector("hr")).not.toBeNull();
    });
  });

  describe("blockquote", () => {
    test("> 接頭を取り除いた本文を <blockquote> として描画できる", () => {
      const { container } = render(
        <RenderedBlock
          block={{ id: "q", kind: "blockquote", source: "> hello" }}
          onChange={vi.fn()}
        />,
      );
      const bq = container.querySelector("blockquote");
      expect(bq?.textContent).toBe("hello");
    });
  });

  describe("その他 (RawBlock デフォルト)", () => {
    test("html / other 系は <pre> で素の source を描画できる", () => {
      const { container } = render(
        <RenderedBlock
          block={{ id: "x", kind: "html", source: "<custom>raw</custom>" }}
          onChange={vi.fn()}
        />,
      );
      expect(container.querySelector("pre")?.textContent).toBe("<custom>raw</custom>");
    });
  });
});
