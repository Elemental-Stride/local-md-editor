import { EditorConfigProvider } from "./features/config/index.js";
import { Editor } from "./features/editor/index.js";

export const App = (): JSX.Element => (
  <EditorConfigProvider>
    <Editor />
  </EditorConfigProvider>
);
