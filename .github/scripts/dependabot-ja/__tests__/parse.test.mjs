import { describe, expect, test } from "vitest";
import {
  parseAdvisories,
  parseDependabotPr,
  parseTitlePrefix,
  parseUpdatedDependencies,
  parseVersionTransitions,
} from "../parse.mjs";

// Dependabot が実際に書く commit message (末尾の YAML ブロックが機械可読部分)。
const SECURITY_COMMIT = `chore(deps): bump undici from 7.25.0 to 7.30.1
Bumps [undici](https://github.com/nodejs/undici) from 7.25.0 to 7.30.1. **This update includes a security fix.**
- [Release notes](https://github.com/nodejs/undici/releases)

---
updated-dependencies:
- dependency-name: undici
  dependency-version: 7.30.1
  dependency-type: indirect
...

Signed-off-by: dependabot[bot] <support@github.com>`;

const GROUP_COMMIT = `chore(deps-dev): bump the dev-tooling group with 2 updates
Bumps the dev-tooling group with 2 updates: [esbuild](https://github.com/evanw/esbuild) and [oxlint](https://github.com/oxc-project/oxc).

Updates \`esbuild\` from 0.25.0 to 0.25.11
Updates \`oxlint\` from 0.15.0 to 0.15.14

---
updated-dependencies:
- dependency-name: esbuild
  dependency-version: 0.25.11
  dependency-type: direct:development
  update-type: version-update:semver-patch
  dependency-group: dev-tooling
- dependency-name: oxlint
  dependency-version: 0.15.14
  dependency-type: direct:development
  update-type: version-update:semver-patch
  dependency-group: dev-tooling
...

Signed-off-by: dependabot[bot] <support@github.com>`;

const SCOPED_COMMIT = `---
updated-dependencies:
- dependency-name: "@vscode/vsce"
  dependency-version: 3.6.2
  dependency-type: direct:development
  update-type: version-update:semver-minor
...`;

// when: parseUpdatedDependencies(commit message) を呼ぶ
describe("parseUpdatedDependencies", () => {
  describe("YAML ブロックの読み取り", () => {
    test("単一依存の名前・更新後バージョン・区分・更新種別を抽出できる", () => {
      expect(parseUpdatedDependencies(SECURITY_COMMIT)).toEqual([
        { name: "undici", to: "7.30.1", from: null, kind: "indirect", level: "unknown" },
      ]);
    });

    test("グループ更新の複数依存をリスト順に抽出できる", () => {
      expect(parseUpdatedDependencies(GROUP_COMMIT)).toEqual([
        {
          name: "esbuild",
          to: "0.25.11",
          from: null,
          kind: "development",
          level: "patch",
        },
        {
          name: "oxlint",
          to: "0.15.14",
          from: null,
          kind: "development",
          level: "patch",
        },
      ]);
    });

    test("引用符付きの scoped package 名を引用符なしで取り出せる", () => {
      expect(parseUpdatedDependencies(SCOPED_COMMIT)[0].name).toBe("@vscode/vsce");
    });
  });

  describe("エッジケース", () => {
    // dprint-ignore
    test.each`
      name                                              | given
      ${"YAML ブロックが無い message では空配列を返す"}      | ${"Merge pull request #1 from foo"}
      ${"空文字列では空配列を返す"}                        | ${""}
      ${"null では空配列を返す"}                          | ${null}
    `(
      "$name",
      ({ given }) => {
        expect(parseUpdatedDependencies(given)).toEqual([]);
      },
    );
  });
});

// when: parseVersionTransitions(PR 本文) を呼ぶ
describe("parseVersionTransitions", () => {
  describe("更新前バージョンの抽出", () => {
    test("Bumps [name](url) from X to Y. 形式から更新前後を取り出せる", () => {
      const transitions = parseVersionTransitions(
        "Bumps [undici](https://github.com/nodejs/undici) from 7.25.0 to 7.30.1.",
      );
      expect(transitions.get("undici")).toEqual({ from: "7.25.0", to: "7.30.1" });
    });

    test("Updates `name` from X to Y 形式 (グループ更新) から更新前後を取り出せる", () => {
      const transitions = parseVersionTransitions("Updates `oxlint` from 0.15.0 to 0.15.14");
      expect(transitions.get("oxlint")).toEqual({ from: "0.15.0", to: "0.15.14" });
    });

    test("バージョンの後に文が続く security update の行でも更新前後を取り出せる", () => {
      const transitions = parseVersionTransitions(
        "Bumps [dompurify](https://github.com/cure53/DOMPurify) from 3.4.2 to 3.4.17."
          + " **This update includes a security fix.**",
      );
      expect(transitions.get("dompurify")).toEqual({ from: "3.4.2", to: "3.4.17" });
    });

    test("同じ依存が複数回現れても最初の 1 件を採用する", () => {
      const transitions = parseVersionTransitions(
        "Updates `react` from 18.3.1 to 19.0.0\nUpdates `react` from 19.0.0 to 19.0.1",
      );
      expect(transitions.get("react")).toEqual({ from: "18.3.1", to: "19.0.0" });
    });
  });
});

