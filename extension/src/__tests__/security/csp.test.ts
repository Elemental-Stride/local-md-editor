import { beforeEach, describe, expect, test, vi } from "vitest";

// 非機能 (セキュリティ) テスト。webview に渡す Content-Security-Policy が
// Local-First / No External Network Access の方針に沿っているかを担保する。
// 機能テストと混ぜず、ここだけで CSP の構造仕様を凍結する。
//
// vscode は extension host の組み込みなのでテストでは差し替える。
// resolveCustomTextEditor が HTML を生成するために最低限必要な API のみを
// mock 化し、表面積を狭く保つ。
vi.mock("vscode", () => {
  class MockUri {
    constructor(public readonly fsPath: string) {}
    static joinPath(base: MockUri, ...segments: string[]): MockUri {
      return new MockUri([base.fsPath, ...segments].join("/"));
    }
    static parse(s: string): MockUri {
      return new MockUri(s);
    }
    toString(): string {
      return this.fsPath;
    }
  }
  class MockRange {
    constructor(
      public startLine: number,
      public startCol: number,
      public endLine: number,
      public endCol: number,
    ) {}
  }
  class MockWorkspaceEdit {
    replace(): void {}
  }
  return {
    Uri: MockUri,
    Range: MockRange,
    WorkspaceEdit: MockWorkspaceEdit,
    window: {
      registerCustomEditorProvider: vi.fn(() => ({ dispose: vi.fn() })),
    },
    workspace: {
      onDidChangeTextDocument: () => ({ dispose: vi.fn() }),
      applyEdit: vi.fn(async () => true),
      getWorkspaceFolder: vi.fn(() => null),
      onDidChangeConfiguration: () => ({ dispose: vi.fn() }),
      getConfiguration: () => ({
        get: <T>(_key: string, defaultValue: T): T => defaultValue,
      }),
    },
    env: {
      openExternal: vi.fn(async () => true),
    },
  };
});

import { MarkdownEditorProvider } from "../../markdownEditorProvider.js";

const makeContext = () => ({
  extensionUri: { fsPath: "/ext", toString: () => "/ext" } as unknown,
  subscriptions: [] as unknown[],
});

const makeWebview = () => {
  let html = "";
  return {
    cspSource: "vscode-webview://test",
    options: {} as unknown,
    set html(v: string) {
      html = v;
    },
    get html() {
      return html;
    },
    asWebviewUri: (uri: { fsPath: string; }) => ({
      toString: () => `vscode-webview://${uri.fsPath}`,
    }),
    postMessage: () => Promise.resolve(true),
    onDidReceiveMessage: () => ({ dispose: vi.fn() }),
  };
};

const makeDocument = (text: string) => ({
  uri: { fsPath: "/foo/test.md", toString: () => "/foo/test.md" },
  lineCount: text.split("\n").length,
  version: 1,
  getText: () => text,
});

const makeWebviewPanel = (webview: ReturnType<typeof makeWebview>) => ({
  webview,
  onDidDispose: () => ({ dispose: vi.fn() }),
});

// nonce は毎回ランダム生成されるので snapshot / 構造比較の前に正規化する。
// 32 文字の英数字シーケンス (makeNonce の仕様) を <NONCE> に置換。
const NONCE_PATTERN = /[A-Za-z0-9]{32}/g;
const normalizeNonce = (html: string): string => html.replace(NONCE_PATTERN, "<NONCE>");

const extractCspContent = (html: string): string => {
  const m = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  if (!m) throw new Error("CSP meta タグが見つからない");
  return m[1];
};

// "default-src 'none'; script-src 'nonce-xxx'" 形式を
// { "default-src": ["'none'"], "script-src": ["'nonce-xxx'"] } へ。
const parseCsp = (csp: string): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (const directive of csp.split(";").map((s) => s.trim()).filter(Boolean)) {
    const [name, ...values] = directive.split(/\s+/);
    out[name] = values;
  }
  return out;
};

