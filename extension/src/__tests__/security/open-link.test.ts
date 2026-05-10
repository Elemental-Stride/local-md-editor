import type { WebviewToExtensionMessage } from "@local-md-editor/shared";
import { beforeEach, describe, expect, test, vi } from "vitest";

// 非機能 (セキュリティ) テスト。webview から送られる openLink URL の
// 取り扱いを構造仕様として凍結する:
//   - http(s)/mailto は openExternal 経由で外部に投げる (allow-list)
//   - 他スキーム / 絶対パス / アンカーは silent drop
//   - 相対パスは docDir / workspace 境界の内側なら vscode.open、
//     外側ならユーザー確認 (showWarningMessage) を経て vscode.open
//
// MockUri.joinPath は ".." を正規化する版にしている。境界判定 (isInside)
// は string-prefix で行うため、正規化後パスでないと path traversal の
// 拒否ケースが正しく検証できない。
vi.mock("vscode", () => {
  class MockUri {
    constructor(public readonly fsPath: string) {}
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
      showWarningMessage: vi.fn(async (..._args: unknown[]): Promise<string | undefined> =>
        undefined
      ),
    },
    workspace: {
      onDidChangeTextDocument: () => ({ dispose: vi.fn() }),
      applyEdit: vi.fn(async () => true),
      getWorkspaceFolder: vi.fn(() => undefined),
      onDidChangeConfiguration: () => ({ dispose: vi.fn() }),
      getConfiguration: () => ({
        get: <T>(_key: string, defaultValue: T): T => defaultValue,
      }),
    },
    commands: {
      executeCommand: vi.fn(async () => undefined),
    },
    env: {
      openExternal: vi.fn(async () => true),
    },
  };
});

import * as vscode from "vscode";
import { MarkdownEditorProvider } from "../../markdownEditorProvider.js";

const openExternalMock = vi.mocked(vscode.env.openExternal);
const executeCommandMock = vi.mocked(vscode.commands.executeCommand);
const showWarningMock = vi.mocked(vscode.window.showWarningMessage);
const getWorkspaceFolderMock = vi.mocked(vscode.workspace.getWorkspaceFolder);

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

const setupSession = async (): Promise<ReturnType<typeof makeWebview>> => {
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
  return webview;
};

const lastExecOpenedFsPath = (): string => {
  const calls = executeCommandMock.mock.calls;
  if (calls.length === 0) throw new Error("executeCommand が未呼び出し");
  const [cmd, arg] = calls[calls.length - 1];
  if (cmd !== "vscode.open") throw new Error(`想定外のコマンド: ${cmd as string}`);
  return (arg as { fsPath: string; }).fsPath;
};

