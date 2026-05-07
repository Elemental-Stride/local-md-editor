import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from "@local-md-editor/shared";
import * as vscode from "vscode";
import { documentToMarkdown, markdownToDocument } from "./markdown.js";

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  private static readonly viewType = "localMdEditor.editor";

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new MarkdownEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(
      MarkdownEditorProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const webview = webviewPanel.webview;
    const docDir = vscode.Uri.joinPath(document.uri, "..");
    const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri;
    const roots = [
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview"),
      docDir,
    ];
    if (workspaceRoot) roots.push(workspaceRoot);
    webview.options = {
      enableScripts: true,
      localResourceRoots: roots,
    };
    webview.html = this.renderHtml(webview);

    const post = (msg: ExtensionToWebviewMessage): void => {
      void webview.postMessage(msg);
    };

    // 自前 applyEdit による change event を抑制するため、これから発生する
    // 版番号を事前に登録しておく。boolean フラグだと change event が
    // マイクロタスク / マクロタスクのどちらで届くかに依存して取りこぼすが、
    // version ベースなら順序とタイミングに左右されない。
    const pendingVersions = new Set<number>();

    const sendInit = (): void => {
      post({ type: "init", document: markdownToDocument(document.getText()) });
    };

    const docChange = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      if (pendingVersions.delete(e.document.version)) return;
      post({
        type: "update",
        document: markdownToDocument(document.getText()),
        reason: "external",
      });
    });

    const persist = async (next: string): Promise<void> => {
      if (next === document.getText()) return;
      // applyEdit が成功すると document.version は単調に +1 される。
      // 事前に予約しておけば change event 側で確実にマッチさせられる。
      const expectedVersion = document.version + 1;
      pendingVersions.add(expectedVersion);
      try {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
          document.uri,
          new vscode.Range(0, 0, document.lineCount, 0),
          next,
        );
        const ok = await vscode.workspace.applyEdit(edit);
        // 失敗時は change event が来ないので予約をクリアして leak を防ぐ。
        if (!ok) pendingVersions.delete(expectedVersion);
      } catch (e) {
        pendingVersions.delete(expectedVersion);
        throw e;
      }
    };

    const msgSub = webview.onDidReceiveMessage(async (raw: WebviewToExtensionMessage) => {
      switch (raw.type) {
        case "ready": {
          sendInit();
          return;
        }
        case "edit": {
          await persist(documentToMarkdown(raw.document));
          return;
        }
        case "commit": {
          // 永続化したうえでドキュメント全体を再パースする。リストの入れ子、
          // 見出しの昇格、そのほか文脈依存の markdown ルールが周囲の文脈を
          // 正しく見られるようにするため（単一ブロックを単独パースさせない）。
          const next = documentToMarkdown(raw.document);
          await persist(next);
          post({
            type: "update",
            document: markdownToDocument(next),
            reason: "commit-echo",
          });
          return;
        }
        case "openLink": {
          await vscode.env.openExternal(vscode.Uri.parse(raw.url));
          return;
        }
        case "resolveResource": {
          // 相対 ref をドキュメントディレクトリ基準で解決し、webview から
          // 安全に読める URI 文字列を返す。許可されたリソースルートの外に
          // 出るものは拒否する。webview 側は uri が null のとき alt
          // テキストにフォールバックする。
          const uri = resolveRelative(docDir, raw.ref);
          const safe = uri && isInside(uri, roots) ? webview.asWebviewUri(uri).toString() : null;
          post({ type: "resolvedResource", requestId: raw.requestId, ref: raw.ref, uri: safe });
          return;
        }
      }
    });

    webviewPanel.onDidDispose(() => {
      docChange.dispose();
      msgSub.dispose();
    });
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = makeNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview", "main.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview", "styles.css"),
    );
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Local MD Editor</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

const makeNonce = (): string => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};

// `ref`（相対パスまたは既に絶対化された URI 文字列）をドキュメント
// ディレクトリ基準で解決する。webview 経由で読み込みたくないもの
// （data URL、http(s)、ワークスペース外の絶対パスなど）には null を返す。
const resolveRelative = (docDir: vscode.Uri, ref: string): vscode.Uri | null => {
  if (ref === "" || ref.startsWith("data:") || /^[a-z]+:\/\//i.test(ref)) return null;
  try {
    return vscode.Uri.joinPath(docDir, ref);
  } catch {
    return null;
  }
};

const isInside = (target: vscode.Uri, roots: vscode.Uri[]): boolean => {
  const t = target.fsPath;
  return roots.some((r) => {
    const rp = r.fsPath;
    return t === rp || t.startsWith(rp + (rp.endsWith("/") ? "" : "/"));
  });
};
