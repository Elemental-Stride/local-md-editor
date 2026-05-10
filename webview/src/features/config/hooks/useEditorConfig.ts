import type { EditorConfig } from "@local-md-editor/shared";
import { useContext } from "react";
import { EditorConfigContext } from "../EditorConfigProvider.js";

export const useEditorConfig = (): EditorConfig => useContext(EditorConfigContext);
