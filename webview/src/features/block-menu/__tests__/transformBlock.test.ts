import type { Block, CodeBlock } from "@local-md-editor/shared";
import { describe, expect, test } from "vitest";
import { transformBlock } from "../transformBlock.js";

const para = (source: string): Block => ({ id: "src", kind: "paragraph", source, inlines: [] });
const code = (value: string): Block => ({
  id: "src",
  kind: "code",
  lang: "py",
  value,
  source: value,
});

// when: transformBlock(b, kind) を呼ぶ
describe("transformBlock", () => {
  describe("ID 保持", () => {
    test("元のブロックの id を変換後も保持できる", () => {
      const r = transformBlock(para("text"), "h1");
      expect(r.id).toBe("src");
    });
  });

  describe("kind 変換 (本文を維持)", () => {
    test.each<
      {
        kind: Parameters<typeof transformBlock>[1];
        expectedKind: Block["kind"];
        expectedSource: string;
      }
    >([
      { kind: "paragraph", expectedKind: "paragraph", expectedSource: "hello" },
      { kind: "h1", expectedKind: "heading", expectedSource: "# hello" },
      { kind: "h2", expectedKind: "heading", expectedSource: "## hello" },
      { kind: "h3", expectedKind: "heading", expectedSource: "### hello" },
      { kind: "bullet", expectedKind: "bulletItem", expectedSource: "- hello" },
      { kind: "ordered", expectedKind: "orderedItem", expectedSource: "1. hello" },
      { kind: "todo", expectedKind: "taskItem", expectedSource: "- [ ] hello" },
      { kind: "quote", expectedKind: "blockquote", expectedSource: "> hello" },
    ])(
      "paragraph 'hello' を $kind ($expectedKind) に変換できる",
      ({ kind, expectedKind, expectedSource }) => {
        const r = transformBlock(para("hello"), kind);
        expect(r.kind).toBe(expectedKind);
        expect(r.source).toBe(expectedSource);
      },
    );
  });

  describe("特殊な変換", () => {
    test("paragraph を code に変換すると lang は空、value は本文になる", () => {
      const r = transformBlock(para("hello"), "code") as CodeBlock;
      expect(r.kind).toBe("code");
      expect(r.lang).toBe("");
      expect(r.value).toBe("hello");
    });

    test("paragraph を divider (thematicBreak) に変換できる", () => {
      const r = transformBlock(para("ignored"), "divider");
      expect(r.kind).toBe("thematicBreak");
      expect(r.source).toBe("---");
    });

    test("複数行 paragraph を quote に変換すると各行に > が付与される", () => {
      const r = transformBlock(para("a\nb"), "quote");
      expect(r.source).toBe("> a\n> b");
    });
  });

  describe("code ブロックからの変換は value を本文として扱う", () => {
    test("code を paragraph に変換すると value が source になる", () => {
      const r = transformBlock(code("const x = 1"), "paragraph");
      expect(r.kind).toBe("paragraph");
      expect(r.source).toBe("const x = 1");
    });

    test("code を h1 に変換すると # value 形式になる", () => {
      const r = transformBlock(code("title text"), "h1");
      expect(r.source).toBe("# title text");
    });
  });

  describe("todo の初期 checked 状態", () => {
    test("paragraph から todo に変換した直後は未完了状態になる", () => {
      const r = transformBlock(para("task"), "todo");
      expect(r.kind).toBe("taskItem");
      expect(r.source).toBe("- [ ] task");
    });
  });
});
