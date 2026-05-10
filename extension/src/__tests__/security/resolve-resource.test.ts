import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from "@local-md-editor/shared";
import { beforeEach, describe, expect, test, vi } from "vitest";

// 非機能 (セキュリティ) テスト。webview から送られる resolveResource ref が
// localResourceRoots の外部や危険スキームへ脱出しないことを構造仕様として
// 凍結する。Local-First / Safe File Handling の方針に直接対応する。
//
// vscode は extension host の組み込みなのでテストでは差し替える。
// resolveResource の判定は Uri.joinPath の正規化に依存するため、CSP テストの
// MockUri と違い ".." を解決する版を用意する。
vi.mock("vscode", () => {
  class MockUri {
    constructor(public readonly fsPath: string) {}
    // 実 VS Code の joinPath は ".." を解決する。string-prefix で localResourceRoots
    // 判定する isInside と正しく噛み合うのは正規化後だけなので、ここでも正規化する。
    static joinPath(base: MockUri, ...segments: string[]): MockUri {
      const parts = [base.fsPath, ...segments].join("/").split("/");
      const stack: string[] = [];
      for (const p of parts) {
        if (p === "" || p === ".") continue;
        if (p === "..") stack.pop();
        else stack.push(p);
      }
      return new MockUri("/" + stack.join("/"));
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

type MessageHandler = (msg: WebviewToExtensionMessage) => unknown;

const makeWebview = () => {
  let html = "";
  const posted: ExtensionToWebviewMessage[] = [];
  let handler: MessageHandler | null = null;
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
    postMessage: (msg: ExtensionToWebviewMessage) => {
      posted.push(msg);
      return Promise.resolve(true);
    },
    onDidReceiveMessage: (h: MessageHandler) => {
      handler = h;
      return { dispose: vi.fn() };
    },
    posted,
    receive: async (msg: WebviewToExtensionMessage): Promise<void> => {
      if (handler === null) throw new Error("onDidReceiveMessage handler が未登録");
      await handler(msg);
    },
  };
};

// docDir が "/foo" になるよう、ドキュメント本体は "/foo/test.md" に置く。
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

// resolveResource の応答 (resolvedResource) を posted から取り出す。
// 1 リクエスト = 1 応答である前提で、最後の resolvedResource を返す。
const lastResolved = (
  webview: ReturnType<typeof makeWebview>,
): Extract<ExtensionToWebviewMessage, { type: "resolvedResource"; }> => {
  const r = [...webview.posted]
    .reverse()
    .find((m): m is Extract<ExtensionToWebviewMessage, { type: "resolvedResource"; }> =>
      m.type === "resolvedResource"
    );
  if (!r) throw new Error("resolvedResource 応答が見つからない");
  return r;
};

// when: webview から resolveResource を送ったとき extension がどう応えるか
describe("MarkdownEditorProvider セキュリティ", () => {
  describe("resolveResource", () => {
    let webview: ReturnType<typeof makeWebview>;
    beforeEach(async () => {
      const ctx = makeContext();
      const provider = new MarkdownEditorProvider(
        ctx as unknown as Parameters<typeof MarkdownEditorProvider.register>[0],
      );
      webview = makeWebview();
      const panel = makeWebviewPanel(webview);
      await provider.resolveCustomTextEditor(
        makeDocument("# title") as unknown as Parameters<
          typeof provider.resolveCustomTextEditor
        >[0],
        panel as unknown as Parameters<typeof provider.resolveCustomTextEditor>[1],
      );
    });

    describe("ドキュメントディレクトリ配下の安全な相対参照", () => {
      // dprint-ignore
      test.each`
        name                                              | ref
        ${"単純な相対パスを許可できる"}                    | ${"img/foo.png"}
        ${"./ で始まる相対パスを許可できる"}               | ${"./img/foo.png"}
        ${"正規化後 docDir 内に留まる .. を許可できる"}    | ${"sub/../img/foo.png"}
      `(
        "$name",
        async ({ ref }: { ref: string; }) => {
          await webview.receive({ type: "resolveResource", requestId: "r1", ref });
          const res = lastResolved(webview);
          expect(res.uri).not.toBeNull();
          expect(res.ref).toBe(ref);
          expect(res.requestId).toBe("r1");
        },
      );
    });

    describe("危険スキームを持つ ref の拒否", () => {
      // `://` なしの単純コロン形式 (javascript:alert(1) / mailto: / tel:) も
      // RFC 3986 の scheme syntax で拾えていることを担保する sentinel を含む。
      // dprint-ignore
      test.each`
        name                                              | ref
        ${"空文字列を拒否できる"}                          | ${""}
        ${"data: URI を拒否できる"}                        | ${"data:image/png;base64,iVBORw0KGgo="}
        ${"http:// を拒否できる"}                          | ${"http://evil.example/x.png"}
        ${"https:// を拒否できる"}                         | ${"https://evil.example/x.png"}
        ${"file:// を拒否できる"}                          | ${"file:///etc/passwd"}
        ${"javascript: (// なし) を拒否できる"}            | ${"javascript:alert(1)"}
        ${"javascript:// を拒否できる"}                    | ${"javascript://evil"}
        ${"大文字混じり JavaScript: を拒否できる"}         | ${"JavaScript:alert(1)"}
        ${"vbscript: を拒否できる"}                        | ${"vbscript:msgbox(1)"}
        ${"mailto: を拒否できる"}                          | ${"mailto:foo@example.com"}
        ${"tel: を拒否できる"}                             | ${"tel:+1234567890"}
        ${"vscode:// を拒否できる"}                        | ${"vscode://settings"}
      `(
        "$name",
        async ({ ref }: { ref: string; }) => {
          await webview.receive({ type: "resolveResource", requestId: "r1", ref });
          const res = lastResolved(webview);
          expect(res.uri).toBeNull();
          expect(res.ref).toBe(ref);
          expect(res.requestId).toBe("r1");
        },
      );
    });

    describe("親ディレクトリへの脱出 (path traversal) の拒否", () => {
      // docDir は "/foo"、許可 root は "/foo" と "/ext/dist/webview"。
      // ".." で正規化後にこれら配下から外れた場合は null を返す必要がある。
      // dprint-ignore
      test.each`
        name                                                | ref
        ${"単純な ../ で docDir を抜ける ref を拒否できる"} | ${"../secret.txt"}
        ${"連続した ../ で / 直下に到達する ref を拒否できる"} | ${"../../../../etc/passwd"}
        ${"中間で深く潜ってから抜ける ref を拒否できる"}    | ${"a/b/../../../outside.txt"}
      `(
        "$name",
        async ({ ref }: { ref: string; }) => {
          await webview.receive({ type: "resolveResource", requestId: "r1", ref });
          const res = lastResolved(webview);
          expect(res.uri).toBeNull();
        },
      );
    });

    test("requestId と ref を改変せずそのまま echo できる", async () => {
      await webview.receive({
        type: "resolveResource",
        requestId: "abc-123",
        ref: "img/ok.png",
      });
      const res = lastResolved(webview);
      expect(res.requestId).toBe("abc-123");
      expect(res.ref).toBe("img/ok.png");
    });
  });
});
