import { DEFAULT_EDITOR_CONFIG, type EditorConfig } from "@local-md-editor/shared";
import { createContext, type ReactNode, useEffect, useState } from "react";
import { onMessage } from "../../vscode.js";

export const EditorConfigContext = createContext<EditorConfig>(DEFAULT_EDITOR_CONFIG);

type Props = { children: ReactNode; };

// extension からの `init` / `configChanged` を購読し、現行の EditorConfig を
// Context 経由で配信する。`init` を受け取るまでは DEFAULT_EDITOR_CONFIG を返す。
export const EditorConfigProvider = ({ children }: Props): JSX.Element => {
  const [config, setConfig] = useState<EditorConfig>(DEFAULT_EDITOR_CONFIG);

  useEffect(() => {
    return onMessage((msg) => {
      if (msg.type === "init" || msg.type === "configChanged") {
        setConfig(msg.config);
      }
    });
  }, []);

  return (
    <EditorConfigContext.Provider value={config}>
      {children}
    </EditorConfigContext.Provider>
  );
};
