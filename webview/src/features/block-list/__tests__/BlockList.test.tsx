import type { Block } from "@local-md-editor/shared";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
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

  describe("ドラッグ&ドロップで並べ替え", () => {
    // happy-dom の DataTransfer は不完全なので最小限のスタブを噛ます
    const makeDT = (data: Record<string, string> = {}) => {
      const store = { ...data } as Record<string, string>;
      return {
        types: Object.keys(store),
        getData: (k: string) => store[k] ?? "",
        setData: (k: string, v: string) => {
          store[k] = v;
        },
        setDragImage: () => {},
        get effectAllowed() {
          return "move";
        },
        set effectAllowed(_v: string) {},
        get dropEffect() {
          return "move";
        },
        set dropEffect(_v: string) {},
      } as unknown as DataTransfer;
    };

    test("ハンドル onDragStart で dataTransfer に block id を書き込む", () => {
      setup([para("a", "x"), para("b", "y")]);
      const handle = screen.getAllByLabelText("ブロックメニューを開く")[0];
      const dt = makeDT();
      fireEvent.dragStart(handle, { dataTransfer: dt });
      expect(dt.getData("application/x-local-md-editor-block")).toBe("a");
    });

    // happy-dom には DragEvent 型が無く、fireEvent.dragOver の eventInit に
    // clientY を渡しても伝播しない。createEvent で event を作ってから
    // defineProperty で clientY を上書き、その後 fireEvent で dispatch する。
    const fireDrag = (
      type: "dragOver" | "drop",
      el: Element,
      clientY: number,
      dt: DataTransfer,
    ): void => {
      const event = createEvent[type](el, { dataTransfer: dt });
      Object.defineProperty(event, "clientY", { value: clientY, configurable: true });
      fireEvent(el, event);
    };

    test("dragOver で y が上半分のとき where=before として onReorder を呼べる", () => {
      const { container, onReorder } = setup([para("a", "x"), para("b", "y")]);
      const rows = container.querySelectorAll("[data-block-row]");
      const dt = makeDT({ "application/x-local-md-editor-block": "a" });
      fireDrag("dragOver", rows[1], -1, dt);
      fireDrag("drop", rows[1], -1, dt);
      expect(onReorder).toHaveBeenCalledWith("a", "b", "before");
    });

    test("dragOver で y が下半分のとき where=after として onReorder を呼べる", () => {
      const { container, onReorder } = setup([para("a", "x"), para("b", "y")]);
      const rows = container.querySelectorAll("[data-block-row]");
      const dt = makeDT({ "application/x-local-md-editor-block": "a" });
      fireDrag("dragOver", rows[1], 1, dt);
      fireDrag("drop", rows[1], 1, dt);
      expect(onReorder).toHaveBeenCalledWith("a", "b", "after");
    });

    test("自分自身の上に drop しても onReorder を呼ばない", () => {
      const { container, onReorder } = setup([para("a", "x"), para("b", "y")]);
      const rows = container.querySelectorAll("[data-block-row]");
      const dt = makeDT({ "application/x-local-md-editor-block": "a" });
      fireDrag("dragOver", rows[0], 1, dt);
      fireDrag("drop", rows[0], 1, dt);
      expect(onReorder).not.toHaveBeenCalled();
    });

    test("dragOver 中はドロップインジケータを描画できる", () => {
      const { container } = setup([para("a", "x"), para("b", "y")]);
      const rows = container.querySelectorAll("[data-block-row]");
      const dt = makeDT({ "application/x-local-md-editor-block": "a" });
      fireDrag("dragOver", rows[1], -1, dt);
      // dropAt が立ち、インジケータの absolute 配置 div が描画される
      const indicators = container.querySelectorAll("[style*='var(--vscode-focusBorder)']");
      expect(indicators.length).toBeGreaterThan(0);
    });

    test("dragEnd でドロップ状態 (indicator / dragId) をリセットできる", () => {
      const { container } = setup([para("a", "x"), para("b", "y")]);
      const rows = container.querySelectorAll("[data-block-row]");
      const dt = makeDT({ "application/x-local-md-editor-block": "a" });
      fireDrag("dragOver", rows[1], -1, dt);
      // インジケータが立っている
      expect(container.querySelectorAll("[style*='var(--vscode-focusBorder)']").length)
        .toBeGreaterThan(0);
      // 親ラッパーで dragEnd を発火
      const wrapper = container.querySelector(".flex.flex-col") as HTMLElement;
      fireEvent.dragEnd(wrapper);
      // インジケータが消える
      expect(container.querySelectorAll("[style*='var(--vscode-focusBorder)']").length)
        .toBe(0);
    });

    test("ラッパーの dragLeave (currentTarget === target) でドロップ位置をクリアできる", () => {
      const { container } = setup([para("a", "x"), para("b", "y")]);
      const rows = container.querySelectorAll("[data-block-row]");
      const dt = makeDT({ "application/x-local-md-editor-block": "a" });
      fireDrag("dragOver", rows[1], -1, dt);
      const wrapper = container.querySelector(".flex.flex-col") as HTMLElement;
      // currentTarget === target を満たすため wrapper 自身を target にして dragLeave を発火
      fireEvent.dragLeave(wrapper);
      // dropAt がクリアされる → インジケータが消える
      expect(container.querySelectorAll("[style*='var(--vscode-focusBorder)']").length)
        .toBe(0);
    });

    test("MIME タイプが違う dataTransfer は受け付けない", () => {
      const { container, onReorder } = setup([para("a", "x"), para("b", "y")]);
      const rows = container.querySelectorAll("[data-block-row]");
      const dt = makeDT({ "text/plain": "irrelevant" });
      fireDrag("dragOver", rows[1], 5, dt);
      fireDrag("drop", rows[1], 5, dt);
      expect(onReorder).not.toHaveBeenCalled();
    });
  });
});
