import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from "@local-md-editor/shared";

const api = acquireVsCodeApi<unknown>();

export const post = (msg: WebviewToExtensionMessage): void => {
  api.postMessage(msg);
};

export const onMessage = (
  handler: (msg: ExtensionToWebviewMessage) => void,
): () => void => {
  const listener = (event: MessageEvent): void => {
    handler(event.data as ExtensionToWebviewMessage);
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
};
