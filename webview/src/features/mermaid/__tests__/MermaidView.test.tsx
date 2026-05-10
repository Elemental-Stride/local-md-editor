import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

// vi.mock は変換時に hoist されるため、ファクトリ内で top-level の spy を
// 参照すると TDZ になり得る。vi.hoisted で先回り評価する。
const spies = vi.hoisted(() => ({
  initializeSpy: vi.fn(),
  renderSpy: vi.fn(),
}));

vi.mock("mermaid", () => ({
  default: {
    initialize: (...args: unknown[]) => spies.initializeSpy(...args),
    render: (...args: unknown[]) => spies.renderSpy(...args),
  },
}));

import { MermaidView } from "../MermaidView.js";

const { initializeSpy, renderSpy } = spies;

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

    test("Error 以外の reject 値も文字列化してエラーとして表示できる", async () => {
      renderSpy.mockRejectedValue("plain string error");
      render(<MermaidView value="bad" />);
      await waitFor(() => expect(screen.getByText(/plain string error/)).toBeInTheDocument());
    });

    test("value が変わると古い render の結果は破棄される (token mismatch path)", async () => {
      // 1 回目の render を遅延させて、その間に value を更新する
      let resolveFirst!: (v: { svg: string; }) => void;
      renderSpy.mockImplementationOnce(
        () => new Promise<{ svg: string; }>((res) => (resolveFirst = res)),
      );
      renderSpy.mockResolvedValueOnce({ svg: '<svg data-testid="second"></svg>' });

      const { container, rerender } = render(<MermaidView value="first" />);
      // 2 回目を発行 (token 進む)
      rerender(<MermaidView value="second" />);
      // 2 回目の結果が描画されるのを待つ
      await waitFor(() => expect(container.querySelector("[data-testid='second']")).not.toBeNull());
      // 1 回目をようやく resolve しても、token が古いため描画は変わらない
      resolveFirst({ svg: '<svg data-testid="first"></svg>' });
      // 念のため tick 進めても first は描画されない
      await new Promise((r) => setTimeout(r, 0));
      expect(container.querySelector("[data-testid='first']")).toBeNull();
    });
  });

  describe("クリーンアップ", () => {
    test("アンマウント時に body 直下の stray 要素を取り除く", async () => {
      renderSpy.mockResolvedValue({ svg: "<svg></svg>" });
      const { unmount } = render(<MermaidView value="graph TD; A-->B" />);
      await waitFor(() => expect(renderSpy).toHaveBeenCalled());
      // mermaid.render が body に置く可能性のある stray 要素を手動で配置 (cleanup の効果を観測)
      const renderId = (renderSpy.mock.calls[0]?.[0] as string) ?? "mmd-";
      const stray = document.createElement("div");
      stray.id = renderId;
      document.body.appendChild(stray);
      const strayD = document.createElement("div");
      strayD.id = `d${renderId}`;
      document.body.appendChild(strayD);
      // アンマウントで cleanup が走り、stray が消える
      unmount();
      expect(document.getElementById(renderId)).toBeNull();
      expect(document.getElementById(`d${renderId}`)).toBeNull();
    });
  });
});
