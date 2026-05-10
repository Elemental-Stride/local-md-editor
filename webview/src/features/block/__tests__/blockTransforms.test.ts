import type { Block, HeadingBlock, TaskItemBlock } from "@local-md-editor/shared";
import { describe, expect, test } from "vitest";
import {
  contentOf,
  indentStyle,
  orderedMarker,
  reclassify,
  toggleTaskSource,
  withDisplayValue,
} from "../blockTransforms.js";

const para = (source: string): Block => ({ id: "p", kind: "paragraph", source, inlines: [] });
const heading = (level: HeadingBlock["level"], source: string): Block => ({
  id: "h",
  kind: "heading",
  level,
  source,
  inlines: [],
});
const bullet = (source: string): Block => ({ id: "b", kind: "bulletItem", source, inlines: [] });
const ordered = (source: string): Block => ({ id: "o", kind: "orderedItem", source, inlines: [] });
const task = (checked: boolean, source: string): TaskItemBlock => ({
  id: "t",
  kind: "taskItem",
  checked,
  source,
  inlines: [],
});
const quote = (source: string): Block => ({ id: "q", kind: "blockquote", source });
const code = (value: string): Block => ({ id: "c", kind: "code", lang: "", value, source: value });
const table = (): Block => ({ id: "tb", kind: "table", source: "", rows: [] });

// when: contentOf(block) を呼ぶ
describe("contentOf", () => {
  describe("マーカー除去", () => {
    test("heading の # マーカーを除去できる", () => {
      expect(contentOf(heading(1, "# title"))).toBe("title");
    });

    test("heading のマーカーがない場合は source をそのまま返せる", () => {
      expect(contentOf(heading(1, "no marker"))).toBe("no marker");
    });

    test("bulletItem の - マーカーを除去できる", () => {
      expect(contentOf(bullet("- item"))).toBe("item");
    });

    test("bulletItem のインデント付きマーカーも除去できる", () => {
      expect(contentOf(bullet("  - nested"))).toBe("nested");
    });

    test("orderedItem の 1. / 1) マーカーを除去できる", () => {
      expect(contentOf(ordered("1. one"))).toBe("one");
      expect(contentOf(ordered("3) three"))).toBe("three");
    });

    test("taskItem の - [x] マーカーを除去できる", () => {
      expect(contentOf(task(true, "- [x] done"))).toBe("done");
      expect(contentOf(task(false, "- [ ] todo"))).toBe("todo");
    });
  });

  describe("blockquote", () => {
    test("各行の > 接頭辞を除去できる", () => {
      expect(contentOf(quote("> hello"))).toBe("hello");
    });

    test("複数行の引用も全行の > を除去できる", () => {
      expect(contentOf(quote("> a\n> b"))).toBe("a\nb");
    });
  });

  describe("空文字を返すケース", () => {
    test("code ブロックは空文字を返せる", () => {
      expect(contentOf(code("x"))).toBe("");
    });

    test("table ブロックは空文字を返せる", () => {
      expect(contentOf(table())).toBe("");
    });
  });

  describe("マーカーを持たないブロック", () => {
    test("paragraph は source をそのまま返せる", () => {
      expect(contentOf(para("hello"))).toBe("hello");
    });
  });
});

