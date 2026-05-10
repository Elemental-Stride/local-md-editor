import type { WebviewToExtensionMessage } from "@local-md-editor/shared";
import { beforeEach, describe, expect, test, vi } from "vitest";

// 非機能 (セキュリティ) テスト。webview から送られる openLink URL が
// http(s)/mailto のホワイトリストに合致するときだけ openExternal に渡る
// ことを構造仕様として凍結する。javascript: / file: / vscode: 等を素通しすると
// 予期しないハンドラ起動経路になり得るため、deny ではなく allow で守る。
//
// resolveResource 側のテストと違って .. の正規化は要らないので、CSP テスト
// 同等の単純 MockUri で十分。
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
    },
    env: {
      openExternal: vi.fn(async () => true),
    },
  };
});

import * as vscode from "vscode";
import { MarkdownEditorProvider } from "../../markdownEditorProvider.js";

const openExternalMock = vi.mocked(vscode.env.openExternal);

const makeContext = () => ({
  extensionUri: { fsPath: "/ext", toString: () => "/ext" } as unknown,
  subscriptions: [] as unknown[],
});

type MessageHandler = (msg: WebviewToExtensionMessage) => unknown;

const makeWebview = () => {
  let html = "";
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
    postMessage: () => Promise.resolve(true),
    onDidReceiveMessage: (h: MessageHandler) => {
      handler = h;
      return { dispose: vi.fn() };
    },
    receive: async (msg: WebviewToExtensionMessage): Promise<void> => {
      if (handler === null) throw new Error("onDidReceiveMessage handler が未登録");
      await handler(msg);
    },
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

// when: webview から openLink を送ったとき extension がどう応えるか
describe("MarkdownEditorProvider セキュリティ", () => {
  describe("openLink", () => {
    let webview: ReturnType<typeof makeWebview>;
    beforeEach(async () => {
      openExternalMock.mockClear();
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

    describe("ホワイトリスト (http/https/mailto) の許可", () => {
      // dprint-ignore
      test.each`
        name                                                | url
        ${"http:// で始まる URL を openExternal に渡せる"}   | ${"http://example.com/page"}
        ${"https:// で始まる URL を openExternal に渡せる"}  | ${"https://example.com/page"}
        ${"大文字 HTTPS:// で始まる URL も渡せる"}           | ${"HTTPS://example.com"}
        ${"mailto: で始まる URL を openExternal に渡せる"}   | ${"mailto:foo@example.com"}
      `(
        "$name",
        async ({ url }: { url: string; }) => {
          await webview.receive({ type: "openLink", url });
          expect(openExternalMock).toHaveBeenCalledOnce();
          // Uri.parse(url) されたうえで渡される (MockUri は fsPath = 入力)
          const arg = openExternalMock.mock.calls[0]?.[0] as { fsPath: string; };
          expect(arg.fsPath).toBe(url);
        },
      );
    });

    describe("ホワイトリスト外スキームの拒否", () => {
      // 拒否時は openExternal を呼ばずに silent に return する。
      // Local-First 思想上、UI への通知は不要 (ユーザー入力を起点としない攻撃
      // ベクトルなので、フィードバックはむしろ攻撃面になる)。
      // dprint-ignore
      test.each`
        name                                            | url
        ${"javascript: スキームを拒否できる"}            | ${"javascript:alert(1)"}
        ${"javascript:// 形式も拒否できる"}              | ${"javascript://evil"}
        ${"大文字混じり JavaScript: も拒否できる"}       | ${"JavaScript:alert(1)"}
        ${"vbscript: スキームを拒否できる"}              | ${"vbscript:msgbox(1)"}
        ${"file:// スキームを拒否できる"}                | ${"file:///etc/passwd"}
        ${"vscode:// スキームを拒否できる"}              | ${"vscode://settings"}
        ${"vscode-insiders:// スキームを拒否できる"}     | ${"vscode-insiders://settings"}
        ${"data: スキームを拒否できる"}                  | ${"data:text/html,<script>alert(1)</script>"}
        ${"ftp: スキームを拒否できる"}                   | ${"ftp://example.com"}
        ${"chrome-extension: スキームを拒否できる"}      | ${"chrome-extension://abc/def"}
        ${"空文字列を拒否できる"}                        | ${""}
        ${"スキームなしの相対パスを拒否できる"}          | ${"./relative/path"}
        ${"http: のみ (スラッシュなし) を拒否できる"}    | ${"http:plain"}
      `(
        "$name",
        async ({ url }: { url: string; }) => {
          await webview.receive({ type: "openLink", url });
          expect(openExternalMock).not.toHaveBeenCalled();
        },
      );
    });

    test("複数回呼び出しでも許可リンクのみが openExternal に到達する", async () => {
      await webview.receive({ type: "openLink", url: "https://ok.example/" });
      await webview.receive({ type: "openLink", url: "javascript:alert(1)" });
      await webview.receive({ type: "openLink", url: "https://ok2.example/" });
      expect(openExternalMock).toHaveBeenCalledTimes(2);
      const urls = openExternalMock.mock.calls.map((c) => (c[0] as { fsPath: string; }).fsPath);
      expect(urls).toEqual(["https://ok.example/", "https://ok2.example/"]);
    });
  });
});
