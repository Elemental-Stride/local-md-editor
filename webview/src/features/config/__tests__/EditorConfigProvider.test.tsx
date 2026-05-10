import type { ExtensionToWebviewMessage } from "@local-md-editor/shared";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

let messageHandler: ((msg: ExtensionToWebviewMessage) => void) | null = null;

vi.mock("../../../vscode.js", () => ({
  post: vi.fn(),
  onMessage: (handler: (msg: ExtensionToWebviewMessage) => void) => {
    messageHandler = handler;
    return () => {
      messageHandler = null;
    };
  },
}));

import { EditorConfigProvider } from "../EditorConfigProvider.js";
import { useEditorConfig } from "../hooks/useEditorConfig.js";

beforeEach(() => {
  messageHandler = null;
});

afterEach(() => {
  messageHandler = null;
});

const Probe = ({ onValue }: { onValue: (v: unknown) => void; }): JSX.Element => {
  const c = useEditorConfig();
  onValue(c);
  return <div />;
};

const mountProvider = (onValue: (v: unknown) => void): void => {
  render(
    <EditorConfigProvider>
      <Probe onValue={onValue} />
    </EditorConfigProvider>,
  );
};

// when: <EditorConfigProvider> 配下で extension からの message を受信する
describe("EditorConfigProvider", () => {
  describe("初期値", () => {
    test("init 受信前は DEFAULT_EDITOR_CONFIG (hideHtmlComments=true) を返せる", () => {
      const onValue = vi.fn();
      mountProvider(onValue);
      expect(onValue).toHaveBeenLastCalledWith({
        compatibility: { hideHtmlComments: true },
      });
    });
  });

  describe("init メッセージ", () => {
    test("init.config を受け取って Context に反映できる", () => {
      const onValue = vi.fn();
      mountProvider(onValue);
      act(() =>
        messageHandler?.({
          type: "init",
          document: { blocks: [] },
          config: { compatibility: { hideHtmlComments: false } },
        })
      );
      expect(onValue).toHaveBeenLastCalledWith({
        compatibility: { hideHtmlComments: false },
      });
    });
  });

  describe("configChanged メッセージ", () => {
    test("configChanged を受け取って Context を更新できる", () => {
      const onValue = vi.fn();
      mountProvider(onValue);
      act(() =>
        messageHandler?.({
          type: "configChanged",
          config: { compatibility: { hideHtmlComments: false } },
        })
      );
      expect(onValue).toHaveBeenLastCalledWith({
        compatibility: { hideHtmlComments: false },
      });
    });
  });

  describe("無関係のメッセージ", () => {
    test("update メッセージでは config を更新しない", () => {
      const onValue = vi.fn();
      mountProvider(onValue);
      onValue.mockClear();
      act(() =>
        messageHandler?.({
          type: "update",
          document: { blocks: [] },
          reason: "external",
        })
      );
      expect(onValue).not.toHaveBeenCalled();
    });

    test("resolvedResource メッセージでも config を更新しない", () => {
      const onValue = vi.fn();
      mountProvider(onValue);
      onValue.mockClear();
      act(() =>
        messageHandler?.({
          type: "resolvedResource",
          requestId: "r1",
          ref: "img/x.png",
          uri: "vscode-webview://x",
        })
      );
      expect(onValue).not.toHaveBeenCalled();
    });
  });
});
