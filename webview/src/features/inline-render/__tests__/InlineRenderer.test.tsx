import type { InlineToken } from "@local-md-editor/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { renderInlines } from "../InlineRenderer.js";

const postSpy = vi.fn();
vi.mock("../../../vscode.js", () => ({
  post: (msg: unknown) => postSpy(msg),
}));

let resolvedValue: string | null | undefined = "vscode-webview://resolved.png";
vi.mock("../../../resources.js", () => ({
  classifyUrl: (url: string) => {
    if (url === "") return { kind: "remote" };
    if (url.startsWith("data:")) return { kind: "passthrough", uri: url };
    if (/^https?:\/\//i.test(url)) return { kind: "remote" };
    return { kind: "relative" };
  },
  useResolvedUri: () => resolvedValue,
}));

afterEach(() => {
  cleanup();
  postSpy.mockClear();
  resolvedValue = "vscode-webview://resolved.png";
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
      resolvedValue = "vscode-webview://resolved/foo.png";
      const { container } = render(
        <>{renderInlines([{ type: "image", url: "./foo.png", alt: "A" }])}</>,
      );
      expect(container.querySelector("img")?.getAttribute("src")).toBe(
        "vscode-webview://resolved/foo.png",
      );
    });

    test("解決中は ローディング表示を出せる", () => {
      resolvedValue = undefined;
      render(
        <>{renderInlines([{ type: "image", url: "./loading.png", alt: "X" }])}</>,
      );
      expect(screen.getByText(/読み込み中/)).toBeInTheDocument();
    });

    test("解決失敗時はエラー表示を出せる", () => {
      resolvedValue = null;
      render(
        <>{renderInlines([{ type: "image", url: "./missing.png", alt: "X" }])}</>,
      );
      expect(screen.getByText(/解決できませんでした/)).toBeInTheDocument();
    });
  });
});
