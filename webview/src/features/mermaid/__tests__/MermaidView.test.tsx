import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const initializeSpy = vi.fn();
const renderSpy = vi.fn();

vi.mock("mermaid", () => ({
  default: {
    initialize: (...args: unknown[]) => initializeSpy(...args),
    render: (...args: unknown[]) => renderSpy(...args),
  },
}));

import { MermaidView } from "../MermaidView.js";

beforeEach(() => {
  initializeSpy.mockClear();
  renderSpy.mockClear();
});

// when: <MermaidView /> をマウントして mermaid.render を観測する
//
// NOTE: MermaidView は module-level の `initialized` フラグを持っており、
// 一度初期化されると再呼び出ししない。テスト間で状態を完全にリセットする
// のは現実的でない (vi.resetModules はテスト並列性とトレードオフ) ため、
// initialize 単独の挙動はテストせず、render パスの結果のみ観測する。
describe("MermaidView", () => {
  describe("空入力", () => {
    test("value が空文字なら placeholder を表示し render を呼ばない", () => {
      renderSpy.mockResolvedValue({ svg: "" });
      render(<MermaidView value="" />);
      expect(screen.getByText(/プレビューは空/)).toBeInTheDocument();
      expect(renderSpy).not.toHaveBeenCalled();
    });

    test("value が空白のみでも placeholder を表示し render を呼ばない", () => {
      renderSpy.mockResolvedValue({ svg: "" });
      // JSX の "..." 属性は HTML 属性扱いで \n がリテラル 2 文字になるため、
      // 実改行を渡すには {} で JS 式として渡す必要がある。
      const { container } = render(<MermaidView value={"   \n   "} />);
      expect(container.textContent).toContain("プレビューは空");
      expect(renderSpy).not.toHaveBeenCalled();
    });
  });

  describe("成功 path", () => {
    test("mermaid.render の成功で SVG を埋め込める", async () => {
      renderSpy.mockResolvedValue({ svg: '<svg data-testid="out"></svg>' });
      const { container } = render(<MermaidView value="graph TD; A-->B" />);
      await waitFor(() => expect(container.querySelector("[data-testid='out']")).not.toBeNull());
    });

    test("値が与えられたら mermaid.render が呼ばれる", async () => {
      renderSpy.mockResolvedValue({ svg: "<svg></svg>" });
      render(<MermaidView value="graph TD" />);
      await waitFor(() => expect(renderSpy).toHaveBeenCalled());
      const [, value] = renderSpy.mock.calls[0];
      expect(value).toBe("graph TD");
    });
  });

  describe("失敗 path", () => {
    test("mermaid.render が reject すると構文エラーを表示できる", async () => {
      renderSpy.mockRejectedValue(new Error("syntax bad"));
      render(<MermaidView value="graph TD; bad" />);
      await waitFor(() => expect(screen.getByText(/構文エラー/)).toBeInTheDocument());
      expect(screen.getByText(/syntax bad/)).toBeInTheDocument();
    });
  });
});