// when: withDisplayValue(block, display) を呼ぶ
describe("withDisplayValue", () => {
  describe("マーカーの再構築", () => {
    test("heading のレベルに応じた # マーカーで包めない", () => {
      expect(withDisplayValue(heading(1, "old"), "new")).toBe("# new");
      expect(withDisplayValue(heading(3, "old"), "new")).toBe("### new");
    });

    test("bulletItem のマーカーとインデントを保持できる", () => {
      expect(withDisplayValue(bullet("- old"), "new")).toBe("- new");
      expect(withDisplayValue(bullet("  * old"), "new")).toBe("  * new");
    });

    test("orderedItem のマーカー (1. / 5)) を保持できる", () => {
      expect(withDisplayValue(ordered("1. old"), "new")).toBe("1. new");
      expect(withDisplayValue(ordered("5) old"), "new")).toBe("5) new");
    });

    test("taskItem の checked 状態を [x] / [ ] として反映できる", () => {
      expect(withDisplayValue(task(true, "- [x] old"), "new")).toBe("- [x] new");
      expect(withDisplayValue(task(false, "- [ ] old"), "new")).toBe("- [ ] new");
    });
  });

  describe("blockquote", () => {
    test("複数行 display の各行に > を付与できる", () => {
      expect(withDisplayValue(quote("> a"), "x\ny")).toBe("> x\n> y");
    });
  });

  describe("マーカーを持たないブロック", () => {
    test("code は display をそのまま返せる", () => {
      expect(withDisplayValue(code("old"), "new")).toBe("new");
    });

    test("paragraph は display をそのまま返せる", () => {
      expect(withDisplayValue(para("old"), "new")).toBe("new");
    });
  });
});

// when: reclassify(current, source) を呼ぶ
describe("reclassify", () => {
  describe("paragraph からの昇格", () => {
    test("# 接頭辞で heading に昇格できる", () => {
      const r = reclassify(para("text"), "# h");
      expect(r.kind).toBe("heading");
      expect((r as HeadingBlock).level).toBe(1);
    });

    test("###### 接頭辞で heading level 6 に昇格できる", () => {
      const r = reclassify(para("text"), "###### deep");
      expect((r as HeadingBlock).level).toBe(6);
    });

    test("- 接頭辞で bulletItem に昇格できる", () => {
      expect(reclassify(para("text"), "- item").kind).toBe("bulletItem");
    });

    test("1. 接頭辞で orderedItem に昇格できる", () => {
      expect(reclassify(para("text"), "1. one").kind).toBe("orderedItem");
    });

    test("- [ ] 接頭辞で未完了 taskItem に昇格できる", () => {
      const r = reclassify(para("text"), "- [ ] todo");
      expect(r.kind).toBe("taskItem");
      expect((r as TaskItemBlock).checked).toBe(false);
    });

    test("- [x] 接頭辞で完了 taskItem に昇格できる", () => {
      const r = reclassify(para("text"), "- [x] done");
      expect((r as TaskItemBlock).checked).toBe(true);
    });

    test("> 接頭辞で blockquote に昇格できる", () => {
      expect(reclassify(para("text"), "> quoted").kind).toBe("blockquote");
    });

    test("マーカーが無ければ paragraph のまま留まれる", () => {
      expect(reclassify(para("old"), "new").kind).toBe("paragraph");
    });
  });

  describe("構造ブロックは保持される", () => {
    test("code ブロックは reclassify で kind を変更しない", () => {
      const c = code("v");
      expect(reclassify(c, "anything").kind).toBe("code");
    });

    test("table ブロックは reclassify で kind を変更しない", () => {
      const t = table();
      expect(reclassify(t, "anything").kind).toBe("table");
    });

    test("blockquote の source 更新時は kind を保持できる", () => {
      const q = quote("> old");
      const r = reclassify(q, "> new");
      expect(r.kind).toBe("blockquote");
      expect(r.source).toBe("> new");
    });
  });

  describe("kind の遷移", () => {
    test("heading から bulletItem へ降格できる", () => {
      const h = heading(1, "# old");
      expect(reclassify(h, "- list").kind).toBe("bulletItem");
    });

    test("heading のレベルだけが変わる場合は heading のまま更新できる", () => {
      const h = heading(1, "# old");
      const r = reclassify(h, "## new");
      expect(r.kind).toBe("heading");
      expect((r as HeadingBlock).level).toBe(2);
    });

    test("同じレベルの heading 編集は kind / level を保ったまま source を更新できる", () => {
      // `if (current.kind === "heading" && current.level === level)` 真分岐
      const h = heading(2, "## old");
      const r = reclassify(h, "## new");
      expect(r.kind).toBe("heading");
      expect((r as HeadingBlock).level).toBe(2);
      expect(r.source).toBe("## new");
    });

    test("既存 taskItem の source 更新は kind / checked を保ったまま反映できる", () => {
      // `if (current.kind === "taskItem")` 真分岐
      const t: TaskItemBlock = {
        id: "t",
        kind: "taskItem",
        checked: true,
        source: "- [x] old",
        inlines: [],
      };
      const r = reclassify(t, "- [x] new");
      expect(r.kind).toBe("taskItem");
      expect((r as TaskItemBlock).checked).toBe(true);
      expect(r.source).toBe("- [x] new");
    });

    test("既存 bulletItem の source 更新は kind を保ったまま反映できる", () => {
      // `if (current.kind === "bulletItem")` 真分岐
      const b = { id: "b", kind: "bulletItem" as const, source: "- old", inlines: [] };
      const r = reclassify(b, "- new");
      expect(r.kind).toBe("bulletItem");
      expect(r.source).toBe("- new");
    });

    test("既存 orderedItem の source 更新は kind を保ったまま反映できる", () => {
      // `if (current.kind === "orderedItem")` 真分岐
      const o = { id: "o", kind: "orderedItem" as const, source: "1. old", inlines: [] };
      const r = reclassify(o, "2. new");
      expect(r.kind).toBe("orderedItem");
      expect(r.source).toBe("2. new");
    });

    test("既存 paragraph の source 更新は kind を保ったまま反映できる", () => {
      // 末尾分岐 `if (current.kind === "paragraph") return ...` 真分岐
      const p = para("old");
      const r = reclassify(p, "new plain text");
      expect(r.kind).toBe("paragraph");
      expect(r.source).toBe("new plain text");
    });
  });
});

