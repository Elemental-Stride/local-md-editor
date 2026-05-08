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

  // 同一ドキュメントに対して resolveCustomTextEditor が重複呼び出しされた
  // 場合に古い session を確実に破棄するためのレジストリ。これを忘れると
  // onDidChangeTextDocument の listener が二重登録され、自前 edit の change
  // event が 2 回発火して 2 つ目が `external` として誤検出される。
  private readonly activeSessions = new Map<string, () => void>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const uriKey = document.uri.toString();
    this.activeSessions.get(uriKey)?.();
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

    // 自前 applyEdit による change event を抑制するため、これから書き込む
    // テキスト内容を multiset で保持しておく。version ベースだと
    // onDidReceiveMessage の async ハンドラが並行に走って version の予測が
    // 衝突するケースがあるため、テキスト内容で相関させる方式にしている。
    const pendingTexts = new Map<string, number>();
    const incPending = (text: string): void => {
      pendingTexts.set(text, (pendingTexts.get(text) ?? 0) + 1);
    };
    const consumePending = (text: string): boolean => {
      const count = pendingTexts.get(text);
      if (count === undefined) return false;
      if (count <= 1) pendingTexts.delete(text);
      else pendingTexts.set(text, count - 1);
      return true;
    };

    const sendInit = (): void => {
      post({ type: "init", document: markdownToDocument(document.getText()) });
    };

    // 同じ change event が複数 listener / 内部経路から二重発火されるケースを
    // 観測している。version + text の組がさっき処理したものと同じなら no-op。
    let lastSeenChange: { version: number; text: string; } | null = null;

    const docChange = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      const text = e.document.getText();
      const version = e.document.version;
      if (
        lastSeenChange !== null
        && lastSeenChange.version === version
        && lastSeenChange.text === text
      ) {
        return;
      }
      lastSeenChange = { version, text };
      if (consumePending(text)) return;
      post({
        type: "update",
        document: markdownToDocument(text),
        reason: "external",
      });
    });

    const persist = async (next: string): Promise<void> => {
      if (next === document.getText()) return;
      incPending(next);
      try {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
          document.uri,
          new vscode.Range(0, 0, document.lineCount, 0),
          next,
        );
        const ok = await vscode.workspace.applyEdit(edit);
        // 失敗時は change event が来ないので予約をキャンセル
        if (!ok) consumePending(next);
      } catch (e) {
        consumePending(next);
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

    const dispose = (): void => {
      docChange.dispose();
      msgSub.dispose();
      pendingTexts.clear();
    };
    this.activeSessions.set(uriKey, dispose);

    webviewPanel.onDidDispose(() => {
      dispose();
      // 自分が現在の session であれば登録解除（後勝ちの再 resolve では
      // 既に上書きされているケースがあるので一致確認してから消す）。
      if (this.activeSessions.get(uriKey) === dispose) {
        this.activeSessions.delete(uriKey);
      }
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