// when: parseAdvisories(PR 本文) を呼ぶ
describe("parseAdvisories", () => {
  describe("脆弱性 ID の抽出", () => {
    test("GHSA ID に Advisory Database の URL を付けて返せる", () => {
      expect(parseAdvisories("see GHSA-xjj6-f33q-929c for details")).toEqual([
        {
          id: "GHSA-xjj6-f33q-929c",
          url: "https://github.com/advisories/GHSA-xjj6-f33q-929c",
        },
      ]);
    });

    test("CVE ID は URL なしで返せる", () => {
      expect(parseAdvisories("CVE-2026-109869")).toEqual([
        { id: "CVE-2026-109869", url: null },
      ]);
    });

    test("同一 ID が本文に何度現れても 1 件に重複排除できる", () => {
      const advisories = parseAdvisories("GHSA-xjj6-f33q-929c and GHSA-xjj6-f33q-929c again");
      expect(advisories).toHaveLength(1);
    });

    test("脆弱性 ID を含まない本文では空配列を返す", () => {
      expect(parseAdvisories("Bumps esbuild from 0.25.0 to 0.25.11")).toEqual([]);
    });
  });
});

// when: parseTitlePrefix(PR タイトル) を呼ぶ
describe("parseTitlePrefix", () => {
  describe("conventional commit prefix の保持", () => {
    // dprint-ignore
    test.each`
      name                                          | given                                        | then
      ${"scope 付き prefix を抽出できる"}              | ${"chore(deps): bump undici from 1 to 2"}    | ${"chore(deps)"}
      ${"scope なし prefix を抽出できる"}              | ${"chore: bump undici"}                      | ${"chore"}
      ${"prefix が無いタイトルでは null を返す"}        | ${"Bump undici from 7.25.0 to 7.30.1"}       | ${null}
    `(
      "$name",
      ({ given, then }) => {
        expect(parseTitlePrefix(given)).toBe(then);
      },
    );
  });
});

// when: parseDependabotPr({ title, body, commitMessage }) を呼ぶ
describe("parseDependabotPr", () => {
  describe("メタ情報の合成", () => {
    test("commit message の依存情報へ本文由来の更新前バージョンを合成できる", () => {
      const meta = parseDependabotPr({
        title: "chore(deps): bump undici from 7.25.0 to 7.30.1",
        body: "Bumps [undici](https://github.com/nodejs/undici) from 7.25.0 to 7.30.1.",
        commitMessage: SECURITY_COMMIT,
      });
      expect(meta.dependencies[0]).toEqual({
        name: "undici",
        from: "7.25.0",
        to: "7.30.1",
        kind: "indirect",
        level: "unknown",
      });
    });

    test("グループ名を dependency-group から判定できる", () => {
      const meta = parseDependabotPr({
        title: "chore(deps-dev): bump the dev-tooling group with 2 updates",
        body: "Bumps the dev-tooling group with 2 updates",
        commitMessage: GROUP_COMMIT,
      });
      expect(meta.group).toBe("dev-tooling");
    });
  });

  describe("セキュリティ更新の判定", () => {
    test("GHSA ID を含む本文をセキュリティ更新と判定できる", () => {
      const meta = parseDependabotPr({
        title: "chore(deps): bump undici",
        body: "Vulnerabilities fixed: GHSA-xjj6-f33q-929c",
        commitMessage: SECURITY_COMMIT,
      });
      expect(meta.security).toBe(true);
    });

    test("ID が無くても security fix の文言があればセキュリティ更新と判定できる", () => {
      const meta = parseDependabotPr({
        title: "chore(deps): bump undici",
        body: "**This update includes a security fix.**",
        commitMessage: SECURITY_COMMIT,
      });
      expect(meta.security).toBe(true);
    });

    test("通常の定期更新を非セキュリティ更新として扱える", () => {
      const meta = parseDependabotPr({
        title: "chore(deps-dev): bump the dev-tooling group with 2 updates",
        body: "Updates `esbuild` from 0.25.0 to 0.25.11",
        commitMessage: GROUP_COMMIT,
      });
      expect(meta.security).toBe(false);
    });
  });
});
