import { beforeEach, describe, expect, test, vi } from "vitest";

// vscode は extension host が提供する組み込みモジュールなのでテストでは
// 実装を差し替えてしまう。registerCustomEditorProvider と applyEdit、
// onDidChangeTextDocument を観測し、resolveCustomTextEditor の挙動を
// 高レベルで検証する。
//
// vi.mock ファクトリは hoist されるため、top-level の変数を直接参照できない。
// vi.hoisted で先回りに評価される変数として定義する。
const mocks = vi.hoisted(() => ({
  registerCustomEditorProvider: vi.fn(() => ({ dispose: vi.fn() } as unknown)),
  applyEdit: vi.fn(async () => true),
  openExternal: vi.fn(async () => true),
  getWorkspaceFolder: vi.fn(() => null),
}));
const { registerCustomEditorProvider, applyEdit, openExternal, getWorkspaceFolder } = mocks;

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
    private edits: { uri: MockUri; range: MockRange; text: string; }[] = [];
    replace(uri: MockUri, range: MockRange, text: string): void {
      this.edits.push({ uri, range, text });
    }
    get _edits() {
      return this.edits;
    }
  }
  return {
    Uri: MockUri,
    Range: MockRange,
    WorkspaceEdit: MockWorkspaceEdit,
    window: {
      registerCustomEditorProvider: mocks.registerCustomEditorProvider,
    },
    workspace: {
      onDidChangeTextDocument: (h: (e: unknown) => void) => {
        // ハンドラはモジュール外側へエクスポートして observe する
        (globalThis as { __docChangeHandler?: typeof h; }).__docChangeHandler = h;
        return { dispose: vi.fn() };
      },
      applyEdit: mocks.applyEdit,
      getWorkspaceFolder: mocks.getWorkspaceFolder,
    },
    env: {
      openExternal: mocks.openExternal,
    },
  };
});

import { MarkdownEditorProvider } from "../markdownEditorProvider.js";

beforeEach(() => {
  registerCustomEditorProvider.mockClear();
  applyEdit.mockClear();
  openExternal.mockClear();
  getWorkspaceFolder.mockClear();
});

const makeContext = () => ({
  extensionUri: { fsPath: "/ext", toString: () => "/ext" } as unknown,
  subscriptions: [] as unknown[],
});

const makeWebview = () => {
  let html = "";
  const messages: unknown[] = [];
  let messageHandler: ((msg: unknown) => void | Promise<void>) | null = null;
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
    postMessage: (msg: unknown) => {
      messages.push(msg);
      return Promise.resolve(true);
    },
    onDidReceiveMessage: (h: (msg: unknown) => void | Promise<void>) => {
      messageHandler = h;
      return { dispose: vi.fn() };
    },
    _messages: messages,
    _trigger: async (msg: unknown) => {
      if (messageHandler) await messageHandler(msg);
    },
  };
};

const makeDocument = (text: string) => ({
  uri: { fsPath: "/foo/test.md", toString: () => "/foo/test.md" },
  lineCount: text.split("\n").length,
  version: 1,
  getText: () => text,
});

const makeWebviewPanel = (webview: ReturnType<typeof makeWebview>) => {
  let onDispose: (() => void) | null = null;
  return {
    webview,
    onDidDispose: (h: () => void) => {
      onDispose = h;
      return { dispose: vi.fn() };
    },
    _dispose: () => onDispose?.(),
  };
};

