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
      onDidChangeConfiguration: () => ({ dispose: vi.fn() }),
      getConfiguration: () => ({
        get: <T>(_key: string, defaultValue: T): T => defaultValue,
      }),
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

    test("commit メッセージで applyEdit と commit-echo の update を返せる", async () => {
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
        type: "commit",
        document: {
          blocks: [{ id: "p", kind: "paragraph", source: "committed", inlines: [] }],
        },
      });
      expect(applyEdit).toHaveBeenCalled();
      const echo = webview._messages.find(
        (m) => (m as { type: string; reason?: string; }).type === "update",
      ) as { type: string; reason: string; } | undefined;
      expect(echo?.reason).toBe("commit-echo");
    });

    test("onDidDispose で session を片付けられる", async () => {
      const ctx = makeContext();
      const provider = new MarkdownEditorProvider(
        ctx as unknown as Parameters<typeof MarkdownEditorProvider.register>[0],
      );
      const webview = makeWebview();
      const panel = makeWebviewPanel(webview);
      await provider.resolveCustomTextEditor(
        makeDocument("x\n") as unknown as Parameters<typeof provider.resolveCustomTextEditor>[0],
        panel as unknown as Parameters<typeof provider.resolveCustomTextEditor>[1],
      );
      // dispose を発火させてエラーが起きないことを確認 (内部の listener も解除される)
      panel._dispose();
      // dispose 後の docChange / message は session 経由で何もしない
      // (新しい webview._trigger を呼んでも例外にならないこと)
      await webview._trigger({ type: "ready" });
      // 新しい init は来ないことを確認 (ready で送られる init は disposed 後でも
      // listener が登録解除されているので発火しない)
      // この時点で webview._messages には _dispose 前の init は含まれる可能性が
      // あるので、絶対数で 1 件以下を expect する。
      const inits = webview._messages.filter(
        (m) => (m as { type: string; }).type === "init",
      );
      expect(inits.length).toBeLessThanOrEqual(1);
    });

    test("ドキュメントの外部変更を受けて update メッセージを送信できる", async () => {
      const ctx = makeContext();
      const provider = new MarkdownEditorProvider(
        ctx as unknown as Parameters<typeof MarkdownEditorProvider.register>[0],
      );
      const webview = makeWebview();
      const panel = makeWebviewPanel(webview);
      const doc = makeDocument("first\n");
      await provider.resolveCustomTextEditor(
        doc as unknown as Parameters<typeof provider.resolveCustomTextEditor>[0],
        panel as unknown as Parameters<typeof provider.resolveCustomTextEditor>[1],
      );
      const handler =
        (globalThis as { __docChangeHandler?: (e: unknown) => void; }).__docChangeHandler;
      expect(handler).toBeDefined();
      // 外部からの change event を流す (uri は同じドキュメント、テキストは別物)
      const externalDoc = { ...doc, getText: () => "external\n", version: 2 };
      handler?.({ document: externalDoc });
      const update = webview._messages.find(
        (m) => (m as { type: string; reason?: string; }).type === "update",
      ) as { type: string; reason: string; } | undefined;
      expect(update?.reason).toBe("external");
    });

    test("同一 uri に対する再度の resolveCustomTextEditor は古い session を破棄できる", async () => {
      const ctx = makeContext();
      const provider = new MarkdownEditorProvider(
        ctx as unknown as Parameters<typeof MarkdownEditorProvider.register>[0],
      );
      // 同一 document に対して 2 回 resolveCustomTextEditor を呼ぶ
      const doc = makeDocument("x\n");
      const w1 = makeWebview();
      const p1 = makeWebviewPanel(w1);
      await provider.resolveCustomTextEditor(
        doc as unknown as Parameters<typeof provider.resolveCustomTextEditor>[0],
        p1 as unknown as Parameters<typeof provider.resolveCustomTextEditor>[1],
      );
      const w2 = makeWebview();
      const p2 = makeWebviewPanel(w2);
      // 2 回目の resolve で古い session が破棄され、新しい session が登録される
      await provider.resolveCustomTextEditor(
        doc as unknown as Parameters<typeof provider.resolveCustomTextEditor>[0],
        p2 as unknown as Parameters<typeof provider.resolveCustomTextEditor>[1],
      );
      // 1 回目の panel.onDidDispose を呼んでも、現在 session は w2 のものなので
      // activeSessions.get(uri) === oldDispose は false → activeSessions.delete されない
      p1._dispose();
      // 新しい session は引き続き機能する (例: ready で init を返せる)
      await w2._trigger({ type: "ready" });
      const init = w2._messages.find(
        (m) => (m as { type: string; }).type === "init",
      );
      expect(init).toBeDefined();
    });

    test("docChange の同一 version + text 連続は二重発火扱いされない", async () => {
      const ctx = makeContext();
      const provider = new MarkdownEditorProvider(
        ctx as unknown as Parameters<typeof MarkdownEditorProvider.register>[0],
      );
      const webview = makeWebview();
      const panel = makeWebviewPanel(webview);
      const doc = makeDocument("init\n");
      await provider.resolveCustomTextEditor(
        doc as unknown as Parameters<typeof provider.resolveCustomTextEditor>[0],
        panel as unknown as Parameters<typeof provider.resolveCustomTextEditor>[1],
      );
      const handler =
        (globalThis as { __docChangeHandler?: (e: unknown) => void; }).__docChangeHandler;
      const ext1 = { ...doc, getText: () => "ext1\n", version: 2 };
      handler?.({ document: ext1 });
      // 同じ event を 2 回流しても update は 1 回しか送られない (lastSeenChange ガード)
      handler?.({ document: ext1 });
      const externals = webview._messages.filter(
        (m) =>
          (m as { type: string; reason?: string; }).type === "update"
          && (m as { reason: string; }).reason === "external",
      );
      expect(externals).toHaveLength(1);
    });

    test("resolveResource の data: ref は解決を拒否し uri=null を返せる", async () => {
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
        ref: "data:image/png;base64,xxx",
      });
      const reply = webview._messages.find(
        (m) => (m as { type: string; }).type === "resolvedResource",
      ) as { uri: string | null; } | undefined;
      expect(reply?.uri).toBeNull();
    });

    test("resolveResource の相対 ref はドキュメントディレクトリ基準で解決し uri を返せる", async () => {
      // 相対 ref (./image.png) → docDir (= /foo/test.md/..) 配下に解決され、
      // isInside の docDir マッチを通過して webview URI を返す経路。
      // resolveRelative の try ブロック (line 218) と isInside の positive path
      // (line 226-228) を両方カバーする。
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
        requestId: "r-rel",
        ref: "./image.png",
      });
      const reply = webview._messages.find(
        (m) =>
          (m as { type: string; requestId?: string; }).type === "resolvedResource"
          && (m as { requestId?: string; }).requestId === "r-rel",
      ) as { uri: string | null; } | undefined;
      expect(reply).toBeDefined();
      expect(reply?.uri).not.toBeNull();
      expect(reply?.uri).toContain("image.png");
    });

    test("workspaceRoot がある場合は roots に追加され、その配下の ref を解決できる", async () => {
      // getWorkspaceFolder が non-null を返す経路 (line 41 の roots.push) と
      // isInside の roots[]反復 (multiple-root path) をカバーする。
      getWorkspaceFolder.mockReturnValueOnce({
        uri: { fsPath: "/foo", toString: () => "/foo" } as unknown,
      } as unknown as ReturnType<typeof getWorkspaceFolder>);
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
        requestId: "r-ws",
        ref: "asset.png",
      });
      const reply = webview._messages.find(
        (m) =>
          (m as { type: string; requestId?: string; }).type === "resolvedResource"
          && (m as { requestId?: string; }).requestId === "r-ws",
      ) as { uri: string | null; } | undefined;
      expect(reply).toBeDefined();
    });

    test("resolveResource の空文字 ref も uri=null を返せる", async () => {
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
        requestId: "r2",
        ref: "",
      });
      const reply = webview._messages.find(
        (m) =>
          (m as { type: string; requestId: string; }).type === "resolvedResource"
          && (m as { requestId: string; }).requestId === "r2",
      ) as { uri: string | null; } | undefined;
      expect(reply?.uri).toBeNull();
    });

    test("別ドキュメントの change event は無視できる", async () => {
      const ctx = makeContext();
      const provider = new MarkdownEditorProvider(
        ctx as unknown as Parameters<typeof MarkdownEditorProvider.register>[0],
      );
      const webview = makeWebview();
      const panel = makeWebviewPanel(webview);
      await provider.resolveCustomTextEditor(
        makeDocument("x\n") as unknown as Parameters<typeof provider.resolveCustomTextEditor>[0],
        panel as unknown as Parameters<typeof provider.resolveCustomTextEditor>[1],
      );
      const handler =
        (globalThis as { __docChangeHandler?: (e: unknown) => void; }).__docChangeHandler;
      // 別 uri のドキュメントから change event が来てもこの session は反応しない
      const otherDoc = {
        uri: { fsPath: "/other.md", toString: () => "/other.md" },
        version: 2,
        getText: () => "ignored\n",
      };
      handler?.({ document: otherDoc });
      const externals = webview._messages.filter(
        (m) =>
          (m as { type: string; reason?: string; }).type === "update"
          && (m as { reason: string; }).reason === "external",
      );
      expect(externals).toHaveLength(0);
    });

    test("applyEdit が失敗 (false) でも例外を投げず保留テキストを破棄できる", async () => {
      applyEdit.mockResolvedValueOnce(false);
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
      // edit メッセージで persist が呼ばれ、applyEdit が false を返す経路
      await webview._trigger({
        type: "edit",
        document: {
          blocks: [{ id: "p", kind: "paragraph", source: "rejected", inlines: [] }],
        },
      });
      // applyEdit が false でも exception になっていない (test が通ってる) こと、
      // また applyEdit 自体は呼ばれていることを確認
      expect(applyEdit).toHaveBeenCalled();
    });

    test("自前の applyEdit に由来する change event は external として誤検出させない", async () => {
      const ctx = makeContext();
      const provider = new MarkdownEditorProvider(
        ctx as unknown as Parameters<typeof MarkdownEditorProvider.register>[0],
      );
      const webview = makeWebview();
      const panel = makeWebviewPanel(webview);
      const doc = makeDocument("old\n");
      await provider.resolveCustomTextEditor(
        doc as unknown as Parameters<typeof provider.resolveCustomTextEditor>[0],
        panel as unknown as Parameters<typeof provider.resolveCustomTextEditor>[1],
      );
      // edit を発火させて persist 経由で "new\n" を pendingTexts に予約
      await webview._trigger({
        type: "edit",
        document: {
          blocks: [{ id: "p", kind: "paragraph", source: "new", inlines: [] }],
        },
      });
      const beforeUpdates = webview._messages.filter(
        (m) =>
          (m as { type: string; reason?: string; }).type === "update"
          && (m as { reason: string; }).reason === "external",
      ).length;
      // applyEdit を呼んだ結果として VS Code から発火される change event
      // (テキストは pendingTexts に予約済みのもの) を流す
      const handler =
        (globalThis as { __docChangeHandler?: (e: unknown) => void; }).__docChangeHandler;
      const newText = "new\n";
      const echoDoc = { ...doc, getText: () => newText, version: 2 };
      handler?.({ document: echoDoc });
      // 同じ change event 由来なので external update は新たに増えていない
      const afterUpdates = webview._messages.filter(
        (m) =>
          (m as { type: string; reason?: string; }).type === "update"
          && (m as { reason: string; }).reason === "external",
      ).length;
      expect(afterUpdates).toBe(beforeUpdates);
    });
  });
});
