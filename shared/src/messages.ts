import type { BlockId, Document } from "./blocks.js";
import type { EditorConfig } from "./config.js";

export type ExtensionToWebviewMessage =
  | { type: "init"; document: Document; config: EditorConfig; }
  // reason は webview 側の undo 履歴管理のためのヒント。
  // - "commit-echo": webview が送った commit に対する再パース echo。履歴は維持。
  // - "external": ファイルが外側から書き換えられた（他エディタ等）。履歴を破棄。
  | { type: "update"; document: Document; reason: "commit-echo" | "external"; }
  | { type: "configChanged"; config: EditorConfig; }
  | { type: "resolvedResource"; requestId: string; ref: string; uri: string | null; };

export type WebviewToExtensionMessage =
  | { type: "ready"; }
  | { type: "edit"; document: Document; }
  | { type: "commit"; document: Document; }
  | { type: "openLink"; url: string; }
  | { type: "resolveResource"; requestId: string; ref: string; };

export type { BlockId };
