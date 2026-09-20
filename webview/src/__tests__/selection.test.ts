import { describe, expect, test } from "vitest";
import { isInEditableTarget } from "../selection.js";

// when: isInEditableTarget(target) を呼ぶ
describe("isInEditableTarget", () => {
  describe("編集要素とみなすケース", () => {
    test("textarea を編集要素として判定できる", () => {
      expect(isInEditableTarget(document.createElement("textarea"))).toBe(true);
    });

    test("input を編集要素として判定できる", () => {
      expect(isInEditableTarget(document.createElement("input"))).toBe(true);
    });

    test("contenteditable な要素を編集要素として判定できる", () => {
      const el = document.createElement("div");
      el.setAttribute("contenteditable", "true");
      expect(isInEditableTarget(el)).toBe(true);
    });
  });

  describe("編集要素とみなさないケース", () => {
    test("通常の要素では false を返せる", () => {
      expect(isInEditableTarget(document.createElement("p"))).toBe(false);
    });

    test("HTMLElement 以外 (document など) では false を返せる", () => {
      expect(isInEditableTarget(document)).toBe(false);
    });
  });
});
