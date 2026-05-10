import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfiguration: vi.fn(),
  onDidChangeConfiguration: vi.fn(),
}));

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: mocks.getConfiguration,
    onDidChangeConfiguration: mocks.onDidChangeConfiguration,
  },
}));

import { onEditorConfigChanged, readEditorConfig } from "../config.js";

beforeEach(() => {
  mocks.getConfiguration.mockReset();
  mocks.onDidChangeConfiguration.mockReset();
});

// when: vscode.workspace.getConfiguration("localMdEditor") からキー値を解決する
describe("readEditorConfig", () => {
  describe("compatibility.hideHtmlComments", () => {
    test("VS Code 設定値 (true) を読み出せる", () => {
      mocks.getConfiguration.mockReturnValue({
        get: <T>(_key: string, _default: T): T => true as T,
      });
      expect(readEditorConfig().compatibility.hideHtmlComments).toBe(true);
    });

    test("VS Code 設定値 (false) を読み出せる", () => {
      mocks.getConfiguration.mockReturnValue({
        get: <T>(_key: string, _default: T): T => false as T,
      });
      expect(readEditorConfig().compatibility.hideHtmlComments).toBe(false);
    });

    test("設定未定義時は DEFAULT_EDITOR_CONFIG の default を返せる", () => {
      mocks.getConfiguration.mockReturnValue({
        get: <T>(_key: string, defaultValue: T): T => defaultValue,
      });
      expect(readEditorConfig().compatibility.hideHtmlComments).toBe(true);
    });
  });
});

type ChangeEvent = { affectsConfiguration: (section: string) => boolean; };

// when: onDidChangeConfiguration の event をフィルタしながら listener へ転送する
describe("onEditorConfigChanged", () => {
  describe("section フィルタ", () => {
    test("localMdEditor 配下の変更で listener を呼び出せる", () => {
      const captured: { handler: (e: ChangeEvent) => void; } = { handler: () => {} };
      mocks.onDidChangeConfiguration.mockImplementation((h: (e: ChangeEvent) => void) => {
        captured.handler = h;
        return { dispose: vi.fn() };
      });
      mocks.getConfiguration.mockReturnValue({
        get: <T>(_key: string, defaultValue: T): T => defaultValue,
      });

      const listener = vi.fn();
      onEditorConfigChanged(listener);
      captured.handler({ affectsConfiguration: (s: string) => s === "localMdEditor" });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    test("localMdEditor 配下以外の変更では listener を呼ばない", () => {
      const captured: { handler: (e: ChangeEvent) => void; } = { handler: () => {} };
      mocks.onDidChangeConfiguration.mockImplementation((h: (e: ChangeEvent) => void) => {
        captured.handler = h;
        return { dispose: vi.fn() };
      });

      const listener = vi.fn();
      onEditorConfigChanged(listener);
      captured.handler({ affectsConfiguration: () => false });
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
