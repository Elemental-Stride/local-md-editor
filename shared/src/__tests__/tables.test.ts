import { describe, expect, test } from "vitest";
import type { TableBlock } from "../blocks.js";
import { cellTextToHtml, escapeHtml, tableBlockToHtml, tableBlockToMarkdown } from "../tables.js";

// when: escapeHtml(given) を呼ぶ
describe("escapeHtml", () => {
  describe("HTML 特殊文字のエスケープ", () => {
    // dprint-ignore
    test.each`
      name                                          | given                  | then
      ${"特殊文字を含まない文字列はそのまま返せる"}    | ${"hello world"}       | ${"hello world"}
      ${"& を &amp; にエスケープできる"}             | ${"a & b"}             | ${"a &amp; b"}
      ${"< を &lt; にエスケープできる"}              | ${"<tag>"}             | ${"&lt;tag&gt;"}
      ${"\" を &quot; にエスケープできる"}           | ${"\"quoted\""}        | ${"&quot;quoted&quot;"}
      ${"複数の特殊文字を全てエスケープできる"}        | ${"<a href=\"x\">"}    | ${"&lt;a href=&quot;x&quot;&gt;"}
      ${"& を最初に処理することで二重エスケープを防げる"} | ${"&lt;"}              | ${"&amp;lt;"}
      ${"空文字列を空文字列として返せる"}             | ${""}                  | ${""}
    `(
      "$name",
      ({ given, then }: { given: string; then: string; }) => {
        expect(escapeHtml(given)).toBe(then);
      },
    );
  });
});

// when: cellTextToHtml(given) を呼ぶ
describe("cellTextToHtml", () => {
  describe("基本", () => {
    // dprint-ignore
    test.each`
      name                                 | given           | then
      ${"空文字列を空文字列として返せる"}     | ${""}           | ${""}
      ${"プレーンテキストをそのまま返せる"}   | ${"hello"}      | ${"hello"}
      ${"特殊文字をエスケープして返せる"}     | ${"<b>x</b>"}   | ${"&lt;b&gt;x&lt;/b&gt;"}
    `(
      "$name",
      ({ given, then }: { given: string; then: string; }) => {
        expect(cellTextToHtml(given)).toBe(then);
      },
    );
  });

  describe("インラインマークダウン要素の変換", () => {
    // dprint-ignore
    test.each`
      name                                       | given                    | then
      ${"太字を <strong> に変換できる"}            | ${"**bold**"}            | ${"<strong>bold</strong>"}
      ${"斜体を <em> に変換できる"}                | ${"*em*"}                | ${"<em>em</em>"}
      ${"インラインコードを <code> に変換できる"}  | ${"`code`"}              | ${"<code>code</code>"}
      ${"リンクを <a href> に変換できる"}          | ${"[label](https://e.x)"}| ${"<a href=\"https://e.x\">label</a>"}
      ${"画像を <img> に変換できる"}              | ${"![alt](u.png)"}       | ${"<img src=\"u.png\" alt=\"alt\" />"}
    `(
      "$name",
      ({ given, then }: { given: string; then: string; }) => {
        expect(cellTextToHtml(given)).toBe(then);
      },
    );
  });

  describe("複数行", () => {
    test("改行を <br /> に変換できる", () => {
      expect(cellTextToHtml("line1\nline2")).toBe("line1<br />line2");
    });

    test("改行を含むセル内のインライン要素も変換できる", () => {
      expect(cellTextToHtml("**a**\n*b*")).toBe(
        "<strong>a</strong><br /><em>b</em>",
      );
    });
  });
});

