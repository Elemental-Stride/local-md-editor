import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, test } from "vitest";

// 非機能 (セキュリティ) テスト。webview の自前ソース (webview/src/**) に
// "外界に出る抜け道" のパターンが書かれていないことを source-level で検査する。
//
// なぜ runtime ではなく source 検査か:
// - oxlint は no-restricted-globals で fetch / XMLHttpRequest / WebSocket /
//   EventSource を禁止しているが、メソッド呼び出し形 (obj.fetch) や
//   window.open / location.href = … といったナビゲーション・計測ピクセル
//   までは表現できない。
// - bundle 検査 (bundle-no-network.test.ts と対応関係) は webview 側だと
//   mermaid bundle のせいで誤検知が爆発する。CSP `default-src 'none'` が
//   実行時の network を遮断する一方、コード上の意図 (escape を書こうと
//   しているか) を凍結するのが本テストの責務。
//
// 配置の理由: テスト本体は Node API (fs / path) を使うが、webview package は
// 規約 (oxlint + tsconfig types) でこれらを禁止しているため、cross-package
// scan として extension 配下に置く。

// monorepo root から `pnpm test` で実行するか、extension package で
// 個別実行するかで cwd が変わるため、テストファイル位置から相対解決する。
// extension は type: commonjs により CJS なので __dirname がそのまま使える。
const WEBVIEW_SRC = resolve(__dirname, "../../../../webview/src");

const SCAN_EXTENSIONS = new Set([".ts", ".tsx"]);
const EXCLUDED_DIRS = new Set(["__tests__", "node_modules"]);

// ファイルの中身を Map<相対パス, content> で返す。
const collectSources = (root: string): Map<string, string> => {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (EXCLUDED_DIRS.has(entry)) continue;
      const abs = join(dir, entry);
      const st = statSync(abs);
      if (st.isDirectory()) {
        walk(abs);
        continue;
      }
      const dot = entry.lastIndexOf(".");
      if (dot < 0) continue;
      const ext = entry.slice(dot);
      if (!SCAN_EXTENSIONS.has(ext)) continue;
      if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) continue;
      out.set(relative(WEBVIEW_SRC, abs), readFileSync(abs, "utf8"));
    }
  };
  walk(root);
  return out;
};

type Violation = { file: string; line: number; text: string; };

const findViolations = (
  sources: Map<string, string>,
  pattern: RegExp,
): Violation[] => {
  const out: Violation[] = [];
  for (const [file, content] of sources) {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        out.push({ file, line: i + 1, text: lines[i].trim() });
      }
    }
  }
  return out;
};

const formatViolations = (v: Violation[]): string =>
  v.map((x) => `  ${x.file}:${x.line}  ${x.text}`).join("\n");

// when: webview/src 配下の自前コードを走査する
describe("webview source 抜け道 sentinel", () => {
  const sources = collectSources(WEBVIEW_SRC);

  test("収集対象が空でないことを担保できる", () => {
    // ガード: glob ロジックがバグって空集合を返したのに気付かないと
    // 全ての denylist test が「該当なし」で偽陽性 pass してしまう。
    expect(sources.size).toBeGreaterThan(0);
  });

  describe("Window / Location ナビゲーション API の使用禁止", () => {
    // dprint-ignore
    test.each`
      name                                                | pattern
      ${"window.open( を含まないことを担保できる"}         | ${/\bwindow\.open\s*\(/}
      ${"location.href への代入を含まないことを担保できる"} | ${/\blocation\.href\s*=/}
      ${"location.replace( を含まないことを担保できる"}    | ${/\blocation\.replace\s*\(/}
      ${"location.assign( を含まないことを担保できる"}     | ${/\blocation\.assign\s*\(/}
    `(
      "$name",
      ({ pattern }: { pattern: RegExp; }) => {
        const v = findViolations(sources, pattern);
        expect(v, `\n${formatViolations(v)}`).toEqual([]);
      },
    );
  });

  describe("Network API の使用禁止 (oxlint との二重防御)", () => {
    // oxlint は global identifier の参照を捕捉するが、メソッド形
    // (`x.fetch(`) や文字列でのアクセスまでは押さえない。本テストは
    // source 全文に対する pattern match で表面を広めに捕まえる。
    // dprint-ignore
    test.each`
      name                                                | pattern
      ${"fetch( メソッド呼び出しを含まないことを担保できる"} | ${/\.fetch\s*\(/}
      ${"new XMLHttpRequest を含まないことを担保できる"}    | ${/\bnew\s+XMLHttpRequest\b/}
      ${"new WebSocket を含まないことを担保できる"}         | ${/\bnew\s+WebSocket\b/}
      ${"new EventSource を含まないことを担保できる"}       | ${/\bnew\s+EventSource\b/}
      ${"navigator.sendBeacon を含まないことを担保できる"}  | ${/\bnavigator\.sendBeacon\s*\(/}
    `(
      "$name",
      ({ pattern }: { pattern: RegExp; }) => {
        const v = findViolations(sources, pattern);
        expect(v, `\n${formatViolations(v)}`).toEqual([]);
      },
    );
  });

  describe("計測 / 永続化 系の使用禁止", () => {
    // dprint-ignore
    test.each`
      name                                                       | pattern
      ${"new Image( (tracking pixel) を含まないことを担保できる"} | ${/\bnew\s+Image\s*\(/}
      ${"document.cookie へのアクセスを含まないことを担保できる"}  | ${/\bdocument\.cookie\b/}
    `(
      "$name",
      ({ pattern }: { pattern: RegExp; }) => {
        const v = findViolations(sources, pattern);
        expect(v, `\n${formatViolations(v)}`).toEqual([]);
      },
    );
  });
});