// when: resolveCustomTextEditor が webview.html を設定する
describe("MarkdownEditorProvider セキュリティ", () => {
  describe("CSP / HTML 生成", () => {
    let html = "";
    beforeEach(async () => {
      const ctx = makeContext();
      const provider = new MarkdownEditorProvider(
        ctx as unknown as Parameters<typeof MarkdownEditorProvider.register>[0],
      );
      const webview = makeWebview();
      const panel = makeWebviewPanel(webview);
      await provider.resolveCustomTextEditor(
        makeDocument("# title") as unknown as Parameters<
          typeof provider.resolveCustomTextEditor
        >[0],
        panel as unknown as Parameters<typeof provider.resolveCustomTextEditor>[1],
      );
      html = webview.html;
    });

    test("nonce 付き script タグを含む完全な HTML を生成できる (snapshot)", () => {
      expect(normalizeNonce(html)).toMatchInlineSnapshot(`
        "<!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-webview://test data:; style-src vscode-webview://test 'unsafe-inline'; script-src 'nonce-<NONCE>'; font-src vscode-webview://test" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <link rel="stylesheet" href="vscode-webview:///ext/dist/webview/styles.css" />
          <title>Local MD Editor</title>
        </head>
        <body>
          <div id="root"></div>
          <script type="module" nonce="<NONCE>" src="vscode-webview:///ext/dist/webview/main.js"></script>
        </body>
        </html>"
      `);
    });

    // dprint-ignore
    test.each`
      name                                                    | directive         | then
      ${"default-src を 'none' に固定できる"}                  | ${"default-src"}  | ${["'none'"]}
      ${"script-src を nonce 値のみに限定できる"}              | ${"script-src"}   | ${["'nonce-<NONCE>'"]}
      ${"style-src を webview origin と inline style に限定できる"} | ${"style-src"} | ${["vscode-webview://test", "'unsafe-inline'"]}
      ${"img-src を webview origin と data: URI に限定できる"} | ${"img-src"}      | ${["vscode-webview://test", "data:"]}
      ${"font-src を webview origin に限定できる"}             | ${"font-src"}     | ${["vscode-webview://test"]}
    `(
      "$name",
      ({ directive, then }: { directive: string; then: string[]; }) => {
        const csp = parseCsp(extractCspContent(normalizeNonce(html)));
        expect(csp[directive]).toEqual(then);
      },
    );

    // 上の directive table は exact equality なので 'unsafe-eval' 等が増えれば
    // 自動的に落ちるが、policy が「何を明示的に禁止しているか」を仕様として
    // 読めるようにするため、危険値を 1 つずつ別テストで sentinel として残す。
    describe("script-src の危険値排除", () => {
      // dprint-ignore
      test.each`
        name                                            | forbidden
        ${"'unsafe-eval' を禁止できる"}                  | ${"'unsafe-eval'"}
        ${"'unsafe-inline' を禁止できる"}                | ${"'unsafe-inline'"}
        ${"ワイルドカード '*' を禁止できる"}             | ${"*"}
      `(
        "$name",
        ({ forbidden }: { forbidden: string; }) => {
          const csp = parseCsp(extractCspContent(normalizeNonce(html)));
          expect(csp["script-src"] ?? []).not.toContain(forbidden);
        },
      );

      // dprint-ignore
      test.each`
        name                              | scheme
        ${"http: スキームを禁止できる"}    | ${"http:"}
        ${"https: スキームを禁止できる"}   | ${"https:"}
        ${"data: スキームを禁止できる"}    | ${"data:"}
      `(
        "$name",
        ({ scheme }: { scheme: string; }) => {
          const csp = parseCsp(extractCspContent(normalizeNonce(html)));
          const scriptSrc = csp["script-src"] ?? [];
          expect(scriptSrc.some((v) => v.startsWith(scheme))).toBe(false);
        },
      );
    });
  });
});
