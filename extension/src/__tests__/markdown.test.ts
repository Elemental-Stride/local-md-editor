import type {
  Block,
  BlockKind,
  CodeBlock,
  HeadingBlock,
  TableBlock,
} from "@local-md-editor/shared";
import { describe, expect, test } from "vitest";
import { documentToMarkdown, markdownToDocument } from "../markdown.js";

const kindsOf = (md: string): BlockKind[] => markdownToDocument(md).blocks.map((b) => b.kind);

const firstBlock = <K extends BlockKind>(md: string, kind: K): Block & { kind: K; } => {
  const blocks = markdownToDocument(md).blocks;
  const b = blocks[0];
  expect(b.kind).toBe(kind);
  return b as Block & { kind: K; };
};

// when: markdownToDocument(given) を呼ぶ
describe("markdownToDocument", () => {
  describe("ブロック種別の認識", () => {
    // dprint-ignore
    test.each`
      name                                        | given                              | then
      ${"見出し直後の段落を独立 paragraph として認識できる"} | ${"# Title\n\nbody text\n"}        | ${["heading", "paragraph"]}
      ${"連続する bullet を個別の bulletItem に分解できる"}  | ${"- one\n- two\n"}                | ${["bulletItem", "bulletItem"]}
      ${"見出し単独を heading として認識できる"}              | ${"## Sub\n"}                      | ${["heading"]}
      ${"番号付きリストを orderedItem として認識できる"}     | ${"1. one\n2. two\n"}              | ${["orderedItem", "orderedItem"]}
      ${"チェックボックスリストを taskItem として認識できる"} | ${"- [ ] todo\n- [x] done\n"}      | ${["taskItem", "taskItem"]}
      ${"フェンスドコードブロックを code として認識できる"}   | ${"```\nx\n```\n"}                  | ${["code"]}
      ${"引用を blockquote として認識できる"}                | ${"> quoted\n"}                    | ${["blockquote"]}
      ${"水平線を thematicBreak として認識できる"}            | ${"---\n"}                         | ${["thematicBreak"]}
      ${"生 HTML を html として認識できる"}                  | ${"<div>x</div>\n"}                | ${["html"]}
    `(
      "$name",
      ({ given, then }: { given: string; then: BlockKind[]; }) => {
        expect(kindsOf(given)).toEqual(then);
      },
    );
  });

  describe("見出しレベル", () => {
    // dprint-ignore
    test.each`
      name                          | given        | then
      ${"# を level 1 として扱える"} | ${"# h\n"}   | ${1}
      ${"## を level 2 として扱える"}| ${"## h\n"}  | ${2}
      ${"### を level 3 として扱える"}| ${"### h\n"} | ${3}
      ${"###### を level 6 として扱える"}| ${"###### h\n"} | ${6}
    `(
      "$name",
      ({ given, then }: { given: string; then: HeadingBlock["level"]; }) => {
        const h = firstBlock(given, "heading");
        expect(h.level).toBe(then);
      },
    );
  });

  describe("コードブロック", () => {
    test("lang 指定ありを (lang, value) に分離できる", () => {
      const c = firstBlock("```ts\nconst x = 1\n```\n", "code");
      expect(c.lang).toBe("ts");
      expect(c.value).toBe("const x = 1");
    });

    test("lang 指定なしを空文字 lang として扱える", () => {
      const c = firstBlock("```\nplain\n```\n", "code");
      expect(c.lang).toBe("");
      expect(c.value).toBe("plain");
    });
  });

  describe("インライン要素", () => {
    test("段落内の太字を strong トークンとして認識できる", () => {
      const p = firstBlock("**bold**\n", "paragraph");
      expect(p.inlines).toEqual([
        { type: "strong", children: [{ type: "text", value: "bold" }] },
      ]);
    });

    test("段落内の斜体を em トークンとして認識できる", () => {
      const p = firstBlock("*em*\n", "paragraph");
      expect(p.inlines[0]).toEqual({
        type: "em",
        children: [{ type: "text", value: "em" }],
      });
    });

    test("段落内の inline code を code トークンとして認識できる", () => {
      const p = firstBlock("`x`\n", "paragraph");
      expect(p.inlines[0]).toEqual({ type: "code", value: "x" });
    });

    test("段落内のリンクを link トークンとして認識できる", () => {
      const p = firstBlock("[label](https://e.x)\n", "paragraph");
      expect(p.inlines[0]).toEqual({
        type: "link",
        url: "https://e.x",
        title: undefined,
        children: [{ type: "text", value: "label" }],
      });
    });

    test("段落内の画像を image トークンとして認識できる", () => {
      const p = firstBlock("![alt](u.png)\n", "paragraph");
      expect(p.inlines[0]).toEqual({
        type: "image",
        url: "u.png",
        alt: "alt",
        title: undefined,
      });
    });

    test("ハード改行を break トークンとして認識できる", () => {
      const p = firstBlock("a  \nb\n", "paragraph");
      expect(p.inlines.some((t) => t.type === "break")).toBe(true);
    });
  });

  describe("HTML テーブル", () => {
    test("単純な <table><tr><td> を TableBlock に変換できる", () => {
      const blocks = markdownToDocument("<table><tr><td>x</td></tr></table>\n").blocks;
      expect(blocks[0].kind).toBe("table");
      const t = blocks[0] as TableBlock;
      expect(t.rows).toHaveLength(1);
      expect(t.rows[0].cells[0].text).toBe("x");
    });

    test("rowspan / colspan 属性を数値として読み取れる", () => {
      const md = `<table><tr><td rowspan="2" colspan="3">x</td></tr></table>\n`;
      const t = markdownToDocument(md).blocks[0] as TableBlock;
      expect(t.rows[0].cells[0].rowspan).toBe(2);
      expect(t.rows[0].cells[0].colspan).toBe(3);
    });

    test("<th> セルを isHeader=true として読み取れる", () => {
      const t = markdownToDocument("<table><tr><th>h</th></tr></table>\n")
        .blocks[0] as TableBlock;
      expect(t.rows[0].cells[0].isHeader).toBe(true);
    });

    test("セル内の <strong> を **bold** に復元できる", () => {
      const t = markdownToDocument(
        "<table><tr><td><strong>b</strong></td></tr></table>\n",
      ).blocks[0] as TableBlock;
      expect(t.rows[0].cells[0].text).toBe("**b**");
    });

    test("セル内の <br> を改行に復元できる", () => {
      const t = markdownToDocument("<table><tr><td>a<br>b</td></tr></table>\n")
        .blocks[0] as TableBlock;
      expect(t.rows[0].cells[0].text).toBe("a\nb");
    });

    test("セル内の <a href> を [label](url) に復元できる", () => {
      const t = markdownToDocument(
        `<table><tr><td><a href="https://e.x">L</a></td></tr></table>\n`,
      ).blocks[0] as TableBlock;
      expect(t.rows[0].cells[0].text).toBe("[L](https://e.x)");
    });

    test("セル内の <img> を ![alt](url) に復元できる", () => {
      const t = markdownToDocument(
        `<table><tr><td><img src="u.png" alt="A" /></td></tr></table>\n`,
      ).blocks[0] as TableBlock;
      expect(t.rows[0].cells[0].text).toBe("![A](u.png)");
    });

    test("セル内の未知タグ (<span>) は中身を透過させて text 化できる", () => {
      // cellHtmlToText の default walk (line 144) — 認識していないラッパー要素
      // を素通りさせて中の text を取り出す
      const t = markdownToDocument(
        "<table><tr><td><span>inner</span></td></tr></table>\n",
      ).blocks[0] as TableBlock;
      expect(t.rows[0].cells[0].text).toBe("inner");
    });

    test("セル内の <em> を *italic* に復元できる", () => {
      const t = markdownToDocument(
        "<table><tr><td><em>e</em></td></tr></table>\n",
      ).blocks[0] as TableBlock;
      expect(t.rows[0].cells[0].text).toBe("*e*");
    });

    test("セル内の <i> も *italic* と同等に扱える", () => {
      const t = markdownToDocument(
        "<table><tr><td><i>e</i></td></tr></table>\n",
      ).blocks[0] as TableBlock;
      expect(t.rows[0].cells[0].text).toBe("*e*");
    });

    test("セル内の <code> を `code` に復元できる", () => {
      const t = markdownToDocument(
        "<table><tr><td><code>x</code></td></tr></table>\n",
      ).blocks[0] as TableBlock;
      expect(t.rows[0].cells[0].text).toBe("`x`");
    });

    test("セル内の <b> も **bold** と同等に扱える", () => {
      const t = markdownToDocument(
        "<table><tr><td><b>b</b></td></tr></table>\n",
      ).blocks[0] as TableBlock;
      expect(t.rows[0].cells[0].text).toBe("**b**");
    });
  });

  describe("GFM パイプテーブル", () => {
    test("パイプテーブルを TableBlock に変換できる", () => {
      const blocks = markdownToDocument("| h |\n| --- |\n| a |\n").blocks;
      expect(blocks[0].kind).toBe("table");
    });

    test("先頭行を header (isHeader=true) として読み取れる", () => {
      const t = markdownToDocument("| h |\n| --- |\n| a |\n").blocks[0] as TableBlock;
      expect(t.rows[0].cells[0].isHeader).toBe(true);
    });

    test("本文行は isHeader=false として読み取れる", () => {
      const t = markdownToDocument("| h |\n| --- |\n| a |\n").blocks[0] as TableBlock;
      expect(t.rows[1].cells[0].isHeader).toBe(false);
    });

    test("複数列を全て読み取れる", () => {
      const t = markdownToDocument(
        "| h1 | h2 |\n| --- | --- |\n| a | b |\n",
      ).blocks[0] as TableBlock;
      expect(t.rows[0].cells.map((c) => c.text)).toEqual(["h1", "h2"]);
      expect(t.rows[1].cells.map((c) => c.text)).toEqual(["a", "b"]);
    });

    test("セル内の **bold** を markdown ソースとしてセルテキストに保持できる", () => {
      const t = markdownToDocument(
        "| h |\n| --- |\n| **a** |\n",
      ).blocks[0] as TableBlock;
      expect(t.rows[1].cells[0].text).toBe("**a**");
    });

    test("セル内のリンクを [label](url) としてセルテキストに保持できる", () => {
      const t = markdownToDocument(
        "| h |\n| --- |\n| [L](https://e.x) |\n",
      ).blocks[0] as TableBlock;
      expect(t.rows[1].cells[0].text).toBe("[L](https://e.x)");
    });

    test("セル内のインラインコードを `code` としてセルテキストに保持できる", () => {
      const t = markdownToDocument(
        "| h |\n| --- |\n| `x` |\n",
      ).blocks[0] as TableBlock;
      expect(t.rows[1].cells[0].text).toBe("`x`");
    });

    test("rowspan / colspan は 1 として扱える (GFM はサポート外)", () => {
      const t = markdownToDocument("| h |\n| --- |\n| a |\n").blocks[0] as TableBlock;
      expect(t.rows[0].cells[0].rowspan).toBe(1);
      expect(t.rows[0].cells[0].colspan).toBe(1);
    });
  });

  describe("空段落マーカー", () => {
    test("単独の \\\\ を空段落として正規化できる", () => {
      const p = firstBlock("\\\n", "paragraph");
      expect(p.source).toBe("");
      expect(p.inlines).toEqual([]);
    });
  });

  describe("リスト構造", () => {
    test("ネストした bullet を独立した bulletItem に展開できる", () => {
      const blocks = markdownToDocument("- a\n  - b\n").blocks;
      expect(blocks.map((b) => b.kind)).toEqual(["bulletItem", "bulletItem"]);
    });

    test("リストアイテム内の継続段落を独立 paragraph として切り出せる", () => {
      const blocks = markdownToDocument("- item\n\n  continuation\n").blocks;
      expect(blocks.map((b) => b.kind)).toEqual(["bulletItem", "paragraph"]);
    });

    test("空のリストアイテム (段落子要素なし) を空 source の bulletItem として扱える", () => {
      // remark-gfm は `-` 単独行を「段落のない空アイテム」としてパースする
      // → extractListBlocks 内で leadEnd が null のまま position.end へフォールバック
      const blocks = markdownToDocument("-\n").blocks;
      expect(blocks.map((b) => b.kind)).toEqual(["bulletItem"]);
      expect(blocks[0].source).toBeDefined();
    });
  });

  describe("既知範囲外の phrasing 要素", () => {
    test("strikethrough (~~text~~) は default 経路で flattenText を通り text 化できる", () => {
      // remark-gfm の delete 型は default ケースでヒットし、children を持つので
      // flattenText の "children" in n 分岐 (line 32) が通る
      const p = firstBlock("~~struck~~\n", "paragraph");
      const textTokens = p.inlines.filter((t) => t.type === "text");
      expect(textTokens.some((t) => "value" in t && t.value === "struck")).toBe(true);
    });

    test("strikethrough 内のネスト (~~**bold**~~) で flattenText の再帰経路を通る", () => {
      // 外側の delete (default) → flattenText 呼び出し → strong child は text を持たない
      // ので "children" in n 分岐から再帰呼び出し (line 32) が走る
      const p = firstBlock("~~**inner**~~\n", "paragraph");
      // 結果はとにかく描画落ちしなければ OK (text として "inner" が拾える)
      const textTokens = p.inlines.filter((t) => t.type === "text");
      expect(textTokens.some((t) => "value" in t && t.value === "inner")).toBe(true);
    });
  });
});

