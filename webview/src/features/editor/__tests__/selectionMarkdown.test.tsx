import type { Block } from "@local-md-editor/shared";
import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { BlockView } from "../../block/index.js";
import { selectionToMarkdown } from "../selectionMarkdown.js";

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

// BlockList と同じ [data-block-id] 行構造でプレビューを描画する。
const renderBlocks = (blocks: Block[]): HTMLElement => {
  const { container } = render(
    <div>
      {blocks.map((b) => (
        <div key={b.id} data-block-id={b.id}>
          <BlockView
            block={b}
            onChange={vi.fn()}
            onCommit={vi.fn()}
            onInsertAfter={vi.fn()}
            onSplitBlock={vi.fn()}
            onDeleteAndFocusPrev={vi.fn()}
            onNavigateOut={vi.fn()}
            onFocus={vi.fn()}
          />
        </div>
      ))}
    </div>,
  );
  return container;
};

const findText = (root: Node, needle: string): { node: Text; offset: number; } => {
  const walk = (n: Node): { node: Text; offset: number; } | null => {
    if (n.nodeType === 3) {
      const i = (n.textContent ?? "").indexOf(needle);
      return i >= 0 ? { node: n as Text, offset: i } : null;
    }
    for (const c of Array.from(n.childNodes)) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return null;
  };
  const hit = walk(root);
  if (!hit) throw new Error(`テキストが見つからない: ${needle}`);
  return hit;
};

// from の直前から to の直後までを選択する Range を作る。
const rangeBetween = (root: Node, from: string, to: string): Range => {
  const start = findText(root, from);
  const end = findText(root, to);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset + to.length);
  return range;
};

const selectAll = (root: Node): Range => {
  const range = document.createRange();
  range.selectNodeContents(root);
  return range;
};

// when: selectionToMarkdown(range, blocks) を呼ぶ
describe("selectionToMarkdown", () => {
  describe("ブロック内の部分選択", () => {
    test("選択範囲のリンクを [text](url) として復元できる", () => {
      const blocks = [para("p", "目次は [index.md](index.md) を見る")];
      const root = renderBlocks(blocks);
      const range = rangeBetween(root, "目次は", " を見る");
      expect(selectionToMarkdown(range, blocks)).toBe("目次は [index.md](index.md) を見る");
    });

    test("選択範囲の強調とインラインコードを markdown 記法へ戻せる", () => {
      const blocks = [para("p", "これは **太字** と `code` です")];
      const root = renderBlocks(blocks);
      const range = rangeBetween(root, "これは", " です");
      expect(selectionToMarkdown(range, blocks)).toBe("これは **太字** と `code` です");
    });

    test("引用の一文だけを選ぶと > を付けずリンクを保って返せる", () => {
      const blocks: Block[] = [{
        id: "q",
        kind: "blockquote",
        source: "> 出典は [a.md](a.md)。\n>\n> 目次は [b.md](b.md)。",
      }];
      const root = renderBlocks(blocks);
      const range = rangeBetween(root, "出典は", "。");
      expect(selectionToMarkdown(range, blocks)).toBe("出典は [a.md](a.md)。");
    });

    test("リスト項目の一部だけを選ぶとマーカー無しの本文を返せる", () => {
      const blocks: Block[] = [{ id: "b", kind: "bulletItem", source: "- 項目 A", inlines: [] }];
      const root = renderBlocks(blocks);
      const range = rangeBetween(root, "項目", "目");
      expect(selectionToMarkdown(range, blocks)).toBe("項目");
    });
  });

  describe("ブロック全体の選択", () => {
    test("引用を丸ごと選ぶと > 付きの source を返せる", () => {
      const blocks: Block[] = [{
        id: "q",
        kind: "blockquote",
        source: "> 出典は [a.md](a.md)。",
      }];
      const root = renderBlocks(blocks);
      expect(selectionToMarkdown(selectAll(root), blocks)).toBe("> 出典は [a.md](a.md)。");
    });

    test("リスト本文を丸ごと選ぶと - マーカー付きの source を返せる", () => {
      const blocks: Block[] = [{ id: "b", kind: "bulletItem", source: "- 項目 A", inlines: [] }];
      const root = renderBlocks(blocks);
      const range = rangeBetween(root, "項目", "A");
      expect(selectionToMarkdown(range, blocks)).toBe("- 項目 A");
    });

    test("見出しを丸ごと選ぶと # マーカー付きで返せる", () => {
      const blocks: Block[] = [{
        id: "h",
        kind: "heading",
        level: 2,
        source: "## 見出し",
        inlines: [],
      }];
      const root = renderBlocks(blocks);
      expect(selectionToMarkdown(selectAll(root), blocks)).toBe("## 見出し");
    });
  });

  describe("複数ブロックの選択", () => {
    test("見出しと段落を空行区切りの markdown として連結できる", () => {
      const blocks: Block[] = [
        { id: "h", kind: "heading", level: 1, source: "# タイトル", inlines: [] },
        para("p", "本文 [link](l.md)"),
      ];
      const root = renderBlocks(blocks);
      expect(selectionToMarkdown(selectAll(root), blocks))
        .toBe("# タイトル\n\n本文 [link](l.md)");
    });

    test("両端が途中で切れていても触れたブロックの source を連結できる", () => {
      const blocks: Block[] = [
        para("p1", "前の段落です"),
        para("p2", "次の段落 [l](l.md) です"),
      ];
      const root = renderBlocks(blocks);
      const range = rangeBetween(root, "の段落です", "次の段落");
      expect(selectionToMarkdown(range, blocks))
        .toBe("前の段落です\n\n次の段落 [l](l.md) です");
    });

    test("連続するリスト項目は改行 1 つで連結できる", () => {
      const blocks: Block[] = [
        { id: "b1", kind: "bulletItem", source: "- one", inlines: [] },
        { id: "b2", kind: "bulletItem", source: "- two", inlines: [] },
      ];
      const root = renderBlocks(blocks);
      expect(selectionToMarkdown(selectAll(root), blocks)).toBe("- one\n- two");
    });
  });

  describe("既定動作に任せるケース", () => {
    test("コードブロック内の部分選択では null を返す", () => {
      const blocks: Block[] = [{
        id: "c",
        kind: "code",
        lang: "js",
        value: "const x = 1",
        source: "```js\nconst x = 1\n```",
      }];
      const root = renderBlocks(blocks);
      const range = rangeBetween(root, "const", "x");
      expect(selectionToMarkdown(range, blocks)).toBeNull();
    });

    test("どのブロックにも重ならない選択では null を返す", () => {
      const blocks = [para("p", "hello")];
      renderBlocks(blocks);
      const outside = document.createElement("div");
      outside.textContent = "outside";
      document.body.appendChild(outside);
      expect(selectionToMarkdown(selectAll(outside), blocks)).toBeNull();
    });
  });
});
