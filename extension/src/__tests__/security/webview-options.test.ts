import { beforeEach, describe, expect, test, vi } from "vitest";

// 非機能 (セキュリティ) テスト。webview に渡される WebviewOptions の表面が
// 「scripts のみ有効、許可ルートは extension dist + docDir (+ workspace) のみ」
// である状態を構造仕様として凍結する。enableCommandUris や portMapping のような
// 追加プロパティがうっかり混入したら落ちるよう、設定キー集合自体も検査する。
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
      // テストごとに mockReturnValue で workspace 有無を切り替える。
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

import * as vscode from "vscode";
import { MarkdownEditorProvider } from "../../markdownEditorProvider.js";

const getWorkspaceFolderMock = vi.mocked(vscode.workspace.getWorkspaceFolder);

const makeContext = () => ({
  extensionUri: { fsPath: "/ext", toString: () => "/ext" } as unknown,
  subscriptions: [] as unknown[],
});

// localResourceRoots の中身は Uri 配列なので、fsPath 比較できれば十分。
type CapturedOptions = {
  enableScripts?: boolean;
  localResourceRoots?: { fsPath: string; }[];
  [k: string]: unknown;
};

const makeWebview = () => {
  let html = "";
  let options: CapturedOptions | null = null;
  return {
    cspSource: "vscode-webview://test",
    set options(v: CapturedOptions) {
      options = v;
    },
    get options(): CapturedOptions {
      // 実 webview の getter には現状アクセスしないが、型を満たすため返す。
      return options ?? {};
    },
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
    captured: (): CapturedOptions => {
      if (options === null) throw new Error("webview.options が一度も設定されていない");
      return options;
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

const setupProvider = async (
  webview: ReturnType<typeof makeWebview>,
): Promise<void> => {
  const ctx = makeContext();
  const provider = new MarkdownEditorProvider(
    ctx as unknown as Parameters<typeof MarkdownEditorProvider.register>[0],
  );
  const panel = makeWebviewPanel(webview);
  await provider.resolveCustomTextEditor(
    makeDocument("# title") as unknown as Parameters<
      typeof provider.resolveCustomTextEditor
    >[0],
    panel as unknown as Parameters<typeof provider.resolveCustomTextEditor>[1],
  );
};

// when: resolveCustomTextEditor が webview.options を設定する
describe("MarkdownEditorProvider セキュリティ", () => {
  describe("WebviewOptions 最小化", () => {
    beforeEach(() => {
      // workspace folder は各 describe で個別に挙動を指定する。
      getWorkspaceFolderMock.mockReset();
      getWorkspaceFolderMock.mockReturnValue(
        null as unknown as ReturnType<
          typeof vscode.workspace.getWorkspaceFolder
        >,
      );
    });

    describe("必須プロパティ", () => {
      let opts: CapturedOptions;
      beforeEach(async () => {
        const webview = makeWebview();
        await setupProvider(webview);
        opts = webview.captured();
      });

      test("enableScripts を true で固定できる", () => {
        expect(opts.enableScripts).toBe(true);
      });

      test("localResourceRoots を配列で渡せる", () => {
        expect(Array.isArray(opts.localResourceRoots)).toBe(true);
      });
    });

    describe("localResourceRoots の境界", () => {
      test("workspace 外のファイルでは extension dist と docDir のみを許可する", async () => {
        getWorkspaceFolderMock.mockReturnValue(
          null as unknown as ReturnType<
            typeof vscode.workspace.getWorkspaceFolder
          >,
        );
        const webview = makeWebview();
        await setupProvider(webview);
        const roots = webview.captured().localResourceRoots ?? [];
        expect(roots.map((r) => r.fsPath)).toEqual([
          "/ext/dist/webview",
          "/foo/test.md/..",
        ]);
      });

      test("workspace 内のファイルでは workspace root も末尾に追加する", async () => {
        getWorkspaceFolderMock.mockReturnValue({
          uri: { fsPath: "/work" },
        } as unknown as ReturnType<typeof vscode.workspace.getWorkspaceFolder>);
        const webview = makeWebview();
        await setupProvider(webview);
        const roots = webview.captured().localResourceRoots ?? [];
        expect(roots.map((r) => r.fsPath)).toEqual([
          "/ext/dist/webview",
          "/foo/test.md/..",
          "/work",
        ]);
      });
    });

    describe("危険オプションの非設定", () => {
      // WebviewOptions に追加できる他フィールド (enableCommandUris /
      // enableForms / portMapping) が将来うっかり付与されたら気付くよう、
      // 設定済みキー集合そのものを sentinel として固定する。
      let opts: CapturedOptions;
      beforeEach(async () => {
        const webview = makeWebview();
        await setupProvider(webview);
        opts = webview.captured();
      });

      test("設定キーは enableScripts と localResourceRoots のみに限定できる", () => {
        expect(Object.keys(opts).sort()).toEqual([
          "enableScripts",
          "localResourceRoots",
        ]);
      });

      // dprint-ignore
      test.each`
        name                                              | key
        ${"enableCommandUris を未設定にできる"}            | ${"enableCommandUris"}
        ${"enableForms を未設定にできる"}                  | ${"enableForms"}
        ${"portMapping を未設定にできる"}                  | ${"portMapping"}
      `(
        "$name",
        ({ key }: { key: string; }) => {
          expect(key in opts).toBe(false);
        },
      );
    });
  });
});