// when: tableBlockToHtml(given) を呼ぶ
describe("tableBlockToHtml", () => {
  const makeBlock = (
    rows: { cells: { text: string; isHeader?: boolean; rowspan?: number; colspan?: number; }[]; }[],
  ): TableBlock => ({
    id: "t1",
    kind: "table",
    source: "",
    rows: rows.map((row, i) => ({
      id: `r${i}`,
      cells: row.cells.map((c, j) => ({
        id: `c${i}-${j}`,
        text: c.text,
        rowspan: c.rowspan ?? 1,
        colspan: c.colspan ?? 1,
        ...(c.isHeader !== undefined ? { isHeader: c.isHeader } : {}),
      })),
    })),
  });

  describe("基本構造", () => {
    test("1 行 1 セルを <table><tr><td> 構造に変換できる", () => {
      const block = makeBlock([{ cells: [{ text: "x" }] }]);
      expect(tableBlockToHtml(block)).toBe(
        ["<table>", "  <tr>", "    <td>x</td>", "  </tr>", "</table>"].join("\n"),
      );
    });

    test("複数行 / 複数列を全て展開できる", () => {
      const block = makeBlock([
        { cells: [{ text: "a" }, { text: "b" }] },
        { cells: [{ text: "c" }, { text: "d" }] },
      ]);
      expect(tableBlockToHtml(block)).toBe([
        "<table>",
        "  <tr>",
        "    <td>a</td>",
        "    <td>b</td>",
        "  </tr>",
        "  <tr>",
        "    <td>c</td>",
        "    <td>d</td>",
        "  </tr>",
        "</table>",
      ].join("\n"));
    });

    test("空セルを空の <td></td> として出力できる", () => {
      const block = makeBlock([{ cells: [{ text: "" }] }]);
      expect(tableBlockToHtml(block)).toContain("<td></td>");
    });
  });

  describe("セル属性", () => {
    test("isHeader=true のセルを <th> として出力できる", () => {
      const block = makeBlock([{ cells: [{ text: "h", isHeader: true }] }]);
      expect(tableBlockToHtml(block)).toContain("<th>h</th>");
    });

    test("rowspan>1 を rowspan 属性として付与できる", () => {
      const block = makeBlock([{ cells: [{ text: "x", rowspan: 2 }] }]);
      expect(tableBlockToHtml(block)).toContain('<td rowspan="2">x</td>');
    });

    test("colspan>1 を colspan 属性として付与できる", () => {
      const block = makeBlock([{ cells: [{ text: "x", colspan: 3 }] }]);
      expect(tableBlockToHtml(block)).toContain('<td colspan="3">x</td>');
    });

    test("rowspan と colspan を両方持つセルに両属性を付与できる", () => {
      const block = makeBlock([{ cells: [{ text: "x", rowspan: 2, colspan: 3 }] }]);
      expect(tableBlockToHtml(block)).toContain('<td rowspan="2" colspan="3">x</td>');
    });

    test("rowspan / colspan が 1 のときは属性を付けない", () => {
      const block = makeBlock([{ cells: [{ text: "x", rowspan: 1, colspan: 1 }] }]);
      expect(tableBlockToHtml(block)).toContain("<td>x</td>");
    });
  });

  describe("セル内インライン", () => {
    test("セル内の太字を HTML として展開できる", () => {
      const block = makeBlock([{ cells: [{ text: "**b**" }] }]);
      expect(tableBlockToHtml(block)).toContain("<td><strong>b</strong></td>");
    });

    test("セル内の改行を <br /> として展開できる", () => {
      const block = makeBlock([{ cells: [{ text: "a\nb" }] }]);
      expect(tableBlockToHtml(block)).toContain("<td>a<br />b</td>");
    });
  });
});

