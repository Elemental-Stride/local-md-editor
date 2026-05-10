import type { Block } from "@local-md-editor/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { BlockList } from "../BlockList.js";

vi.mock("../../mermaid/index.js", () => ({
  MermaidView: () => <div data-testid="mermaid-stub" />,
}));
vi.mock("../../../vscode.js", () => ({ post: vi.fn() }));
vi.mock("../../../resources.js", () => ({
  classifyUrl: () => ({ kind: "remote" }),
  useResolvedUri: () => null,
}));

const para = (id: string, source: string): Block => ({
  id,
  kind: "paragraph",
  source,
  inlines: [],
});

const setup = (
  blocks: Block[],
  overrides: Partial<Parameters<typeof BlockList>[0]> = {},
) => {
  const handlers = {
    onChange: vi.fn(),
    onCommit: vi.fn(),
    onInsertAfter: vi.fn(),
    onSplitBlock: vi.fn(),
    onDeleteAndFocusPrev: vi.fn(),
    onReorder: vi.fn(),
    onNavigateOut: vi.fn(),
    onFocus: vi.fn(),
    onApplyBlockCommand: vi.fn(),
  };
  return {
    ...handlers,
    ...render(
      <BlockList
        document={{ blocks }}
        focus={overrides.focus ?? null}
        searchMatches={overrides.searchMatches ?? new Set()}
        currentMatchId={overrides.currentMatchId ?? null}
        {...handlers}
        {...overrides}
      />,
    ),
  };
};

// when: <BlockList /> をマウントしてブロック描画とハンドル操作する
describe("BlockList", () => {
  describe("ブロック描画", () => {
    test("blocks 数だけ data-block-row を描画できる", () => {
      const { container } = setup([para("a", "hi"), para("b", "yo")]);
      expect(container.querySelectorAll("[data-block-row]")).toHaveLength(2);
    });

    test("各 row に data-block-id 属性として block.id を付与できる", () => {
      const { container } = setup([para("a", "x"), para("b", "y")]);
      const rows = container.querySelectorAll("[data-block-row]");
      expect(rows[0].getAttribute("data-block-id")).toBe("a");
      expect(rows[1].getAttribute("data-block-id")).toBe("b");
    });
  });

  describe("ハンドルメニュー", () => {
    test("ハンドルクリックで BlockMenu (role=menu) が開く", () => {
      setup([para("a", "x")]);
      const handle = screen.getByLabelText("ブロックメニューを開く");
      fireEvent.click(handle);
      expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    test("再クリックでメニューをトグル (閉じる) できる", () => {
      setup([para("a", "x")]);
      const handle = screen.getByLabelText("ブロックメニューを開く");
      fireEvent.click(handle);
      fireEvent.click(handle);
      expect(screen.queryByRole("menu")).toBeNull();
    });
  });

  describe("ブロック更新の伝播", () => {
    test("RenderedBlock からの onChange は onChange に新 document を渡せる", () => {
      const { onChange } = setup([
        { id: "t", kind: "taskItem", checked: false, source: "- [ ] x", inlines: [] },
      ]);
      // checkbox を更新 → BlockList の updateBlock 経由で onChange に伝播
      fireEvent.click(screen.getByRole("checkbox"));
      expect(onChange).toHaveBeenCalled();
      const arg = onChange.mock.calls[0][0];
      expect(arg.blocks[0]).toMatchObject({ checked: true });
    });
  });

  describe("検索ハイライト", () => {
    test("searchMatches にある block には highlight クラスが付与される", () => {
      const { container } = setup([para("a", "x")], {
        searchMatches: new Set(["a"]),
      });
      // wrapper にハイライトクラスが追加される
      expect(container.querySelector(".bg-yellow-300\\/10")).not.toBeNull();
    });
  });
});
