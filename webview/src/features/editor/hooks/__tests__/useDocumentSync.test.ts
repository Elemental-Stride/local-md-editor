import {
  DEFAULT_EDITOR_CONFIG,
  type Document,
  type ExtensionToWebviewMessage,
} from "@local-md-editor/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useBlockReconciliation } from "../useBlockReconciliation.js";
import { useDocumentSync } from "../useDocumentSync.js";

const postSpy = vi.fn();
let messageHandler: ((msg: ExtensionToWebviewMessage) => void) | null = null;
const offSpy = vi.fn();

vi.mock("../../../../vscode.js", () => ({
  post: (msg: unknown) => postSpy(msg),
  onMessage: (handler: (msg: ExtensionToWebviewMessage) => void): () => void => {
    messageHandler = handler;
    return () => {
      messageHandler = null;
      offSpy();
    };
  },
}));

const para = (id: string): Document["blocks"][number] => ({
  id,
  kind: "paragraph",
  source: id,
  inlines: [],
});

const useSyncHarness = (onExternalUpdate: () => void) => {
  const reconciliation = useBlockReconciliation();
  return useDocumentSync({ reconciliation, onExternalUpdate });
};

beforeEach(() => {
  postSpy.mockClear();
  offSpy.mockClear();
  messageHandler = null;
});

afterEach(() => {
  messageHandler = null;
});

// when: useDocumentSync をマウントして extension とメッセージ往復する
describe("useDocumentSync", () => {
  describe("マウント", () => {
    test("マウント直後に extension へ ready を通知できる", () => {
      const onExternal = vi.fn();
      renderHook(() => useSyncHarness(onExternal));
      expect(postSpy).toHaveBeenCalledWith({ type: "ready" });
    });

    test("初期 doc は null として返せる", () => {
      const { result } = renderHook(() => useSyncHarness(vi.fn()));
      expect(result.current.doc).toBeNull();
      expect(result.current.docRef.current).toBeNull();
    });
  });

  describe("init メッセージ", () => {
    test("init を受け取って doc を設定し onExternalUpdate を呼べる", () => {
      const onExternal = vi.fn();
      const { result } = renderHook(() => useSyncHarness(onExternal));
      const initial: Document = { blocks: [para("a")] };
      act(() =>
        messageHandler?.({ type: "init", document: initial, config: DEFAULT_EDITOR_CONFIG })
      );
      expect(result.current.doc).toEqual(initial);
      expect(onExternal).toHaveBeenCalledTimes(1);
    });

    test("init 後に docRef も同じ doc を指せる", () => {
      const { result } = renderHook(() => useSyncHarness(vi.fn()));
      const initial: Document = { blocks: [para("a")] };
      act(() =>
        messageHandler?.({ type: "init", document: initial, config: DEFAULT_EDITOR_CONFIG })
      );
      expect(result.current.docRef.current).toEqual(initial);
    });
  });

  describe("update メッセージ", () => {
    test("reason=external の update で onExternalUpdate を呼べる", () => {
      const onExternal = vi.fn();
      const { result } = renderHook(() => useSyncHarness(onExternal));
      const next: Document = { blocks: [para("a")] };
      act(() => messageHandler?.({ type: "update", document: next, reason: "external" }));
      expect(onExternal).toHaveBeenCalled();
      expect(result.current.doc).toEqual(next);
    });

    test("reason=commit-echo の update では onExternalUpdate を呼ばない", () => {
      const onExternal = vi.fn();
      const { result } = renderHook(() => useSyncHarness(onExternal));
      const next: Document = { blocks: [para("a")] };
      act(() => messageHandler?.({ type: "update", document: next, reason: "commit-echo" }));
      expect(onExternal).not.toHaveBeenCalled();
      expect(result.current.doc).toEqual(next);
    });

    test("prev が存在する場合 reuseIds で id を引き継げる", () => {
      const { result } = renderHook(() => useSyncHarness(vi.fn()));
      // 初期化
      act(() =>
        messageHandler?.({
          type: "init",
          document: { blocks: [para("oldid")] },
          config: DEFAULT_EDITOR_CONFIG,
        })
      );
      // update: 同 source の paragraph を別 id で送ってきても id は古い側を引き継ぐ
      act(() =>
        messageHandler?.({
          type: "update",
          document: { blocks: [{ ...para("newid"), source: "oldid" }] },
          reason: "commit-echo",
        })
      );
      expect(result.current.doc?.blocks[0].id).toBe("oldid");
    });
  });

  describe("クリーンアップ", () => {
    test("アンマウントで onMessage の解除関数が呼ばれる", () => {
      const { unmount } = renderHook(() => useSyncHarness(vi.fn()));
      unmount();
      expect(offSpy).toHaveBeenCalled();
    });
  });
});