// when: MarkdownEditorProvider のメソッドを呼び出す
describe("MarkdownEditorProvider", () => {
  describe("register", () => {
    test("vscode.window.registerCustomEditorProvider に viewType と provider を渡せる", () => {
      const ctx = makeContext();
      MarkdownEditorProvider.register(
        ctx as unknown as Parameters<typeof MarkdownEditorProvider.register>[0],
      );
      expect(registerCustomEditorProvider).toHaveBeenCalled();
      const args = registerCustomEditorProvider.mock.calls[0] as unknown as [
        string,
        unknown,
        Record<string, unknown>,
      ];
      expect(args[0]).toBe("localMdEditor.editor");
      expect(args[1]).toBeInstanceOf(MarkdownEditorProvider);
      expect(args[2]).toMatchObject({
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      });
    });
  });

  describe("resolveCustomTextEditor", () => {
    test("webview.html に CSP と script タグを含む HTML を設定できる", async () => {
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
      expect(webview.html).toContain("Content-Security-Policy");
      expect(webview.html).toContain("<script");
      expect(webview.html).toContain("dist/webview/main.js");
    });

    test("ready メッセージ受信で init を postMessage できる", async () => {
      const ctx = makeContext();
      const provider = new MarkdownEditorProvider(
        ctx as unknown as Parameters<typeof MarkdownEditorProvider.register>[0],
      );
      const webview = makeWebview();
      const panel = makeWebviewPanel(webview);
      await provider.resolveCustomTextEditor(
        makeDocument("# h\n\nbody\n") as unknown as Parameters<
          typeof provider.resolveCustomTextEditor
        >[0],
        panel as unknown as Parameters<typeof provider.resolveCustomTextEditor>[1],
      );
      await webview._trigger({ type: "ready" });
      const initMsg = webview._messages.find(
        (m) => (m as { type: string; }).type === "init",
      );
      expect(initMsg).toBeDefined();
    });

    test("openLink メッセージで env.openExternal を呼べる", async () => {
      const ctx = makeContext();
      const provider = new MarkdownEditorProvider(
        ctx as unknown as Parameters<typeof MarkdownEditorProvider.register>[0],
      );
      const webview = makeWebview();
      const panel = makeWebviewPanel(webview);
      await provider.resolveCustomTextEditor(
        makeDocument("") as unknown as Parameters<typeof provider.resolveCustomTextEditor>[0],
        panel as unknown as Parameters<typeof provider.resolveCustomTextEditor>[1],
      );
      await webview._trigger({ type: "openLink", url: "https://e.x" });
      expect(openExternal).toHaveBeenCalled();
    });

    test("resolveResource メッセージで uri を解決し postMessage で返せる", async () => {
      const ctx = makeContext();
      const provider = new MarkdownEditorProvider(
        ctx as unknown as Parameters<typeof MarkdownEditorProvider.register>[0],
      );
      const webview = makeWebview();
      const panel = makeWebviewPanel(webview);
      await provider.resolveCustomTextEditor(
        makeDocument("") as unknown as Parameters<typeof provider.resolveCustomTextEditor>[0],
        panel as unknown as Parameters<typeof provider.resolveCustomTextEditor>[1],
      );
      await webview._trigger({
        type: "resolveResource",
        requestId: "r1",
        ref: "https://blocked.example/x.png",
      });
      const reply = webview._messages.find(
        (m) => (m as { type: string; }).type === "resolvedResource",
      ) as { type: string; uri: string | null; } | undefined;
      expect(reply).toBeDefined();
      // http(s) ref は許可ルートの外なので uri=null
      expect(reply?.uri).toBeNull();
    });

    test("edit メッセージで applyEdit を呼べる (ドキュメントテキスト書き換え)", async () => {
      const ctx = makeContext();
      const provider = new MarkdownEditorProvider(
        ctx as unknown as Parameters<typeof MarkdownEditorProvider.register>[0],
      );
      const webview = makeWebview();
      const panel = makeWebviewPanel(webview);
      await provider.resolveCustomTextEditor(
        makeDocument("old\n") as unknown as Parameters<typeof provider.resolveCustomTextEditor>[0],
        panel as unknown as Parameters<typeof provider.resolveCustomTextEditor>[1],
      );
      await webview._trigger({
        type: "edit",
        document: {
          blocks: [{ id: "p", kind: "paragraph", source: "new", inlines: [] }],
        },
      });
      expect(applyEdit).toHaveBeenCalled();
    });
  });
});
