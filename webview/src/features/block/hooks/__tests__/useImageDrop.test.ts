import type { Block } from "@local-md-editor/shared";
import { renderHook, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { useImageDrop } from "../useImageDrop.js";

// happy-dom の FileReader を上書きして data URL の読み取り結果を制御する
class StubFileReader {
  result: string | ArrayBuffer | null = null;
  private listeners: Record<string, ((e?: unknown) => void)[]> = {};
  addEventListener(name: string, fn: (e?: unknown) => void): void {
    (this.listeners[name] ??= []).push(fn);
  }
  readAsDataURL(file: File): void {
    queueMicrotask(() => {
      this.result = `data:${file.type};base64,STUB-${file.name}`;
      this.listeners.load?.forEach((fn) => fn());
    });
  }
}

// Vitest はテスト終了で global state を破棄しないため、後続テストの干渉を
// 避けるべく元の FileReader を退避して afterAll で必ず復元する。
const FileReaderHost = globalThis as unknown as { FileReader: unknown; };
const originalFileReader = FileReaderHost.FileReader;
beforeAll(() => {
  FileReaderHost.FileReader = StubFileReader;
});
afterAll(() => {
  FileReaderHost.FileReader = originalFileReader;
});

const para = (source: string): Block => ({ id: "p", kind: "paragraph", source, inlines: [] });

const makeImageFile = (name: string, type = "image/png", size = 100): File => {
  const file = new File(["x".repeat(size)], name, { type });
  // happy-dom の File.size は中身から計算されるのでそのまま使える
  return file;
};

const makeDataTransfer = (files: File[]): DataTransfer => ({
  files: files as unknown as FileList,
  types: files.length > 0 ? ["Files"] : [],
} as unknown as DataTransfer);

const setup = (block: Block, editing = false) => {
  const onChange = vi.fn();
  const taRef = createRef<HTMLTextAreaElement>();
  const { result } = renderHook(() => useImageDrop({ block, onChange, taRef, editing }));
  return { onChange, taRef, drop: result.current };
};

const wait = () => new Promise<void>((r) => queueMicrotask(() => queueMicrotask(r)));

// when: useImageDrop() の onTextareaDrop / onDisplayDrop を発火する
describe("useImageDrop", () => {
  describe("画像ファイルの取り込み", () => {
    test("paragraph に画像をドロップすると ![alt](data:...) を末尾に挿入できる", async () => {
      const { onChange, drop } = setup(para("text"), false);
      const e = {
        dataTransfer: makeDataTransfer([makeImageFile("foo.png")]),
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.DragEvent<HTMLDivElement>;
      drop.onDisplayDrop(e);
      await waitFor(() => expect(onChange).toHaveBeenCalled());
      const updated = onChange.mock.calls[0][0] as Block;
      expect(updated.source).toContain("![foo](data:image/png;base64,STUB-foo.png)");
    });

    test("非画像ファイルは無視できる", () => {
      const { onChange, drop } = setup(para("text"), false);
      const txt = new File(["hello"], "x.txt", { type: "text/plain" });
      const e = {
        dataTransfer: makeDataTransfer([txt]),
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.DragEvent<HTMLDivElement>;
      drop.onDisplayDrop(e);
      expect(onChange).not.toHaveBeenCalled();
    });

    test("1MB 超の画像はスキップ (取り込まない)", async () => {
      const { onChange, drop } = setup(para("text"), false);
      const big = makeImageFile("huge.png", "image/png", 2_000_000);
      const e = {
        dataTransfer: makeDataTransfer([big]),
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.DragEvent<HTMLDivElement>;
      drop.onDisplayDrop(e);
      await wait();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("挿入対象外のブロック", () => {
    test("code ブロックには挿入しない", async () => {
      const code: Block = { id: "c", kind: "code", lang: "", value: "x", source: "x" };
      const { onChange, drop } = setup(code, false);
      const e = {
        dataTransfer: makeDataTransfer([makeImageFile("a.png")]),
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.DragEvent<HTMLDivElement>;
      drop.onDisplayDrop(e);
      await wait();
      expect(onChange).not.toHaveBeenCalled();
    });

    test("table ブロックには挿入しない", async () => {
      const table: Block = { id: "t", kind: "table", source: "<table/>", rows: [] };
      const { onChange, drop } = setup(table, false);
      const e = {
        dataTransfer: makeDataTransfer([makeImageFile("a.png")]),
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.DragEvent<HTMLDivElement>;
      drop.onDisplayDrop(e);
      await wait();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("editing 中のキャレット位置への挿入", () => {
    test("editing=true + ta.selectionStart/End がキャレット位置として使われる", async () => {
      // editing=true かつ taRef.current が textarea を指す状態を構築する。
      // キャレットを 2 (= "te" の直後) に置いて、その位置に画像 markdown を
      // 挿入できることを確認する
      const onChange = vi.fn();
      const ta = document.createElement("textarea");
      ta.value = "text";
      ta.setSelectionRange(2, 2);
      const taRef = { current: ta } as React.RefObject<HTMLTextAreaElement>;
      const { result } = renderHook(() =>
        useImageDrop({ block: para("text"), onChange, taRef, editing: true })
      );
      const e = {
        dataTransfer: makeDataTransfer([makeImageFile("c.png")]),
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.DragEvent<HTMLTextAreaElement>;
      result.current.onTextareaDrop(e);
      await waitFor(() => expect(onChange).toHaveBeenCalled());
      const updated = onChange.mock.calls[0][0] as Block;
      // 元の "text" のキャレット位置 2 ("te" の直後) に挿入される
      expect(updated.source).toMatch(/^te!\[c\]\([^)]+\)xt$/);
    });
  });

  describe("空ファイル", () => {
    test("ドロップされたファイルが 0 件なら何もしない", () => {
      const { onChange, drop } = setup(para("text"), false);
      const e = {
        dataTransfer: { files: [] as unknown as FileList, types: [] },
        preventDefault: vi.fn(),
      } as unknown as React.DragEvent<HTMLDivElement>;
      drop.onDisplayDrop(e);
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
