import { describe, expect, test } from "vitest";
import { parseInlines } from "../inlineParser.js";

// when: parseInlines(given) を呼ぶ
describe("parseInlines", () => {
  describe("インライン要素の認識", () => {
    test("プレーンテキストを単一の text トークンとして返せる", () => {
      expect(parseInlines("hello world")).toEqual([
        { type: "text", value: "hello world" },
      ]);
    });

    test("インラインコードを code トークンとして認識できる", () => {
      expect(parseInlines("a `code` b")).toEqual([
        { type: "text", value: "a " },
        { type: "code", value: "code" },
        { type: "text", value: " b" },
      ]);
    });

    test("太字と斜体を strong / em トークンとして認識できる", () => {
      expect(parseInlines("**bold** and *em*")).toEqual([
        { type: "strong", children: [{ type: "text", value: "bold" }] },
        { type: "text", value: " and " },
        { type: "em", children: [{ type: "text", value: "em" }] },
      ]);
    });

    test("リンクを link トークンとして認識できる", () => {
      expect(parseInlines("[label](https://example.com)")).toEqual([
        {
          type: "link",
          url: "https://example.com",
          children: [{ type: "text", value: "label" }],
        },
      ]);
    });
  });

  describe("ハード改行", () => {
    test("末尾 2 スペース + 改行を break トークンとして認識できる", () => {
      expect(parseInlines("a  \nb")).toEqual([
        { type: "text", value: "a" },
        { type: "break" },
        { type: "text", value: "b" },
      ]);
    });

    test("画像を image トークンとして認識できる", () => {
      expect(parseInlines("![alt](u.png)")).toEqual([
        { type: "image", url: "u.png", alt: "alt" },
      ]);
    });
  });

  describe("フォールバック", () => {
    test("閉じていないマーカーを素のテキストとして扱える", () => {
      expect(parseInlines("a `unclosed code")).toEqual([
        { type: "text", value: "a `unclosed code" },
      ]);
    });

    test("閉じていない太字マーカーは plain text として扱える", () => {
      // `if (close > i + 1)` の else 分岐 — `**` の閉じが無い
      expect(parseInlines("**unclosed bold")).toEqual([
        { type: "text", value: "**unclosed bold" },
      ]);
    });

    test("閉じていない斜体マーカーは plain text として扱える", () => {
      // `if (close > i)` (em) の else 分岐 — `*` の閉じが無い
      expect(parseInlines("*unclosed em")).toEqual([
        { type: "text", value: "*unclosed em" },
      ]);
    });

    test("括弧の無い画像 markdown (![alt]) は plain text として扱える", () => {
      // 画像の `if (m)` else 分岐 — `(url)` 部分が無い
      expect(parseInlines("![alt]")).toEqual([
        { type: "text", value: "![alt]" },
      ]);
    });

    test("括弧の無いリンク markdown ([label]) は plain text として扱える", () => {
      // リンクの `if (m)` else 分岐 — `(url)` 部分が無い
      expect(parseInlines("[label]")).toEqual([
        { type: "text", value: "[label]" },
      ]);
    });
  });
});
