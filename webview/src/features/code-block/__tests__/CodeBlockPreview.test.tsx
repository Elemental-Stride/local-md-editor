import type { CodeBlock } from "@local-md-editor/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { CodeBlockPreview } from "../CodeBlockPreview.js";

// MermaidView は実描画 (mermaid lib 起動) を伴うのでテスト用にスタブ。
// クラス・属性で識別できるよう role=presentation とテキストを残す。
vi.mock("../../mermaid/index.js", () => ({
  MermaidView: ({ value }: { value: string; }) => (
    <div role="presentation" data-testid="mermaid-stub">{value}</div>
  ),
}));

const code = (lang: string, value: string): CodeBlock => ({
  id: "c",
  kind: "code",
  lang,
  value,
  source: value,
});

// when: <CodeBlockPreview /> を render する
describe("CodeBlockPreview", () => {
  describe("通常の言語", () => {
    test("シンタックスハイライト付きの <pre> を描画できる", () => {
      const { container } = render(
        <CodeBlockPreview block={code("js", "const x = 1")} onEnterEdit={vi.fn()} />,
      );
      const pre = container.querySelector("pre");
      expect(pre).not.toBeNull();
      expect(pre?.textContent).toContain("const");
    });

    test("空の value はプレースホルダ「空のコードブロック」を表示できる", () => {
      render(<CodeBlockPreview block={code("js", "")} onEnterEdit={vi.fn()} />);
      expect(screen.getByText("空のコードブロック")).toBeInTheDocument();
    });

    test("<pre> をクリックすると onEnterEdit を呼べる", () => {
      const onEnterEdit = vi.fn();
      const { container } = render(
        <CodeBlockPreview block={code("js", "x")} onEnterEdit={onEnterEdit} />,
      );
      const pre = container.querySelector("pre");
      if (pre) fireEvent.click(pre);
      expect(onEnterEdit).toHaveBeenCalled();
    });
  });

  describe("Mermaid 言語", () => {
    test("lang=mermaid のとき MermaidView を描画できる", () => {
      render(
        <CodeBlockPreview
          block={code("mermaid", "graph TD; A-->B")}
          onEnterEdit={vi.fn()}
        />,
      );
      const stub = screen.getByTestId("mermaid-stub");
      expect(stub).toBeInTheDocument();
      expect(stub.textContent).toBe("graph TD; A-->B");
    });

    test("Mermaid 表示部分をクリックすると onEnterEdit を呼べる", () => {
      const onEnterEdit = vi.fn();
      const { container } = render(
        <CodeBlockPreview block={code("mermaid", "g")} onEnterEdit={onEnterEdit} />,
      );
      // 親 div (cursor-text + title) が onClick を持つ
      const wrapper = container.querySelector('[title="クリックして編集"]');
      expect(wrapper).not.toBeNull();
      if (wrapper) fireEvent.click(wrapper);
      expect(onEnterEdit).toHaveBeenCalled();
    });
  });
});