// when: orderedMarker(source) を呼ぶ
// NOTE: array 形式の test.each では object key に `then` を使うと
// `no-thenable` ルールに引っかかるため、ここは `expected` に置き換える。
// tagged template (Phase 1) では内部生成のため発火しない。
describe("orderedMarker", () => {
  test.each<{ name: string; given: string; expected: string; }>([
    { name: "1. を抽出できる", given: "1. one", expected: "1." },
    { name: "5) を抽出できる", given: "5) five", expected: "5)" },
    { name: "インデント付きの 3. を抽出できる", given: "  3. nested", expected: "3." },
    { name: "マーカーが無ければデフォルト 1. を返せる", given: "no marker", expected: "1." },
  ])("$name", ({ given, expected }) => {
    expect(orderedMarker(given)).toBe(expected);
  });
});

// when: indentStyle(source) を呼ぶ
describe("indentStyle", () => {
  test("インデントが無ければ undefined を返せる", () => {
    expect(indentStyle("no indent")).toBeUndefined();
  });

  test("半角 2 つを 1rem の paddingLeft に変換できる", () => {
    expect(indentStyle("  text")).toEqual({ paddingLeft: "1rem" });
  });

  test("半角 4 つを 2rem の paddingLeft に変換できる", () => {
    expect(indentStyle("    deep")).toEqual({ paddingLeft: "2rem" });
  });
});

// when: toggleTaskSource(source, checked) を呼ぶ
describe("toggleTaskSource", () => {
  test("[ ] を [x] に切り替えられる", () => {
    expect(toggleTaskSource("- [ ] todo", true)).toBe("- [x] todo");
  });

  test("[x] を [ ] に切り替えられる", () => {
    expect(toggleTaskSource("- [x] done", false)).toBe("- [ ] done");
  });

  test("大文字 [X] も [ ] に切り替えられる", () => {
    expect(toggleTaskSource("- [X] done", false)).toBe("- [ ] done");
  });
});
