import type { Block, EditorConfig } from "@local-md-editor/shared";
import { describe, expect, test } from "vitest";
import { isHiddenBlock } from "../blockVisibility.js";

const htmlBlock = (source: string): Block => ({
  id: "x",
  kind: "html",
  source,
});

const paragraph = (): Block => ({
  id: "p",
  kind: "paragraph",
  source: "hi",
  inlines: [],
});

const withHide = (hide: boolean): EditorConfig => ({
  compatibility: { hideHtmlComments: hide },
});

// when: block と config を渡して描画抑止対象かを判定する
describe("isHiddenBlock", () => {
  describe("hideHtmlComments=true (デフォルト)", () => {
    test("HTML コメントブロックを hidden 判定できる", () => {
      expect(isHiddenBlock(htmlBlock("<!-- foo -->"), withHide(true))).toBe(true);
    });

    test("先頭に空白がある HTML コメントも hidden 判定できる", () => {
      expect(isHiddenBlock(htmlBlock("  <!-- foo -->\n"), withHide(true))).toBe(true);
    });

    test("markdownlint 抑止ディレクティブを hidden 判定できる", () => {
      expect(
        isHiddenBlock(htmlBlock("<!-- markdownlint-disable MD013 -->"), withHide(true)),
      ).toBe(true);
    });

    test("素の HTML タグ (<div>) は描画対象として残せる", () => {
      expect(isHiddenBlock(htmlBlock("<div>x</div>"), withHide(true))).toBe(false);
    });

    test("paragraph 等の他 block は描画対象として残せる", () => {
      expect(isHiddenBlock(paragraph(), withHide(true))).toBe(false);
    });
  });

  describe("hideHtmlComments=false", () => {
    test("HTML コメントでも描画対象として残せる", () => {
      expect(isHiddenBlock(htmlBlock("<!-- foo -->"), withHide(false))).toBe(false);
    });
  });
});
