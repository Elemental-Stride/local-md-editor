import type { Block, Document } from "@local-md-editor/shared";
import { render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { BlockView } from "../../../block/index.js";
import { useMarkdownCopy } from "../useMarkdownCopy.js";

vi.mock("../../../../vscode.js", () => ({ post: vi.fn() }));
vi.mock("../../../../resources.js", () => ({
  classifyUrl: () => ({ kind: "remote" }),
  useResolvedUri: () => null,
}));

const block: Block = {
  id: "p",
  kind: "paragraph",
  source: "目次は [index.md](index.md)",
  inlines: [],
};

// プレビューを描画したうえで、その全体を選択した状態を作る。
const renderPreview = (): HTMLElement => {
  const { container } = render(
    <div data-block-id="p">
      <BlockView
        block={block}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onInsertAfter={vi.fn()}
        onSplitBlock={vi.fn()}
        onDeleteAndFocusPrev={vi.fn()}
        onNavigateOut={vi.fn()}
        onFocus={vi.fn()}
      />
    </div>,
  );
  return container;
};

const stubSelection = (range: Range | null): void => {
  vi.spyOn(window, "getSelection").mockReturnValue(
    {
      rangeCount: range === null ? 0 : 1,
      isCollapsed: range === null,
      getRangeAt: () => range as Range,
    } as unknown as Selection,
  );
};

type CopyEvent = Event & { clipboardData: { setData: ReturnType<typeof vi.fn>; }; };

const dispatchCopy = (target: EventTarget): CopyEvent => {
  const e = new Event("copy", { bubbles: true, cancelable: true }) as CopyEvent;
  e.clipboardData = { setData: vi.fn() };
  target.dispatchEvent(e);
  return e;
};

const docRef = { current: { blocks: [block] } as Document };

afterEach(() => {
  vi.restoreAllMocks();
});

// when: useMarkdownCopy() を有効にした状態で copy イベントを起こす
describe("useMarkdownCopy", () => {
  describe("プレビューからのコピー", () => {
    test("選択範囲を markdown にして clipboardData へ載せられる", () => {
      const container = renderPreview();
      const range = document.createRange();
      range.selectNodeContents(container);
      stubSelection(range);
      renderHook(() => useMarkdownCopy({ docRef }));

      const e = dispatchCopy(document);
      expect(e.clipboardData.setData).toHaveBeenCalledWith(
        "text/plain",
        "目次は [index.md](index.md)",
      );
      expect(e.defaultPrevented).toBe(true);
    });
  });

  describe("既定動作に任せるケース", () => {
    test("textarea 内のコピーはそのまま素の markdown を運べる", () => {
      const container = renderPreview();
      const range = document.createRange();
      range.selectNodeContents(container);
      stubSelection(range);
      renderHook(() => useMarkdownCopy({ docRef }));

      const ta = document.createElement("textarea");
      document.body.appendChild(ta);
      const e = dispatchCopy(ta);
      expect(e.clipboardData.setData).not.toHaveBeenCalled();
    });

    test("選択が無いときは clipboardData へ書き込まない", () => {
      renderPreview();
      stubSelection(null);
      renderHook(() => useMarkdownCopy({ docRef }));

      const e = dispatchCopy(document);
      expect(e.clipboardData.setData).not.toHaveBeenCalled();
    });
  });
});
