import { DEFAULT_EDITOR_CONFIG, type EditorConfig } from "@local-md-editor/shared";
import * as vscode from "vscode";

const SECTION = "localMdEditor";

export function readEditorConfig(): EditorConfig {
  const conf = vscode.workspace.getConfiguration(SECTION);
  return {
    compatibility: {
      hideHtmlComments: conf.get<boolean>(
        "compatibility.hideHtmlComments",
        DEFAULT_EDITOR_CONFIG.compatibility.hideHtmlComments,
      ),
    },
  };
}

export function onEditorConfigChanged(
  listener: (config: EditorConfig) => void,
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (!event.affectsConfiguration(SECTION)) return;
    listener(readEditorConfig());
  });
}