// when: tableBlockToMarkdown(given) を呼ぶ
//
// GFM パイプテーブルで表現できる単純構造のみパイプ文字列を返し、
// 表現できない構造 (rowspan/colspan、改行セル、ヘッダ行不整合、空、列数不一致)
// では null を返して呼び出し側に HTML フォールバックを促す契約を凍結する。
describe("tableBlockToMarkdown", () => {
  const makeBlock = (
    rows: { cells: { text: string; isHeader?: boolean; rowspan?: number; colspan?: number; }[]; }[],
  ): TableBlock => ({
    id: "t1",
    kind: "table",
    source: "",
    rows: rows.map((row, i) => ({
      id: `r${i}`,
      cells: row.cells.map((c, j) => ({
        id: `c${i}-${j}`,
        text: c.text,
        rowspan: c.rowspan ?? 1,
        colspan: c.colspan ?? 1,
        ...(c.isHeader !== undefined ? { isHeader: c.isHeader } : {}),
      })),
    })),
  });

  describe("パイプ表現が可能な構造", () => {
    test("ヘッダ + 本文 1 行をパイプ形式で出力できる", () => {
      const block = makeBlock([
        { cells: [{ text: "h1", isHeader: true }, { text: "h2", isHeader: true }] },
        { cells: [{ text: "a" }, { text: "b" }] },
      ]);
      expect(tableBlockToMarkdown(block)).toBe(
        ["| h1 | h2 |", "| --- | --- |", "| a | b |"].join("\n"),
      );
    });

    test("ヘッダのみ (本文なし) のテーブルもパイプ形式で出力できる", () => {
      const block = makeBlock([
        { cells: [{ text: "h", isHeader: true }] },
      ]);
      expect(tableBlockToMarkdown(block)).toBe(
        ["| h |", "| --- |"].join("\n"),
      );
    });

    test("複数本文行を全てパイプ形式で出力できる", () => {
      const block = makeBlock([
        { cells: [{ text: "h", isHeader: true }] },
        { cells: [{ text: "a" }] },
        { cells: [{ text: "b" }] },
        { cells: [{ text: "c" }] },
      ]);
      expect(tableBlockToMarkdown(block)).toBe(
        ["| h |", "| --- |", "| a |", "| b |", "| c |"].join("\n"),
      );
    });

    test("セル内の | は \\| にエスケープして出力できる", () => {
      const block = makeBlock([
        { cells: [{ text: "h", isHeader: true }] },
        { cells: [{ text: "a | b" }] },
      ]);
      expect(tableBlockToMarkdown(block)).toContain("| a \\| b |");
    });

    test("空セルもパイプ形式で出力できる", () => {
      const block = makeBlock([
        { cells: [{ text: "h", isHeader: true }, { text: "", isHeader: true }] },
        { cells: [{ text: "" }, { text: "x" }] },
      ]);
      expect(tableBlockToMarkdown(block)).toBe(
        ["| h |  |", "| --- | --- |", "|  | x |"].join("\n"),
      );
    });
  });

  describe("パイプ表現が不可能な構造 (null を返す)", () => {
    test("空テーブルでは null を返せる", () => {
      const block = makeBlock([]);
      expect(tableBlockToMarkdown(block)).toBeNull();
    });

    test("0 列の行があれば null を返せる", () => {
      const block = makeBlock([{ cells: [] }]);
      expect(tableBlockToMarkdown(block)).toBeNull();
    });

    test("rowspan > 1 を含めば null を返せる", () => {
      const block = makeBlock([
        { cells: [{ text: "h", isHeader: true }] },
        { cells: [{ text: "x", rowspan: 2 }] },
      ]);
      expect(tableBlockToMarkdown(block)).toBeNull();
    });

    test("colspan > 1 を含めば null を返せる", () => {
      const block = makeBlock([
        { cells: [{ text: "h", isHeader: true }] },
        { cells: [{ text: "x", colspan: 2 }] },
      ]);
      expect(tableBlockToMarkdown(block)).toBeNull();
    });

    test("セルに改行を含めば null を返せる", () => {
      const block = makeBlock([
        { cells: [{ text: "h", isHeader: true }] },
        { cells: [{ text: "a\nb" }] },
      ]);
      expect(tableBlockToMarkdown(block)).toBeNull();
    });

    test("行ごとに列数が違えば null を返せる", () => {
      const block = makeBlock([
        { cells: [{ text: "h1", isHeader: true }, { text: "h2", isHeader: true }] },
        { cells: [{ text: "a" }] },
      ]);
      expect(tableBlockToMarkdown(block)).toBeNull();
    });

    test("先頭行が全 header でなければ null を返せる", () => {
      const block = makeBlock([
        { cells: [{ text: "a" }, { text: "b" }] },
        { cells: [{ text: "c" }, { text: "d" }] },
      ]);
      expect(tableBlockToMarkdown(block)).toBeNull();
    });

    test("中間行に header セルが混ざれば null を返せる", () => {
      const block = makeBlock([
        { cells: [{ text: "h1", isHeader: true }, { text: "h2", isHeader: true }] },
        { cells: [{ text: "a", isHeader: true }, { text: "b" }] },
      ]);
      expect(tableBlockToMarkdown(block)).toBeNull();
    });
  });
});
