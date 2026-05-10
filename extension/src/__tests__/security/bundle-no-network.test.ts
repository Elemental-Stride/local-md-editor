import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

// 非機能 (セキュリティ) テスト。esbuild で bundle した extension.js に
// 「外部通信を匂わせる文字列」が混入していないことを sentinel として固定する。
// transitive deps が将来何かを引き込んでも、ここで気付ける。
//
// スコープに関する設計判断:
// - extension.js はチェック対象。自前コード + node-html-parser/remark/unified
//   が中心で URL もごく少数 (現状 1 件) しかなく、deny + 小さな allowlist で
//   現実的に守れる。
// - webview/main.js は対象外。Mermaid の bundle に SVG/MathML namespace、
//   ライセンス参照、KaTeX の `fetch` メソッド等が大量に含まれており、
//   文字列レベルの sentinel では誤検知が爆発する。
//   webview 側の「自前コードが外界に出る抜け道がないか」は webview/src/**
//   に対する source-level sentinel (escape-hatch.test.ts) でカバーする。
//   実行時の network 遮断は CSP `default-src 'none'` (csp.test.ts) が担う。

// monorepo root から `pnpm test` で実行するか、extension package で
// 個別実行するかで cwd が変わるため、テストファイル位置から相対解決する。
// extension package は package.json の type: commonjs により CJS なので
// __dirname がそのまま使える。
const EXT_BUNDLE = resolve(__dirname, "../../../dist/extension.js");

// 初回ロード時に dist の存在を確認し、未生成なら明確に fail させる。
// auto-build しないのは、oxlint で extension/src/** からの child_process
// import が禁止されているため (RCE 防止規則の側面のほうが重要)。
const requireBundle = (): string => {
  if (!existsSync(EXT_BUNDLE)) {
    throw new Error(
      `${EXT_BUNDLE} が見つからない。先に \`pnpm build\` を実行すること。`,
    );
  }
  return readFileSync(EXT_BUNDLE, "utf8");
};

// 文字列出現箇所を周辺コンテキストつきで集めるユーティリティ。
// fail メッセージで「どこに混入したか」を一目で読み取れるようにする。
const findOccurrences = (haystack: string, needle: string): string[] => {
  const out: string[] = [];
  let from = 0;
  while (true) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    const start = Math.max(0, at - 30);
    const end = Math.min(haystack.length, at + needle.length + 30);
    out.push(haystack.slice(start, end));
    from = at + needle.length;
  }
  return out;
};

// when: extension.js を読み込み、外部通信の痕跡を探す
describe("extension bundle セキュリティ", () => {
  let bundle = "";
  describe("dist/extension.js", () => {
    // beforeAll より test 内の lazy 初期化のほうが skip 時のコストがゼロ。
    const load = (): string => {
      if (bundle === "") bundle = requireBundle();
      return bundle;
    };

    describe("外部通信 API の呼び出し痕跡を含まない", () => {
      // dprint-ignore
      test.each`
        name                                          | needle
        ${"fetch( を含まないことを担保できる"}         | ${"fetch("}
        ${"XMLHttpRequest を含まないことを担保できる"} | ${"XMLHttpRequest"}
        ${"WebSocket を含まないことを担保できる"}      | ${"WebSocket"}
        ${"EventSource を含まないことを担保できる"}    | ${"EventSource"}
        ${"navigator.sendBeacon を含まないことを担保できる"} | ${"navigator.sendBeacon"}
      `(
        "$name",
        ({ needle }: { needle: string; }) => {
          const hits = findOccurrences(load(), needle);
          expect(hits, `${needle} 出現箇所:\n${hits.join("\n")}`).toEqual([]);
        },
      );
    });

    describe("Node の network モジュール文字列を含まない", () => {
      // oxlint で import は禁止済み。bundle に文字列として現れていないことの
      // 二重防御。"node:http" 等は require 経由で動的ロードされるケースを拾う。
      // dprint-ignore
      test.each`
        name                                  | needle
        ${"node:http を含まない"}              | ${"node:http"}
        ${"node:https を含まない"}             | ${"node:https"}
        ${"node:net を含まない"}               | ${"node:net"}
        ${"node:tls を含まない"}               | ${"node:tls"}
        ${"node:dgram を含まない"}             | ${"node:dgram"}
        ${"node:child_process を含まない"}     | ${"node:child_process"}
      `(
        "$name",
        ({ needle }: { needle: string; }) => {
          const hits = findOccurrences(load(), needle);
          expect(hits, `${needle} 出現箇所:\n${hits.join("\n")}`).toEqual([]);
        },
      );
    });

    describe("外部 URL の混入は明示的な allowlist のみに限定できる", () => {
      // これまでに観測されている bundle 内 URL の allowlist。
      // - https://mths.be/he : node-html-parser の HTML entity decoder
      //   (he ライブラリ) のホームページ参照。コメント/メタデータ。
      // 新たに URL が混入したらこの test が落ちて allowlist 更新の判断を迫る。
      const ALLOWED_URLS = new Set<string>([
        "https://mths.be/he",
      ]);

      test("bundle 内の http(s) URL は allowlist に含まれるもののみ", () => {
        const found = new Set<string>();
        // 文字や数字、一部記号を含むまでを 1 つの URL とみなす。クエリ・断片
        // までは追わない (allowlist を細かくしすぎないため)。
        const urlPattern = /https?:\/\/[a-zA-Z0-9._~%+-/:]+/g;
        for (const match of load().matchAll(urlPattern)) {
          found.add(match[0]);
        }
        const unexpected = [...found].filter((u) => !ALLOWED_URLS.has(u));
        expect(
          unexpected,
          `未許可の URL が bundle に混入:\n${unexpected.join("\n")}`,
        ).toEqual([]);
      });
    });
  });
});
