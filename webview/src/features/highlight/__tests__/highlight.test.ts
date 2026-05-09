import { describe, expect, test } from "vitest";
import { tokenize } from "../highlight.js";

// when: tokenize(code, lang) を呼ぶ
describe("tokenize", () => {
  describe("構文認識", () => {
    test("JS の const と数値リテラルを認識できる", () => {
      expect(tokenize("const x = 1", "js")).toEqual([
        { type: "keyword", value: "const" },
        { type: "plain", value: " x = " },
        { type: "number", value: "1" },
      ]);
    });

    test("JSON のキー・値を string、構造を punctuation として認識できる", () => {
      expect(tokenize('{"k":"v"}', "json")).toEqual([
        { type: "punctuation", value: "{" },
        { type: "string", value: '"k"' },
        { type: "punctuation", value: ":" },
        { type: "string", value: '"v"' },
        { type: "punctuation", value: "}" },
      ]);
    });
  });

  describe("言語エイリアス", () => {
    test("ts と typescript で同じ結果を返せる", () => {
      expect(tokenize("const x = 1", "typescript")).toEqual(
        tokenize("const x = 1", "ts"),
      );
    });
  });

  describe("フォールバック", () => {
    test("未対応言語を単一の plain トークンとして返せる", () => {
      expect(tokenize("hello", "klingon")).toEqual([
        { type: "plain", value: "hello" },
      ]);
    });
  });
});
