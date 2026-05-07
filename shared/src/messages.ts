import type { BlockId, Document } from "./blocks.js";

export type ExtensionToWebviewMessage =
  | { type: "init"; document: Document; }
  | { type: "update"; document: Document; }
  | { type: "resolvedResource"; requestId: string; ref: string; uri: string | null; };

export type WebviewToExtensionMessage =
  | { type: "ready"; }
  | { type: "edit"; document: Document; }
  | { type: "commit"; document: Document; }
  | { type: "openLink"; url: string; }
  | { type: "resolveResource"; requestId: string; ref: string; };

export type { BlockId };
