import type { Block, OrderedItemBlock, TaskItemBlock } from "@local-md-editor/shared";
import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useBlockBuilders } from "../useBlockBuilders.js";

const para = (source: string): Block => ({ id: "p", kind: "paragraph", source, inlines: [] });
const heading = (level: 1 | 2 | 3, source: string): Block => ({
  id: "h",
  kind: "heading",
  level,
  source,
  inlines: [],
});
const bullet = (source: string): Block => ({ id: "b", kind: "bulletItem", source, inlines: [] });
const ordered = (source: string): OrderedItemBlock => ({
  id: "o",
  kind: "orderedItem",
  source,
  inlines: [],
});
const task = (source: string, checked = false): TaskItemBlock => ({
  id: "t",
  kind: "taskItem",
  checked,
  source,
  inlines: [],
});

const useBuilders = () => renderHook(() => useBlockBuilders()).result.current;

// when: useBlockBuilders() のファクトリを呼ぶ
describe("useBlockBuilders", () => {
  describe("emptyParagraph", () => {
    test("空の paragraph ブロックを id 付きで生成できる", () => {
      const b = useBuilders().emptyParagraph();
      expect(b.kind).toBe("paragraph");
      expect(b.source).toBe("");
      expect(b.inlines).toEqual([]);
      expect(b.id.length).toBeGreaterThan(0);
    });

    test("連続呼び出しで衝突しない id を生成できる", () => {
      const builders = useBuilders();
      const a = builders.emptyParagraph();
      const b = builders.emptyParagraph();
      expect(a.id).not.toBe(b.id);
    });
  });

  describe("indentOf", () => {
    test("source 先頭のスペースを抽出できる", () => {
      expect(useBuilders().indentOf(bullet("  - item"))).toBe("  ");
    });

    test("インデントが無ければ空文字を返せる", () => {
      expect(useBuilders().indentOf(bullet("- item"))).toBe("");
    });

    test("source を持たない table ブロックは空文字を返せる", () => {
      const b: Block = { id: "tb", kind: "table", source: "", rows: [] };
      // table も "source" プロパティを持つので "" として扱われる
      expect(useBuilders().indentOf(b)).toBe("");
    });
  });

  describe("sourceWithContent", () => {
    test("heading のレベル別マーカーで本文を包める", () => {
      expect(useBuilders().sourceWithContent(heading(1, "# old"), "new")).toBe("# new");
      expect(useBuilders().sourceWithContent(heading(3, "### old"), "new")).toBe("### new");
    });

    test("bulletItem のインデントを保ったまま本文を差し替えられる", () => {
      expect(useBuilders().sourceWithContent(bullet("  - old"), "new")).toBe("  - new");
    });

    test("orderedItem のマーカー (1. / 5)) を保持できる", () => {
      expect(useBuilders().sourceWithContent(ordered("1. old"), "new")).toBe("1. new");
      expect(useBuilders().sourceWithContent(ordered("5) old"), "new")).toBe("5) new");
    });

    test("taskItem の checked 状態を反映した [x] / [ ] で組み立てられる", () => {
      expect(useBuilders().sourceWithContent(task("- [x] old", true), "new")).toBe("- [x] new");
      expect(useBuilders().sourceWithContent(task("- [ ] old", false), "new")).toBe("- [ ] new");
    });

    test("paragraph 等のマーカーを持たないブロックは content をそのまま返せる", () => {
      expect(useBuilders().sourceWithContent(para("old"), "new")).toBe("new");
    });

    test("マーカー無し orderedItem は indent / marker をデフォルトで補えできる", () => {
      // sourceWithContent の orderedItem ケース: 正規表現がマッチしない source の場合、
      // indent は indentOf へ、marker は "1." にフォールバック (lines 26-27)
      const malformed = ordered("plain content");
      expect(useBuilders().sourceWithContent(malformed, "new")).toBe("1. new");
    });

    test("インデント付きでマーカーが無い orderedItem は indentOf のスペースを保てる", () => {
      // m === null だが indentOf はスペースを返す (line 26 fallback の indent ケース)
      const malformed = ordered("    plain");
      expect(useBuilders().sourceWithContent(malformed, "new")).toBe("    1. new");
    });
  });

  describe("nextOrderedMarker", () => {
    test("1. の次のマーカーとして 2. を返せる", () => {
      expect(useBuilders().nextOrderedMarker(ordered("1. one")))
        .toEqual({ indent: "", marker: "2." });
    });

    test("5) 形式の次のマーカーとして 6) を返せる", () => {
      expect(useBuilders().nextOrderedMarker(ordered("5) five")))
        .toEqual({ indent: "", marker: "6)" });
    });

    test("インデント付き 2. の次のマーカーは indent を保ったまま 3. を返せる", () => {
      expect(useBuilders().nextOrderedMarker(ordered("  2. nested")))
        .toEqual({ indent: "  ", marker: "3." });
    });

    test("マーカーが無い source からはデフォルト 1. を返せる", () => {
      expect(useBuilders().nextOrderedMarker(para("plain")))
        .toEqual({ indent: "", marker: "1." });
    });
  });

  describe("createSiblingWithContent", () => {
    test("bulletItem の兄弟として bulletItem を生成できる", () => {
      const b = useBuilders().createSiblingWithContent(bullet("  - prev"), "next");
      expect(b.kind).toBe("bulletItem");
      expect(b.source).toBe("  - next");
    });

    test("orderedItem の兄弟は番号がインクリメントされる", () => {
      const b = useBuilders().createSiblingWithContent(
        ordered("3. prev"),
        "next",
      ) as OrderedItemBlock;
      expect(b.kind).toBe("orderedItem");
      expect(b.source).toBe("4. next");
    });

    test("taskItem の兄弟は未完了状態で生成できる", () => {
      const b = useBuilders().createSiblingWithContent(
        task("- [x] prev", true),
        "next",
      ) as TaskItemBlock;
      expect(b.kind).toBe("taskItem");
      expect(b.checked).toBe(false);
      expect(b.source).toBe("- [ ] next");
    });

    test("リスト系以外の兄弟は paragraph として生成できる", () => {
      const b = useBuilders().createSiblingWithContent(heading(1, "# h"), "body");
      expect(b.kind).toBe("paragraph");
      expect(b.source).toBe("body");
    });
  });

  describe("makeBlockId", () => {
    test("hook 経由で blockId を生成できる", () => {
      expect(useBuilders().makeBlockId().startsWith("wb")).toBe(true);
    });
  });
});