// when: documentToMarkdown(given) を呼ぶ
describe("documentToMarkdown", () => {
  describe("基本シリアライズ", () => {
    test("空ドキュメントを空文字列として返せる", () => {
      expect(documentToMarkdown({ blocks: [] })).toBe("");
    });

    test("paragraph をそのまま source として書き出せる", () => {
      const md = "hello\n";
      const doc = markdownToDocument(md);
      expect(documentToMarkdown(doc)).toBe(md);
    });

    test("空段落を \\\\ プレースホルダとして書き出せる", () => {
      const out = documentToMarkdown({
        blocks: [{ id: "x", kind: "paragraph", source: "", inlines: [] }],
      });
      expect(out).toContain("\\");
    });
  });

  describe("コードブロックのフェンス計算", () => {
    test("通常は 3 連バッククォートで囲める", () => {
      const block: CodeBlock = {
        id: "c",
        kind: "code",
        lang: "js",
        value: "x",
        source: "",
      };
      expect(documentToMarkdown({ blocks: [block] })).toBe("```js\nx\n```\n");
    });

    test("value 内に 3 連バッククォートがある場合はフェンス長を増やせる", () => {
      const block: CodeBlock = {
        id: "c",
        kind: "code",
        lang: "",
        value: "```",
        source: "",
      };
      const out = documentToMarkdown({ blocks: [block] });
      expect(out.startsWith("````")).toBe(true);
    });

    test("先に長いバッククォート列があり、後に短い列が来てもフェンスは長い方に追従できる", () => {
      // fenceFor の `if (cur > max)` else 分岐 (line 372) を観測する。
      // 先に 4 連 (max=4) → 区切り → 2 連 (cur=1,2 とも < max なので else を 2 回通る)
      const block: CodeBlock = {
        id: "c",
        kind: "code",
        lang: "",
        value: "```` xx ``",
        source: "",
      };
      const out = documentToMarkdown({ blocks: [block] });
      // 4+1 = 5 連バッククォートのフェンスになる
      expect(out.startsWith("`````")).toBe(true);
    });
  });

  describe("ブロック間 separator", () => {
    test("同じリストファミリの bullet 同士は単一改行で区切る", () => {
      const md = "- a\n- b\n";
      const doc = markdownToDocument(md);
      expect(documentToMarkdown(doc)).toBe(md);
    });

    test("異種ブロック間は空行で区切る", () => {
      const md = "# h\n\nbody\n";
      expect(documentToMarkdown(markdownToDocument(md))).toBe(md);
    });
  });

  describe("テーブル再生成", () => {
    test("header 行のない rows は HTML フォールバックで再生成できる", () => {
      const block: TableBlock = {
        id: "t",
        kind: "table",
        source: "",
        rows: [{
          id: "r0",
          cells: [{ id: "c0", text: "x", rowspan: 1, colspan: 1 }],
        }],
      };
      const out = documentToMarkdown({ blocks: [block] });
      expect(out).toContain("<table>");
      expect(out).toContain("<td>x</td>");
    });

    test("header + body の単純な rows は GFM パイプ形式で再生成できる", () => {
      const block: TableBlock = {
        id: "t",
        kind: "table",
        source: "",
        rows: [
          {
            id: "r0",
            cells: [{ id: "c0", text: "h", rowspan: 1, colspan: 1, isHeader: true }],
          },
          {
            id: "r1",
            cells: [{ id: "c1", text: "a", rowspan: 1, colspan: 1 }],
          },
        ],
      };
      expect(documentToMarkdown({ blocks: [block] })).toBe(
        "| h |\n| --- |\n| a |\n",
      );
    });

    test("rowspan を含む rows は HTML フォールバックで再生成できる", () => {
      const block: TableBlock = {
        id: "t",
        kind: "table",
        source: "",
        rows: [
          {
            id: "r0",
            cells: [{ id: "c0", text: "h", rowspan: 1, colspan: 1, isHeader: true }],
          },
          {
            id: "r1",
            cells: [{ id: "c1", text: "a", rowspan: 2, colspan: 1 }],
          },
        ],
      };
      expect(documentToMarkdown({ blocks: [block] })).toContain("<table>");
    });

    test("セルに改行を含む rows も HTML フォールバックで再生成できる", () => {
      const block: TableBlock = {
        id: "t",
        kind: "table",
        source: "",
        rows: [
          {
            id: "r0",
            cells: [{ id: "c0", text: "h", rowspan: 1, colspan: 1, isHeader: true }],
          },
          {
            id: "r1",
            cells: [{ id: "c1", text: "a\nb", rowspan: 1, colspan: 1 }],
          },
        ],
      };
      expect(documentToMarkdown({ blocks: [block] })).toContain("<br />");
    });
  });
});

// 往復で構造が保たれることを確認する。markdown ↔ Document の対称性が
// このプロジェクトの最重要保証なので主要パターンを網羅する。
describe("round-trip (markdown ↔ Document)", () => {
  test.each<{ name: string; md: string; }>([
    { name: "見出しのみ", md: "# Title\n" },
    { name: "段落のみ", md: "hello world\n" },
    { name: "見出し + 段落", md: "# h\n\nbody\n" },
    { name: "bullet 2 項目", md: "- a\n- b\n" },
    { name: "ordered 2 項目", md: "1. a\n2. b\n" },
    { name: "task 混在", md: "- [ ] todo\n- [x] done\n" },
    { name: "blockquote", md: "> quoted\n" },
    { name: "水平線", md: "---\n" },
    { name: "GFM パイプテーブル (1 列)", md: "| h |\n| --- |\n| a |\n" },
    {
      name: "GFM パイプテーブル (2 列 2 行)",
      md: "| h1 | h2 |\n| --- | --- |\n| a | b |\n",
    },
  ])("$name を round-trip できる", ({ md }) => {
    expect(documentToMarkdown(markdownToDocument(md))).toBe(md);
  });
});
