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

  describe("フォールバック", () => {
    test("閉じていないマーカーを素のテキストとして扱える", () => {
      expect(parseInlines("a `unclosed code")).toEqual([
        { type: "text", value: "a `unclosed code" },
      ]);
    });
  });
});