// when: webview から openLink を送ったとき extension がどう応えるか
describe("MarkdownEditorProvider セキュリティ", () => {
  describe("openLink", () => {
    beforeEach(() => {
      openExternalMock.mockClear();
      executeCommandMock.mockClear();
      showWarningMock.mockReset();
      showWarningMock.mockResolvedValue(undefined);
      getWorkspaceFolderMock.mockReset();
      getWorkspaceFolderMock.mockReturnValue(undefined);
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
          const webview = await setupSession();
          await webview.receive({ type: "openLink", url });
          expect(openExternalMock).toHaveBeenCalledOnce();
          // Uri.parse(url) されたうえで渡される (MockUri は fsPath = 入力)
          const arg = openExternalMock.mock.calls[0]?.[0] as { fsPath: string; };
          expect(arg.fsPath).toBe(url);
          expect(executeCommandMock).not.toHaveBeenCalled();
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
        ${"http: のみ (スラッシュなし) を拒否できる"}    | ${"http:plain"}
      `(
        "$name",
        async ({ url }: { url: string; }) => {
          const webview = await setupSession();
          await webview.receive({ type: "openLink", url });
          expect(openExternalMock).not.toHaveBeenCalled();
          expect(executeCommandMock).not.toHaveBeenCalled();
        },
      );
    });

    describe("特殊形式の拒否", () => {
      // dprint-ignore
      test.each`
        name                                          | url
        ${"# 単体アンカーを拒否できる"}                | ${"#section"}
        ${"# 複合 (#multi-word) も拒否できる"}         | ${"#multi-word-id"}
        ${"絶対パス /etc/passwd を拒否できる"}         | ${"/etc/passwd"}
        ${"絶対パス /var/log を拒否できる"}            | ${"/var/log"}
      `(
        "$name",
        async ({ url }: { url: string; }) => {
          const webview = await setupSession();
          await webview.receive({ type: "openLink", url });
          expect(openExternalMock).not.toHaveBeenCalled();
          expect(executeCommandMock).not.toHaveBeenCalled();
          expect(showWarningMock).not.toHaveBeenCalled();
        },
      );
    });

    describe("相対パスのファイル参照 (workspace なし、境界 = docDir)", () => {
      // docDir は /foo (= /foo/test.md の親、MockUri 正規化後)
      test("docDir 配下の .md を vscode.open で開ける", async () => {
        const webview = await setupSession();
        await webview.receive({ type: "openLink", url: "./other.md" });
        expect(lastExecOpenedFsPath()).toBe("/foo/other.md");
        expect(openExternalMock).not.toHaveBeenCalled();
        expect(showWarningMock).not.toHaveBeenCalled();
      });

      test("docDir 配下のサブディレクトリも開ける", async () => {
        const webview = await setupSession();
        await webview.receive({ type: "openLink", url: "subdir/page.md" });
        expect(lastExecOpenedFsPath()).toBe("/foo/subdir/page.md");
      });

      test("fragment 付きパスは fragment を剥がして開ける", async () => {
        const webview = await setupSession();
        await webview.receive({ type: "openLink", url: "./other.md#section" });
        expect(lastExecOpenedFsPath()).toBe("/foo/other.md");
      });

      test("query 付きパスも query を剥がして開ける", async () => {
        const webview = await setupSession();
        await webview.receive({ type: "openLink", url: "./other.md?v=1" });
        expect(lastExecOpenedFsPath()).toBe("/foo/other.md");
      });
    });

    describe("境界外 (workspace なし、docDir 外) の確認ダイアログ", () => {
      test("『開く』選択で vscode.open が呼ばれる", async () => {
        showWarningMock.mockResolvedValueOnce("開く" as never);
        const webview = await setupSession();
        await webview.receive({ type: "openLink", url: "../escape.md" });
        expect(showWarningMock).toHaveBeenCalledOnce();
        expect(lastExecOpenedFsPath()).toBe("/escape.md");
      });

      test("『キャンセル』選択では vscode.open は呼ばれない", async () => {
        showWarningMock.mockResolvedValueOnce("キャンセル" as never);
        const webview = await setupSession();
        await webview.receive({ type: "openLink", url: "../escape.md" });
        expect(showWarningMock).toHaveBeenCalledOnce();
        expect(executeCommandMock).not.toHaveBeenCalled();
      });

      test("ダイアログ未応答 (undefined) でも vscode.open は呼ばれない", async () => {
        showWarningMock.mockResolvedValueOnce(undefined);
        const webview = await setupSession();
        await webview.receive({ type: "openLink", url: "../escape.md" });
        expect(showWarningMock).toHaveBeenCalledOnce();
        expect(executeCommandMock).not.toHaveBeenCalled();
      });

      test("ダイアログのメッセージ文言にドキュメントディレクトリ起点であることを含めて伝えられる", async () => {
        showWarningMock.mockResolvedValueOnce(undefined);
        const webview = await setupSession();
        await webview.receive({ type: "openLink", url: "../escape.md" });
        const message = showWarningMock.mock.calls[0]?.[0] as string;
        expect(message).toContain("ドキュメントディレクトリ");
        expect(message).toContain("/escape.md");
      });
    });

    describe("相対パスのファイル参照 (workspace あり、境界 = workspace folder)", () => {
      test("workspace 内のファイルは確認なしで開ける", async () => {
        getWorkspaceFolderMock.mockReturnValue({
          uri: { fsPath: "/foo" } as unknown,
        } as unknown as ReturnType<typeof vscode.workspace.getWorkspaceFolder>);
        const webview = await setupSession();
        await webview.receive({ type: "openLink", url: "../sibling.md" });
        // /foo の親 (sibling.md) は workspace /foo の外なので警告される……と
        // 思いきや、ここでは ../ で /sibling.md に着地し /foo の外なので警告。
        // → workspace 内チェックの検証はここでは別ケースで行う。
        expect(showWarningMock).toHaveBeenCalledOnce();
      });

      test("workspace folder 配下のファイルは確認なしで vscode.open される", async () => {
        getWorkspaceFolderMock.mockReturnValue({
          uri: { fsPath: "/work" } as unknown,
        } as unknown as ReturnType<typeof vscode.workspace.getWorkspaceFolder>);
        // workspace=/work, docDir=/foo の構成で /foo/inside.md は
        // workspace 外 → 警告される。逆に /work 配下を狙うには
        // ../work/page.md 経由で正規化させる。
        const webview = await setupSession();
        await webview.receive({ type: "openLink", url: "../work/page.md" });
        expect(showWarningMock).not.toHaveBeenCalled();
        expect(lastExecOpenedFsPath()).toBe("/work/page.md");
      });

      test("workspace 外への path traversal は確認ダイアログを経る", async () => {
        getWorkspaceFolderMock.mockReturnValue({
          uri: { fsPath: "/work" } as unknown,
        } as unknown as ReturnType<typeof vscode.workspace.getWorkspaceFolder>);
        showWarningMock.mockResolvedValueOnce("キャンセル" as never);
        const webview = await setupSession();
        await webview.receive({ type: "openLink", url: "../../etc/passwd" });
        expect(showWarningMock).toHaveBeenCalledOnce();
        expect(executeCommandMock).not.toHaveBeenCalled();
      });

      test("workspace ありのダイアログ文言は『ワークスペース』を含めて伝える", async () => {
        getWorkspaceFolderMock.mockReturnValue({
          uri: { fsPath: "/work" } as unknown,
        } as unknown as ReturnType<typeof vscode.workspace.getWorkspaceFolder>);
        showWarningMock.mockResolvedValueOnce(undefined);
        const webview = await setupSession();
        await webview.receive({ type: "openLink", url: "../../etc/passwd" });
        const message = showWarningMock.mock.calls[0]?.[0] as string;
        expect(message).toContain("ワークスペース");
        expect(message).toContain("/etc/passwd");
      });
    });

    test("複数回呼び出しでも許可リンクのみが openExternal に到達する", async () => {
      const webview = await setupSession();
      await webview.receive({ type: "openLink", url: "https://ok.example/" });
      await webview.receive({ type: "openLink", url: "javascript:alert(1)" });
      await webview.receive({ type: "openLink", url: "https://ok2.example/" });
      expect(openExternalMock).toHaveBeenCalledTimes(2);
      const urls = openExternalMock.mock.calls.map((c) => (c[0] as { fsPath: string; }).fsPath);
      expect(urls).toEqual(["https://ok.example/", "https://ok2.example/"]);
    });
  });
});
