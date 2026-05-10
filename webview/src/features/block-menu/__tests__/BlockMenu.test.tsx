import type { Block, Document } from "@local-md-editor/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { BlockMenu } from "../BlockMenu.js";

const para = (id: string): Block => ({ id, kind: "paragraph", source: id, inlines: [] });

const anchorRect = new DOMRect(0, 0, 100, 30);

const setup = (
  blocks: Block[],
  blockId: string,
) => {
  const onApply = vi.fn();
  const onClose = vi.fn();
  const block = blocks.find((b) => b.id === blockId);
  render(
    <BlockMenu
      block={block ?? blocks[0]}
      document={{ blocks }}
      anchorRect={anchorRect}
      onApply={onApply}
      onClose={onClose}
    />,
  );
  return { onApply, onClose };
};

// when: <BlockMenu /> をマウントしてアクションを発火させる
describe("BlockMenu", () => {
  describe("初期表示", () => {
    test("変換セクションの全 10 種を描画できる", () => {
      setup([para("a")], "a");
      expect(screen.getByText("変換")).toBeInTheDocument();
      expect(screen.getByText("テキスト")).toBeInTheDocument();
      expect(screen.getByText("見出し 1")).toBeInTheDocument();
      expect(screen.getByText("コードブロック")).toBeInTheDocument();
      expect(screen.getByText("区切り線")).toBeInTheDocument();
    });

    test("操作セクションには複製と削除を常に表示できる", () => {
      setup([para("a")], "a");
      expect(screen.getByText("複製")).toBeInTheDocument();
      expect(screen.getByText("削除")).toBeInTheDocument();
    });

    test("先頭ブロックには「上に移動」を表示しない", () => {
      setup([para("a"), para("b")], "a");
      expect(screen.queryByText("上に移動")).toBeNull();
      expect(screen.getByText("下に移動")).toBeInTheDocument();
    });

    test("末尾ブロックには「下に移動」を表示しない", () => {
      setup([para("a"), para("b")], "b");
      expect(screen.queryByText("下に移動")).toBeNull();
      expect(screen.getByText("上に移動")).toBeInTheDocument();
    });
  });

  describe("変換アクション", () => {
    test("「見出し 1」を選ぶと該当ブロックを heading に変換した document を渡せる", () => {
      const { onApply, onClose } = setup([para("a")], "a");
      fireEvent.click(screen.getByText("見出し 1"));
      expect(onApply).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({ kind: "heading", level: 1 }),
          ]),
        }),
        expect.objectContaining({ cursor: "end" }),
      );
      expect(onClose).toHaveBeenCalled();
    });

    test("「区切り線」を選ぶと thematicBreak に変換できる", () => {
      const { onApply } = setup([para("a")], "a");
      fireEvent.click(screen.getByText("区切り線"));
      expect(onApply).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({ kind: "thematicBreak" }),
          ]),
        }),
        expect.anything(),
      );
    });
  });

  describe("並べ替え", () => {
    test("「上に移動」で前の要素と入れ替える document を渡せる", () => {
      const { onApply } = setup([para("a"), para("b"), para("c")], "b");
      fireEvent.click(screen.getByText("上に移動"));
      const { blocks } = onApply.mock.calls[0][0] as Document;
      expect(blocks.map((x) => x.id)).toEqual(["b", "a", "c"]);
    });

    test("「下に移動」で次の要素と入れ替える document を渡せる", () => {
      const { onApply } = setup([para("a"), para("b"), para("c")], "b");
      fireEvent.click(screen.getByText("下に移動"));
      const { blocks } = onApply.mock.calls[0][0] as Document;
      expect(blocks.map((x) => x.id)).toEqual(["a", "c", "b"]);
    });
  });

  describe("複製", () => {
    test("「複製」で対象ブロックの直後に新 id でコピーを挿入できる", () => {
      const { onApply } = setup([para("a"), para("b")], "a");
      fireEvent.click(screen.getByText("複製"));
      const { blocks } = onApply.mock.calls[0][0] as Document;
      expect(blocks).toHaveLength(3);
      expect(blocks[0].id).toBe("a");
      expect(blocks[1].id).not.toBe("a");
      expect(blocks[2].id).toBe("b");
    });
  });

  describe("削除", () => {
    test("「削除」で対象ブロックを除いた document を渡せる", () => {
      const { onApply } = setup([para("a"), para("b"), para("c")], "b");
      fireEvent.click(screen.getByText("削除"));
      const [doc, focus] = onApply.mock.calls[0];
      expect((doc as Document).blocks.map((x) => x.id)).toEqual(["a", "c"]);
      expect(focus).toEqual({ id: "a", cursor: "end" });
    });
  });

  describe("外部からの close トリガー", () => {
    test("Escape キーで onClose を呼べる", () => {
      const { onClose } = setup([para("a")], "a");
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).toHaveBeenCalled();
    });

    test("Escape 以外のキーでは onClose を呼ばない (no-op 分岐)", () => {
      const { onClose } = setup([para("a")], "a");
      fireEvent.keyDown(window, { key: "a" });
      expect(onClose).not.toHaveBeenCalled();
    });

    test("メニュー外で mousedown すると onClose を呼べる", () => {
      const outside = document.createElement("div");
      document.body.appendChild(outside);
      const { onClose } = setup([para("a")], "a");
      fireEvent.mouseDown(outside);
      expect(onClose).toHaveBeenCalled();
      outside.remove();
    });

    test("target が null の mousedown では onClose を呼ばない (defensive guard)", () => {
      const { onClose } = setup([para("a")], "a");
      // window へ target=null の MouseEvent を直接 dispatch する。
      const evt = new Event("mousedown", { bubbles: true });
      // target は通常 dispatch 後に自動設定されるが、null をセットすると early-return
      // ガード (line 34-35) を通る
      Object.defineProperty(evt, "target", { value: null, configurable: true });
      window.dispatchEvent(evt);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("対象ブロックが見つからない", () => {
    test("document.blocks に block.id が無いと null を描画する (= 何も描画しない)", () => {
      const { container } = render(
        <BlockMenu
          block={para("missing")}
          document={{ blocks: [para("a")] }}
          anchorRect={anchorRect}
          onApply={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe("外部 scroll イベントでの自動 close", () => {
    test("メニュー外の scroll で onClose を呼べる", () => {
      const outside = document.createElement("div");
      document.body.appendChild(outside);
      const { onClose } = setup([para("a")], "a");
      // capture フェーズ listener が拾うので bubbles の有無は問わない。
      // target をメニュー外要素に向けて scroll を発火させる。
      const evt = new Event("scroll", { bubbles: false });
      Object.defineProperty(evt, "target", { value: outside, configurable: true });
      window.dispatchEvent(evt);
      expect(onClose).toHaveBeenCalled();
      outside.remove();
    });

    test("メニュー内 (overflow-y-auto) の scroll では onClose を呼ばない", () => {
      const { onClose } = setup([para("a")], "a");
      const menu = screen.getByRole("menu");
      const evt = new Event("scroll", { bubbles: false });
      Object.defineProperty(evt, "target", { value: menu, configurable: true });
      window.dispatchEvent(evt);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("ハンドル要素の mousedown は除外できる", () => {
    test("[data-block-handle] 配下の mousedown では onClose を呼ばない", () => {
      const handle = document.createElement("button");
      handle.setAttribute("data-block-handle", "");
      document.body.appendChild(handle);
      const { onClose } = setup([para("a")], "a");
      // このハンドル要素自体が target として mousedown を受ける想定
      fireEvent.mouseDown(handle);
      expect(onClose).not.toHaveBeenCalled();
      handle.remove();
    });
  });
});
