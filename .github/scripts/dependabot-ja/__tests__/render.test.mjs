import { describe, expect, test } from "vitest";
import { extractOriginalBody, JA_BEGIN, renderBody, renderTitle } from "../render.mjs";

/** @returns {import("../parse.mjs").DependabotPr} */
function meta(overrides = {}) {
  return {
    prefix: "chore(deps)",
    group: null,
    security: false,
    dependencies: [
      { name: "undici", from: "7.25.0", to: "7.30.1", kind: "indirect", level: "patch" },
    ],
    advisories: [],
    ...overrides,
  };
}

// when: renderTitle(meta, 元タイトル) を呼ぶ
describe("renderTitle", () => {
  describe("日本語タイトルの生成", () => {
    test("単一依存を「X を A から B に更新」の形で出力できる", () => {
      expect(renderTitle(meta(), "Bump undici from 7.25.0 to 7.30.1")).toBe(
        "chore(deps): undici を 7.25.0 から 7.30.1 に更新",
      );
    });

    test("セキュリティ更新には末尾へ (セキュリティ修正) を付けられる", () => {
      expect(renderTitle(meta({ security: true }), "x")).toBe(
        "chore(deps): undici を 7.25.0 から 7.30.1 に更新 (セキュリティ修正)",
      );
    });

    test("グループ更新をグループ名と件数で表現できる", () => {
      const grouped = meta({
        prefix: "chore(deps-dev)",
        group: "dev-tooling",
        dependencies: [
          { name: "esbuild", from: "0.25.0", to: "0.25.11", kind: "development", level: "patch" },
          { name: "oxlint", from: "0.15.0", to: "0.15.14", kind: "development", level: "patch" },
        ],
      });
      expect(renderTitle(grouped, "x")).toBe(
        "chore(deps-dev): dev-tooling グループの依存 2 件を更新",
      );
    });

    test("更新前バージョンが読めない場合は更新後のみで組み立てられる", () => {
      const partial = meta({
        dependencies: [
          { name: "undici", from: null, to: "7.30.1", kind: "indirect", level: "patch" },
        ],
      });
      expect(renderTitle(partial, "x")).toBe("chore(deps): undici を 7.30.1 に更新");
    });

    test("prefix が無い場合は chore(deps) を補える", () => {
      expect(renderTitle(meta({ prefix: null }), "x")).toBe(
        "chore(deps): undici を 7.25.0 から 7.30.1 に更新",
      );
    });

    test("依存を 1 件も読めなかった場合は元タイトルを維持できる", () => {
      expect(renderTitle(meta({ dependencies: [] }), "Bump something")).toBe("Bump something");
    });
  });
});

// when: renderBody(meta, 元本文) を呼ぶ
describe("renderBody", () => {
  describe("本文の構成", () => {
    test("日本語セクションを先頭に置き原文を details 内へ格納できる", () => {
      const body = renderBody(meta(), "Bumps undici from 7.25.0 to 7.30.1.");
      expect(body.startsWith(JA_BEGIN)).toBe(true);
      expect(body).toContain("<summary>Dependabot の原文 (英語)</summary>");
      expect(body).toContain("Bumps undici from 7.25.0 to 7.30.1.");
    });

    test("依存の一覧を表として出力できる", () => {
      expect(renderBody(meta(), "")).toContain(
        "| `undici` | 7.25.0 → 7.30.1 | 間接依存 | パッチ |",
      );
    });

    test("セキュリティ更新では脆弱性 ID をリンク付きで列挙できる", () => {
      const secure = meta({
        security: true,
        advisories: [
          {
            id: "GHSA-xjj6-f33q-929c",
            url: "https://github.com/advisories/GHSA-xjj6-f33q-929c",
          },
        ],
      });
      const body = renderBody(secure, "");
      expect(body).toContain("### 修正される脆弱性");
      expect(body).toContain(
        "- [GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c)",
      );
    });

    test("配布物に入る依存ではエディタ上の動作確認を確認項目に追加できる", () => {
      const production = meta({
        dependencies: [
          { name: "mermaid", from: "11.14.0", to: "11.15.0", kind: "production", level: "minor" },
        ],
      });
      expect(renderBody(production, "")).toContain("VS Code 上で拡張の動作確認");
    });

    test("メジャー更新では breaking change の確認項目を追加できる", () => {
      const major = meta({
        dependencies: [
          { name: "react", from: "18.3.1", to: "19.0.0", kind: "production", level: "major" },
        ],
      });
      expect(renderBody(major, "")).toContain("breaking change");
    });

    test("セキュリティ更新では minimumReleaseAge の確認項目を追加できる", () => {
      expect(renderBody(meta({ security: true }), "")).toContain("minimumReleaseAge");
    });
  });

  describe("再実行時のべき等性", () => {
    test("日本語化済みの本文を入力しても原文を 1 つだけ保ったまま再生成できる", () => {
      const once = renderBody(meta(), "Bumps undici from 7.25.0 to 7.30.1.");
      const twice = renderBody(meta(), once);
      expect(twice).toBe(once);
    });
  });
});

// when: extractOriginalBody(本文) を呼ぶ
describe("extractOriginalBody", () => {
  describe("原文の取り出し", () => {
    test("日本語化済み本文から Dependabot の原文だけを取り出せる", () => {
      const rendered = renderBody(meta(), "Bumps undici from 7.25.0 to 7.30.1.");
      expect(extractOriginalBody(rendered)).toBe("Bumps undici from 7.25.0 to 7.30.1.");
    });

    test("日本語化されていない本文はそのまま原文として扱える", () => {
      expect(extractOriginalBody("Bumps undici")).toBe("Bumps undici");
    });
  });
});
