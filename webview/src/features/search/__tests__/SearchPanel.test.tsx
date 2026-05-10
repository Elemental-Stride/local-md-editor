import type { Block, Document } from "@local-md-editor/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { SearchPanel } from "../SearchPanel.js";

const para = (id: string, source: string): Block => ({
  id,
  kind: "paragraph",
  source,
  inlines: [],
});

const setup = (
  blocks: Block[],
  overrides: Partial<Parameters<typeof SearchPanel>[0]> = {},
) => {
  const handlers = {
    onClose: vi.fn(),
    onActiveMatchChanged: vi.fn(),
    onReplaceCommit: vi.fn(),
  };
  return {
    ...handlers,
    ...render(
      <SearchPanel document={{ blocks }} {...handlers} {...overrides} />,
    ),
  };
};

const queryInput = (): HTMLInputElement => screen.getByPlaceholderText("検索") as HTMLInputElement;

// when: <SearchPanel /> をマウントして検索 / 置換する
describe("SearchPanel", () => {
  describe("マッチ計算", () => {
    test("クエリ未入力では「0 / 0」と表示できる", () => {
      setup([para("a", "hello")]);
      expect(screen.getByText("0 / 0")).toBeInTheDocument();
    });

    test("クエリで複数のヒットを集計し N 件として表示できる", () => {
      setup([para("a", "hello hello world"), para("b", "say hello again")]);
      fireEvent.change(queryInput(), { target: { value: "hello" } });
      // 1 / 3 (3 matches: "hello hello" の 2 つ + "say hello" の 1 つ)
      expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });

    test("「次へ」で activeIndex がインクリメントされる", () => {
      setup([para("a", "hello hello")]);
      fireEvent.change(queryInput(), { target: { value: "hello" } });
      fireEvent.click(screen.getByText("次へ"));
      expect(screen.getByText("2 / 2")).toBeInTheDocument();
    });

    test("「前へ」で activeIndex がデクリメントされる (循環)", () => {
      setup([para("a", "hello hello")]);
      fireEvent.change(queryInput(), { target: { value: "hello" } });
      fireEvent.click(screen.getByText("前へ"));
      // 先頭から「前」は最後 (循環)
      expect(screen.getByText("2 / 2")).toBeInTheDocument();
    });
  });

  describe("大小区別", () => {
    test("大小区別オフでは大文字小文字を無視してマッチできる", () => {
      setup([para("a", "Hello hello HELLO")]);
      fireEvent.change(queryInput(), { target: { value: "hello" } });
      expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });

    test("大小区別オンでは厳密マッチのみカウントできる", () => {
      setup([para("a", "Hello hello HELLO")]);
      fireEvent.change(queryInput(), { target: { value: "hello" } });
      fireEvent.click(screen.getByLabelText("大小区別"));
      expect(screen.getByText("1 / 1")).toBeInTheDocument();
    });
  });

  describe("親への通知", () => {
    test("マッチ変化時に onActiveMatchChanged で id 集合を渡せる", () => {
      const onActiveMatchChanged = vi.fn();
      setup([para("a", "hi"), para("b", "hello")], { onActiveMatchChanged });
      fireEvent.change(queryInput(), { target: { value: "hello" } });
      const lastCall = onActiveMatchChanged.mock.calls.at(-1);
      expect(lastCall).toBeDefined();
      expect(lastCall![0]).toBe("b");
      expect((lastCall![1] as Set<string>).has("b")).toBe(true);
    });
  });

  describe("置換 UI", () => {
    test("置換ボタンで置換 input が現れる", () => {
      setup([para("a", "x")]);
      expect(screen.queryByPlaceholderText("置換後")).toBeNull();
      fireEvent.click(screen.getByText("置換"));
      expect(screen.getByPlaceholderText("置換後")).toBeInTheDocument();
    });

    test("「1件」で現在ヒットを置換した document を渡せる", () => {
      const onReplaceCommit = vi.fn();
      setup([para("a", "hello hello")], { onReplaceCommit });
      fireEvent.change(queryInput(), { target: { value: "hello" } });
      fireEvent.click(screen.getByText("置換"));
      fireEvent.change(screen.getByPlaceholderText("置換後"), {
        target: { value: "hi" },
      });
      fireEvent.click(screen.getByText("1件"));
      const result = onReplaceCommit.mock.calls[0][0] as Document;
      expect(result.blocks[0].source).toBe("hi hello");
    });

    test("「全て」で全ヒットを末尾→先頭順に置換した document を渡せる", () => {
      const onReplaceCommit = vi.fn();
      setup([para("a", "hello hello")], { onReplaceCommit });
      fireEvent.change(queryInput(), { target: { value: "hello" } });
      fireEvent.click(screen.getByText("置換"));
      fireEvent.change(screen.getByPlaceholderText("置換後"), {
        target: { value: "hi" },
      });
      fireEvent.click(screen.getByText("全て"));
      expect((onReplaceCommit.mock.calls[0][0] as Document).blocks[0].source).toBe("hi hi");
    });
  });

  describe("キーボード操作", () => {
    test("Enter で次のマッチに進める", () => {
      setup([para("a", "hello hello")]);
      fireEvent.change(queryInput(), { target: { value: "hello" } });
      fireEvent.keyDown(queryInput(), { key: "Enter" });
      expect(screen.getByText("2 / 2")).toBeInTheDocument();
    });

    test("Shift+Enter で前のマッチに戻れる", () => {
      setup([para("a", "hello hello")]);
      fireEvent.change(queryInput(), { target: { value: "hello" } });
      fireEvent.keyDown(queryInput(), { key: "Enter", shiftKey: true });
      // 1 → 前 → 2 (循環)
      expect(screen.getByText("2 / 2")).toBeInTheDocument();
    });

    test("Escape で onClose を呼べる", () => {
      const { onClose } = setup([para("a", "x")]);
      fireEvent.keyDown(queryInput(), { key: "Escape" });
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("close ボタン", () => {
    test("「閉じる」で onClose を呼べる", () => {
      const { onClose } = setup([para("a", "x")]);
      fireEvent.click(screen.getByText("閉じる"));
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("ブロック種別ごとの検索対象テキスト", () => {
    test("code ブロックは block.value を検索対象にできる", () => {
      const codeBlock: Block = {
        id: "c",
        kind: "code",
        lang: "js",
        value: "const target = 1",
        source: "```js\nconst target = 1\n```",
      };
      setup([codeBlock]);
      fireEvent.change(queryInput(), { target: { value: "target" } });
      expect(screen.getByText("1 / 1")).toBeInTheDocument();
    });

    test("table ブロックは source (HTML) を検索対象にできる", () => {
      const tableBlock: Block = {
        id: "t",
        kind: "table",
        source: "<table><tr><td>secret</td></tr></table>",
        rows: [],
      };
      setup([tableBlock]);
      fireEvent.change(queryInput(), { target: { value: "secret" } });
      expect(screen.getByText("1 / 1")).toBeInTheDocument();
    });

    test("code ブロックの置換は block.value を更新できる", () => {
      const onReplaceCommit = vi.fn();
      const codeBlock: Block = {
        id: "c",
        kind: "code",
        lang: "js",
        value: "let x = 1",
        source: "```js\nlet x = 1\n```",
      };
      setup([codeBlock], { onReplaceCommit });
      fireEvent.change(queryInput(), { target: { value: "let" } });
      fireEvent.click(screen.getByText("置換"));
      fireEvent.change(screen.getByPlaceholderText("置換後"), {
        target: { value: "const" },
      });
      fireEvent.click(screen.getByText("1件"));
      const result = onReplaceCommit.mock.calls[0][0] as { blocks: Block[]; };
      const code = result.blocks[0];
      expect(code.kind).toBe("code");
      if (code.kind === "code") expect(code.value).toBe("const x = 1");
    });

    test("table ブロックの置換は source (HTML) を更新できる", () => {
      const onReplaceCommit = vi.fn();
      const tableBlock: Block = {
        id: "t",
        kind: "table",
        source: "<table><tr><td>old</td></tr></table>",
        rows: [],
      };
      setup([tableBlock], { onReplaceCommit });
      fireEvent.change(queryInput(), { target: { value: "old" } });
      fireEvent.click(screen.getByText("置換"));
      fireEvent.change(screen.getByPlaceholderText("置換後"), {
        target: { value: "new" },
      });
      fireEvent.click(screen.getByText("1件"));
      const result = onReplaceCommit.mock.calls[0][0] as { blocks: Block[]; };
      expect(result.blocks[0].source).toBe("<table><tr><td>new</td></tr></table>");
    });
  });

  describe("置換 input のキーボード操作", () => {
    test("置換 input で Enter を押すと replaceCurrent を呼べる", () => {
      const onReplaceCommit = vi.fn();
      setup([para("a", "hello")], { onReplaceCommit });
      fireEvent.change(queryInput(), { target: { value: "hello" } });
      fireEvent.click(screen.getByText("置換"));
      const replaceInput = screen.getByPlaceholderText("置換後");
      fireEvent.change(replaceInput, { target: { value: "hi" } });
      fireEvent.keyDown(replaceInput, { key: "Enter" });
      expect(onReplaceCommit).toHaveBeenCalled();
    });

    test("置換 input で Escape を押すと onClose を呼べる", () => {
      const { onClose } = setup([para("a", "x")]);
      fireEvent.click(screen.getByText("置換"));
      fireEvent.keyDown(screen.getByPlaceholderText("置換後"), { key: "Escape" });
      expect(onClose).toHaveBeenCalled();
    });

    test("IME 変換中の Enter は replaceCurrent を発火させない", () => {
      const onReplaceCommit = vi.fn();
      setup([para("a", "hello")], { onReplaceCommit });
      fireEvent.change(queryInput(), { target: { value: "hello" } });
      fireEvent.click(screen.getByText("置換"));
      const replaceInput = screen.getByPlaceholderText("置換後");
      fireEvent.keyDown(replaceInput, { key: "Enter", isComposing: true });
      expect(onReplaceCommit).not.toHaveBeenCalled();
    });
  });

  describe("マッチ無し時の置換ボタン", () => {
    test("マッチが 0 件のときは「1件」/「全て」が disabled になる", () => {
      setup([para("a", "no match here")]);
      fireEvent.change(queryInput(), { target: { value: "xyz" } });
      fireEvent.click(screen.getByText("置換"));
      const one = screen.getByText("1件") as HTMLButtonElement;
      const all = screen.getByText("全て") as HTMLButtonElement;
      expect(one.disabled).toBe(true);
      expect(all.disabled).toBe(true);
    });

    test("マッチ無しで「全て」を押しても onReplaceCommit を呼ばない", () => {
      const onReplaceCommit = vi.fn();
      setup([para("a", "x")], { onReplaceCommit });
      fireEvent.click(screen.getByText("置換"));
      // disabled でも click は出来るが内部で early return
      const all = screen.getByText("全て");
      fireEvent.click(all);
      expect(onReplaceCommit).not.toHaveBeenCalled();
    });
  });

  describe("検索 input の onMouseDown", () => {
    test("パネル本体の onMouseDown は stopPropagation する", () => {
      const { container } = setup([para("a", "x")]);
      // パネル wrapper を取得
      const panel = container.querySelector("[data-overlay-input]") as HTMLElement;
      const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      const stopSpy = vi.spyOn(event, "stopPropagation");
      panel.dispatchEvent(event);
      expect(stopSpy).toHaveBeenCalled();
    });
  });
});
