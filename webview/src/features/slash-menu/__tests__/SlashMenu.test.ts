import type { Block } from "@local-md-editor/shared";
import { describe, expect, test } from "vitest";
import { filterItems, SLASH_ITEMS } from "../SlashMenu.js";

const para = (id: string): Block => ({ id, kind: "paragraph", source: "", inlines: [] });

const itemById = (id: string) => {
  const item = SLASH_ITEMS.find((x) => x.id === id);
  if (!item) throw new Error(`item not found: ${id}`);
  return item;
};

// when: filterItems(query) を呼ぶ
describe("filterItems", () => {
  test("空文字列は全アイテムを返せる", () => {
    expect(filterItems("")).toEqual(SLASH_ITEMS);
  });

  test("id に部分一致するアイテムを抽出できる", () => {
    const result = filterItems("h1");
    expect(result.map((i) => i.id)).toContain("h1");
    expect(result.find((i) => i.id === "table")).toBeUndefined();
  });

  test("label (日本語) に部分一致するアイテムを抽出できる", () => {
    const result = filterItems("見出し");
    expect(result.map((i) => i.id).sort()).toEqual(["h1", "h2", "h3"]);
  });

  test("どこにも一致しなければ空配列を返せる", () => {
    expect(filterItems("xyznomatch")).toEqual([]);
  });

  test("id 検索は大文字を小文字化して照合できる", () => {
    expect(filterItems("H1").map((i) => i.id)).toContain("h1");
  });
});

// when: SLASH_ITEMS の各 apply を呼んでブロックを変換する
describe("SLASH_ITEMS の apply", () => {
  test("text は空 paragraph に変換できる", () => {
    const r = itemById("text").apply(para("p"));
    expect(r).toEqual({ id: "p", kind: "paragraph", source: "", inlines: [] });
  });

  test("h1 / h2 / h3 はそれぞれの level の heading に変換できる", () => {
    expect(itemById("h1").apply(para("p"))).toMatchObject({
      kind: "heading",
      level: 1,
      source: "# ",
    });
    expect(itemById("h2").apply(para("p"))).toMatchObject({
      kind: "heading",
      level: 2,
      source: "## ",
    });
    expect(itemById("h3").apply(para("p"))).toMatchObject({
      kind: "heading",
      level: 3,
      source: "### ",
    });
  });

  test("list は bulletItem に変換できる", () => {
    expect(itemById("list").apply(para("p"))).toMatchObject({
      kind: "bulletItem",
      source: "- ",
    });
  });

  test("numbered は orderedItem に変換できる", () => {
    expect(itemById("numbered").apply(para("p"))).toMatchObject({
      kind: "orderedItem",
      source: "1. ",
    });
  });

  test("todo は未完了 taskItem に変換できる", () => {
    expect(itemById("todo").apply(para("p"))).toMatchObject({
      kind: "taskItem",
      checked: false,
      source: "- [ ] ",
    });
  });

  test("divider は thematicBreak に変換し、次に新ブロックを挿入する", () => {
    const item = itemById("divider");
    expect(item.apply(para("p"))).toMatchObject({ kind: "thematicBreak", source: "---" });
    expect(item.thenInsertAfter).toBe(true);
  });

  test("table は 3x3 のテーブルブロックに変換できる", () => {
    const r = itemById("table").apply(para("p"));
    expect(r.kind).toBe("table");
    if (r.kind !== "table") return;
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0].cells.every((c) => c.isHeader === true)).toBe(true);
    expect(r.source).toContain("<table>");
  });

  test("各 apply は元ブロックの id を保持できる", () => {
    for (const item of SLASH_ITEMS) {
      const r = item.apply(para("orig"));
      expect(r.id).toBe("orig");
    }
  });
});
