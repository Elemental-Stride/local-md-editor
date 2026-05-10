import type { Document, ExtensionToWebviewMessage } from "@local-md-editor/shared";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const postSpy = vi.fn();
let messageHandler: ((msg: ExtensionToWebviewMessage) => void) | null = null;

vi.mock("../../../vscode.js", () => ({
  post: (msg: unknown) => postSpy(msg),
  onMessage: (handler: (msg: ExtensionToWebviewMessage) => void) => {
    messageHandler = handler;
    return () => {
      messageHandler = null;
    };
  },
}));
vi.mock("../../../resources.js", () => ({
  classifyUrl: () => ({ kind: "remote" }),
  useResolvedUri: () => null,
}));
vi.mock("../../mermaid/index.js", () => ({
  MermaidView: () => <div data-testid="mermaid-stub" />,
}));

import { Editor } from "../Editor.js";

beforeEach(() => {
  postSpy.mockClear();
  messageHandler = null;
});

afterEach(() => {
  messageHandler = null;
});

const para = (id: string, source: string): Document["blocks"][number] => ({
  id,
  kind: "paragraph",
  source,
  inlines: [],
});

const sendInit = (doc: Document): void => {
  if (!messageHandler) throw new Error("messageHandler not registered");
  act(() => messageHandler!({ type: "init", document: doc }));
};

// when: <Editor /> をマウントして orchestration が動くか確認する
//
// Editor は 9 個の hook を合成してレンダリングする最上位コンポーネント。
// init メッセージで doc を設定して populated 状態に入り、undo/redo の Cmd+Z や
// 「クリックして書き始める」ボタンの分岐まで全て exercise する。
describe("Editor", () => {
  describe("doc=null 時 (Loading)", () => {
    test("マウント直後 (init 未受信) は Loading… を表示できる", () => {
      render(<Editor />);
      expect(screen.getByText("Loading…")).toBeInTheDocument();
    });

    test("マウント時に extension へ ready を post できる", () => {
      render(<Editor />);
      expect(postSpy).toHaveBeenCalledWith({ type: "ready" });
    });
  });

  describe("空 doc を受け取ったとき", () => {
    test("「クリックして書き始める」ボタンを表示できる", () => {
      render(<Editor />);
      sendInit({ blocks: [] });
      expect(screen.getByText("クリックして書き始める…")).toBeInTheDocument();
    });

    test("ボタンを押すと startWriting (= edit メッセージ送信) を呼べる", () => {
      render(<Editor />);
      sendInit({ blocks: [] });
      postSpy.mockClear();
      fireEvent.click(screen.getByText("クリックして書き始める…"));
      const edit = postSpy.mock.calls.find(
        (c) => (c[0] as { type: string; }).type === "edit",
      );
      expect(edit).toBeDefined();
    });
  });

  describe("populated doc", () => {
    test("blocks がある doc を受け取ると BlockList を描画できる", () => {
      render(<Editor />);
      sendInit({ blocks: [para("a", "hello")] });
      // BlockList が実体ある block row を描画する
      expect(screen.getByText("hello")).toBeInTheDocument();
    });
  });

  describe("検索パネル", () => {
    test("Cmd+F で SearchPanel を開けて、close で閉じられる", () => {
      render(<Editor />);
      sendInit({ blocks: [para("a", "hello")] });
      // Cmd+F で開く
      act(() => {
        fireEvent.keyDown(window, { key: "f", metaKey: true });
      });
      expect(screen.getByPlaceholderText("検索")).toBeInTheDocument();
      // 「閉じる」ボタンで閉じる
      fireEvent.click(screen.getByText("閉じる"));
      expect(screen.queryByPlaceholderText("検索")).toBeNull();
    });
  });

  describe("undo / redo (グローバルショートカット)", () => {
    test("Cmd+Z は doc が null (init 未受信) のとき no-op", () => {
      render(<Editor />);
      // init を送らない → doc は null。post には ready のみ。
      const before = postSpy.mock.calls.length;
      act(() => {
        fireEvent.keyDown(window, { key: "z", metaKey: true });
      });
      // edit メッセージは送られない
      const editAfter = postSpy.mock.calls.slice(before).filter(
        (c) => (c[0] as { type: string; }).type === "edit",
      );
      expect(editAfter).toHaveLength(0);
    });

    test("Cmd+Y は doc が null のとき no-op", () => {
      render(<Editor />);
      act(() => {
        fireEvent.keyDown(window, { key: "y", ctrlKey: true });
      });
      const edits = postSpy.mock.calls.filter(
        (c) => (c[0] as { type: string; }).type === "edit",
      );
      expect(edits).toHaveLength(0);
    });

    test("Cmd+Z は履歴空のとき no-op (post の edit 送信が増えない)", () => {
      render(<Editor />);
      sendInit({ blocks: [para("a", "hi")] });
      const before = postSpy.mock.calls.filter(
        (c) => (c[0] as { type: string; }).type === "edit",
      ).length;
      fireEvent.keyDown(window, { key: "z", metaKey: true });
      const after = postSpy.mock.calls.filter(
        (c) => (c[0] as { type: string; }).type === "edit",
      ).length;
      expect(after).toBe(before);
    });

    test("変更後の Cmd+Z で undo して edit メッセージを送信できる", () => {
      render(<Editor />);
      sendInit({ blocks: [para("a", "v1")] });
      // update メッセージで履歴を保ったまま doc を変更 → checkpoint は積まれない
      // ので、useDocumentMutations 経由で変更したい。BlockList の checkbox 等を
      // 触るのが正攻法だが、ここではテキスト編集 (preview クリック → textarea
      // 入力) を simulate する。
      const wrapper = document.querySelector(".cursor-text") as HTMLElement;
      fireEvent.click(wrapper);
      const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
      fireEvent.change(ta, { target: { value: "v2" } });
      // 上記で history に soft checkpoint が積まれる → Cmd+Z で undo できる
      postSpy.mockClear();
      act(() => {
        fireEvent.keyDown(window, { key: "z", metaKey: true });
      });
      const editMsgs = postSpy.mock.calls.filter(
        (c) => (c[0] as { type: string; }).type === "edit",
      );
      expect(editMsgs.length).toBeGreaterThan(0);
    });

    test("Cmd+Y で redo できる (undo した後)", () => {
      render(<Editor />);
      sendInit({ blocks: [para("a", "v1")] });
      const wrapper = document.querySelector(".cursor-text") as HTMLElement;
      fireEvent.click(wrapper);
      const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
      fireEvent.change(ta, { target: { value: "v2" } });
      // undo
      act(() => {
        fireEvent.keyDown(window, { key: "z", metaKey: true });
      });
      postSpy.mockClear();
      // redo
      act(() => {
        fireEvent.keyDown(window, { key: "y", ctrlKey: true });
      });
      const editMsgs = postSpy.mock.calls.filter(
        (c) => (c[0] as { type: string; }).type === "edit",
      );
      expect(editMsgs.length).toBeGreaterThan(0);
    });
  });
});
