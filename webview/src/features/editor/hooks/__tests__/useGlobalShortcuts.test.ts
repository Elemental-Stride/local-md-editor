import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useGlobalShortcuts } from "../useGlobalShortcuts.js";

// useGlobalShortcuts は window へ keydown listener を貼るので、テスト間で
// アンマウントしないと前テストの listener が残り stopImmediatePropagation で
// 次のテストの handler を遮ってしまう。cleanup() で全コンポーネントをアン
// マウントして listener を確実に剥がす。
afterEach(() => {
  cleanup();
});

type Mocks = {
  openSearch: ReturnType<typeof vi.fn<() => void>>;
  moveActiveBlock: ReturnType<typeof vi.fn<(delta: -1 | 1) => void>>;
  undo: ReturnType<typeof vi.fn<() => void>>;
  redo: ReturnType<typeof vi.fn<() => void>>;
};

const setup = (): Mocks => {
  const mocks: Mocks = {
    openSearch: vi.fn<() => void>(),
    moveActiveBlock: vi.fn<(delta: -1 | 1) => void>(),
    undo: vi.fn<() => void>(),
    redo: vi.fn<() => void>(),
  };
  renderHook(() => useGlobalShortcuts(mocks));
  return mocks;
};

const fire = (
  init: KeyboardEventInit & { tag?: "INPUT" | "TEXTAREA" | "DIV"; overlay?: boolean; },
): KeyboardEvent => {
  // overlay 入力 (検索パネルなど) からの発火を再現するときは、
  // [data-overlay-input] を親に持つ input/textarea を target に立てる。
  let target: EventTarget | undefined;
  if (init.tag) {
    const wrapper = document.createElement("div");
    if (init.overlay) wrapper.setAttribute("data-overlay-input", "");
    const inner = document.createElement(init.tag.toLowerCase());
    wrapper.appendChild(inner);
    document.body.appendChild(wrapper);
    target = inner;
  }
  const event = new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true });
  if (target) Object.defineProperty(event, "target", { value: target, configurable: true });
  window.dispatchEvent(event);
  return event;
};

afterEach(() => {
  document.body.innerHTML = "";
});

// when: useGlobalShortcuts() マウント中に keydown を発火させる
describe("useGlobalShortcuts", () => {
  describe("装飾キー無し", () => {
    test("装飾キー無しの単独キーは無視できる", () => {
      const m = setup();
      fire({ key: "f" });
      fire({ key: "z" });
      fire({ key: "ArrowUp", shiftKey: true });
      expect(m.openSearch).not.toHaveBeenCalled();
      expect(m.undo).not.toHaveBeenCalled();
      expect(m.moveActiveBlock).not.toHaveBeenCalled();
    });
  });

  describe("検索を開く (Cmd+F)", () => {
    test("metaKey+f で openSearch を呼べる", () => {
      const m = setup();
      const e = fire({ key: "f", metaKey: true });
      expect(m.openSearch).toHaveBeenCalled();
      expect(e.defaultPrevented).toBe(true);
    });

    test("ctrlKey+f でも openSearch を呼べる", () => {
      const m = setup();
      fire({ key: "f", ctrlKey: true });
      expect(m.openSearch).toHaveBeenCalled();
    });
  });

  describe("undo / redo (Cmd+Z / Cmd+Shift+Z / Cmd+Y)", () => {
    test("metaKey+z で undo を呼べる", () => {
      const m = setup();
      fire({ key: "z", metaKey: true });
      expect(m.undo).toHaveBeenCalled();
      expect(m.redo).not.toHaveBeenCalled();
    });

    test("metaKey+shiftKey+z で redo を呼べる", () => {
      const m = setup();
      fire({ key: "z", metaKey: true, shiftKey: true });
      expect(m.redo).toHaveBeenCalled();
      expect(m.undo).not.toHaveBeenCalled();
    });

    test("ctrlKey+y で redo を呼べる", () => {
      const m = setup();
      fire({ key: "y", ctrlKey: true });
      expect(m.redo).toHaveBeenCalled();
    });

    test("IME 変換中 (isComposing) は undo/redo を発火させない", () => {
      const m = setup();
      fire({ key: "z", metaKey: true, isComposing: true });
      fire({ key: "y", ctrlKey: true, isComposing: true });
      expect(m.undo).not.toHaveBeenCalled();
      expect(m.redo).not.toHaveBeenCalled();
    });

    test("オーバーレイ input (検索パネル) では undo を document に流さない", () => {
      const m = setup();
      const e = fire({ key: "z", metaKey: true, tag: "INPUT", overlay: true });
      expect(m.undo).not.toHaveBeenCalled();
      // ネイティブ input undo に委ねるので preventDefault しない
      expect(e.defaultPrevented).toBe(false);
    });

    test("オーバーレイでない textarea からの undo は document 側 undo を呼べる", () => {
      const m = setup();
      fire({ key: "z", metaKey: true, tag: "TEXTAREA", overlay: false });
      expect(m.undo).toHaveBeenCalled();
    });

    test("オーバーレイ input でも redo (Cmd+Y) は流さず input 側 undo に委ねる", () => {
      // Cmd+Y 経路の `if (isInOverlayInput(...)) return;` 真分岐
      const m = setup();
      fire({ key: "y", ctrlKey: true, tag: "INPUT", overlay: true });
      expect(m.redo).not.toHaveBeenCalled();
    });

    test("INPUT / TEXTAREA 以外の要素はオーバーレイ判定の対象外", () => {
      // isInOverlayInput の `target.tagName !== "INPUT" && target.tagName !== "TEXTAREA"` true 分岐
      // = INPUT/TEXTAREA 以外なら overlay でも undo 経路へ進む
      const m = setup();
      fire({ key: "z", metaKey: true, tag: "DIV", overlay: true });
      expect(m.undo).toHaveBeenCalled();
    });
  });

  describe("アクティブブロック移動 (Cmd+Shift+矢印)", () => {
    test("metaKey+shiftKey+ArrowUp で moveActiveBlock(-1) を呼べる", () => {
      const m = setup();
      fire({ key: "ArrowUp", metaKey: true, shiftKey: true });
      expect(m.moveActiveBlock).toHaveBeenCalledWith(-1);
    });

    test("metaKey+shiftKey+ArrowDown で moveActiveBlock(1) を呼べる", () => {
      const m = setup();
      fire({ key: "ArrowDown", metaKey: true, shiftKey: true });
      expect(m.moveActiveBlock).toHaveBeenCalledWith(1);
    });

    test("Shift 無しの矢印は moveActiveBlock を呼ばない", () => {
      const m = setup();
      fire({ key: "ArrowUp", metaKey: true });
      expect(m.moveActiveBlock).not.toHaveBeenCalled();
    });
  });
});
