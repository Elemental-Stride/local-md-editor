import type { InlineToken } from "@local-md-editor/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { renderInlines } from "../InlineRenderer.js";

// vi.mock は変換時に hoist されるため、ファクトリ内で top-level の let/const を
// 参照すると TDZ になり得る。spy と可変参照を vi.hoisted 経由で先回り評価する。
const harness = vi.hoisted(() => ({
  postSpy: vi.fn<(msg: unknown) => void>(),
  resolvedValue: { current: "vscode-webview://resolved.png" as string | null | undefined },
}));

vi.mock("../../../vscode.js", () => ({
  post: (msg: unknown) => harness.postSpy(msg),
}));

vi.mock("../../../resources.js", () => ({
  classifyUrl: (url: string) => {
    if (url === "") return { kind: "remote" };
    if (url.startsWith("data:")) return { kind: "passthrough", uri: url };
    if (/^https?:\/\//i.test(url)) return { kind: "remote" };
    return { kind: "relative" };
  },
  useResolvedUri: () => harness.resolvedValue.current,
}));

const postSpy = harness.postSpy;
const setResolvedValue = (v: string | null | undefined): void => {
  harness.resolvedValue.current = v;
};

afterEach(() => {
  cleanup();
  postSpy.mockClear();
  harness.resolvedValue.current = "vscode-webview://resolved.png";
});

const text = (value: string): InlineToken => ({ type: "text", value });

// when: renderInlines(tokens) で JSX を描画する
describe("renderInlines", () => {
  describe("基本のインライン要素", () => {
    test("text トークンをそのまま文字列として描画できる", () => {
      const { container } = render(<>{renderInlines([text("hello")])}</>);
      expect(container.textContent).toBe("hello");
    });

    test("strong を <strong> として描画できる", () => {
      const { container } = render(
        <>{renderInlines([{ type: "strong", children: [text("bold")] }])}</>,
      );
      expect(container.querySelector("strong")?.textContent).toBe("bold");
    });

    test("em を <em> として描画できる", () => {
      const { container } = render(
        <>{renderInlines([{ type: "em", children: [text("italic")] }])}</>,
      );
      expect(container.querySelector("em")?.textContent).toBe("italic");
    });

    test("code を <code> として描画できる", () => {
      const { container } = render(
        <>{renderInlines([{ type: "code", value: "x" }])}</>,
      );
      expect(container.querySelector("code")?.textContent).toBe("x");
    });

    test("break を <br /> として描画できる", () => {
      const { container } = render(<>{renderInlines([{ type: "break" }])}</>);
      expect(container.querySelector("br")).not.toBeNull();
    });
  });

  describe("リンク", () => {
    test("link を <a href> として描画できる", () => {
      render(
        <>
          {renderInlines([
            { type: "link", url: "https://e.x", children: [text("L")] },
          ])}
        </>,
      );
      const a = screen.getByRole("link", { name: "L" });
      expect(a).toHaveAttribute("href", "https://e.x");
    });

    test("リンククリックで openLink メッセージを送信できる", () => {
      render(
        <>
          {renderInlines([
            { type: "link", url: "https://e.x", children: [text("L")] },
          ])}
        </>,
      );
      fireEvent.click(screen.getByRole("link"));
      expect(postSpy).toHaveBeenCalledWith({ type: "openLink", url: "https://e.x" });
    });

    test("リンククリックは親要素の onClick を発火させない (stopPropagation)", () => {
      // RenderedBlock を包むラッパが onClick で edit mode に遷移するため、
      // リンククリックがそこへ伝播するとファイル遷移と編集開始が同時に走る。
      const parentClick = vi.fn();
      render(
        <div onClick={parentClick}>
          {renderInlines([
            { type: "link", url: "./other.md", children: [text("L")] },
          ])}
        </div>,
      );
      fireEvent.click(screen.getByRole("link"));
      expect(postSpy).toHaveBeenCalledWith({ type: "openLink", url: "./other.md" });
      expect(parentClick).not.toHaveBeenCalled();
    });
  });

  describe("画像", () => {
    test("data: URL を passthrough として <img> 描画できる", () => {
      const { container } = render(
        <>
          {renderInlines([
            { type: "image", url: "data:image/png;base64,xxx", alt: "A" },
          ])}
        </>,
      );
      const img = container.querySelector("img");
      expect(img?.getAttribute("src")).toBe("data:image/png;base64,xxx");
      expect(img?.getAttribute("alt")).toBe("A");
    });

    test("http(s) URL は CSP でブロックされるので alt テキストでフォールバック表示できる", () => {
      render(
        <>
          {renderInlines([
            { type: "image", url: "https://blocked.example/x.png", alt: "fallback" },
          ])}
        </>,
      );
      expect(screen.getByText("fallback")).toBeInTheDocument();
    });

    test("相対パスは extension での解決済み URI を使って <img> 描画できる", () => {
      setResolvedValue("vscode-webview://resolved/foo.png");
      const { container } = render(
        <>{renderInlines([{ type: "image", url: "./foo.png", alt: "A" }])}</>,
      );
      expect(container.querySelector("img")?.getAttribute("src")).toBe(
        "vscode-webview://resolved/foo.png",
      );
    });

    test("解決中は ローディング表示を出せる", () => {
      setResolvedValue(undefined);
      render(
        <>{renderInlines([{ type: "image", url: "./loading.png", alt: "X" }])}</>,
      );
      expect(screen.getByText(/読み込み中/)).toBeInTheDocument();
    });

    test("解決失敗時はエラー表示を出せる", () => {
      setResolvedValue(null);
      render(
        <>{renderInlines([{ type: "image", url: "./missing.png", alt: "X" }])}</>,
      );
      expect(screen.getByText(/解決できませんでした/)).toBeInTheDocument();
    });

    test("alt が空文字の remote 画像は url をテキストとして表示できる", () => {
      // RemoteImage の `alt || url` で alt が "" の場合 url にフォールバックする分岐
      render(
        <>
          {renderInlines([
            { type: "image", url: "https://blocked.example/img.png", alt: "" },
          ])}
        </>,
      );
      expect(screen.getByText("https://blocked.example/img.png")).toBeInTheDocument();
    });

    test("alt が空文字の解決中 (相対パス) では url をテキストとして表示できる", () => {
      // RelativeImage の解決中 `alt || url` else 分岐
      setResolvedValue(undefined);
      render(
        <>{renderInlines([{ type: "image", url: "./loading.png", alt: "" }])}</>,
      );
      expect(screen.getByText(/\.\/loading\.png/)).toBeInTheDocument();
    });
  });
});
