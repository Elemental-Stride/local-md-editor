import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { LinkModal } from "../LinkModal.js";

const setup = (overrides: Partial<Parameters<typeof LinkModal>[0]> = {}) => {
  const onApply = vi.fn();
  const onCancel = vi.fn();
  render(
    <LinkModal
      defaultLabel={overrides.defaultLabel ?? ""}
      defaultUrl={overrides.defaultUrl ?? ""}
      onApply={overrides.onApply ?? onApply}
      onCancel={overrides.onCancel ?? onCancel}
    />,
  );
  return { onApply, onCancel };
};

const urlInput = (): HTMLInputElement =>
  screen.getByPlaceholderText("https://example.com") as HTMLInputElement;
const labelInput = (): HTMLInputElement =>
  screen.getByPlaceholderText("表示するテキスト (省略可)") as HTMLInputElement;

// when: <LinkModal /> をマウントしてフォーム操作する
describe("LinkModal", () => {
  describe("初期表示", () => {
    test("defaultLabel / defaultUrl が input に反映できる", () => {
      setup({ defaultLabel: "L", defaultUrl: "https://e.x" });
      expect(urlInput().value).toBe("https://e.x");
      expect(labelInput().value).toBe("L");
    });

    test("マウント時に url input にフォーカスが当たる", () => {
      setup({ defaultUrl: "https://e.x" });
      expect(document.activeElement).toBe(urlInput());
    });
  });

  describe("入力", () => {
    test("url input の編集を反映できる", () => {
      setup();
      fireEvent.change(urlInput(), { target: { value: "https://new.x" } });
      expect(urlInput().value).toBe("https://new.x");
    });

    test("label input の編集を反映できる", () => {
      setup();
      fireEvent.change(labelInput(), { target: { value: "new label" } });
      expect(labelInput().value).toBe("new label");
    });
  });

  describe("挿入ボタン (submit)", () => {
    test("url が入っていれば onApply に label と url を渡せる", () => {
      const { onApply } = setup({ defaultLabel: "L", defaultUrl: "https://e.x" });
      fireEvent.mouseDown(screen.getByRole("button", { name: "挿入" }));
      expect(onApply).toHaveBeenCalledWith("L", "https://e.x");
    });

    test("url が空のまま挿入を押すと onCancel を呼べる", () => {
      const { onApply, onCancel } = setup({ defaultUrl: "" });
      fireEvent.mouseDown(screen.getByRole("button", { name: "挿入" }));
      expect(onCancel).toHaveBeenCalled();
      expect(onApply).not.toHaveBeenCalled();
    });

    test("url の前後空白は除いて onApply に渡せる", () => {
      const { onApply } = setup({ defaultUrl: "  https://e.x  ", defaultLabel: "L" });
      fireEvent.mouseDown(screen.getByRole("button", { name: "挿入" }));
      expect(onApply).toHaveBeenCalledWith("L", "https://e.x");
    });
  });

  describe("キーボード操作", () => {
    test("url input で Enter を押すと submit できる", () => {
      const { onApply } = setup({ defaultLabel: "L", defaultUrl: "https://e.x" });
      fireEvent.keyDown(urlInput(), { key: "Enter" });
      expect(onApply).toHaveBeenCalledWith("L", "https://e.x");
    });

    test("label input で Enter を押しても submit できる", () => {
      const { onApply } = setup({ defaultLabel: "L", defaultUrl: "https://e.x" });
      fireEvent.keyDown(labelInput(), { key: "Enter" });
      expect(onApply).toHaveBeenCalled();
    });

    test("url input で Escape を押すと onCancel を呼べる", () => {
      const { onCancel } = setup();
      fireEvent.keyDown(urlInput(), { key: "Escape" });
      expect(onCancel).toHaveBeenCalled();
    });

    test("label input で Escape を押しても onCancel を呼べる", () => {
      const { onCancel } = setup();
      fireEvent.keyDown(labelInput(), { key: "Escape" });
      expect(onCancel).toHaveBeenCalled();
    });

    test("IME 変換中の Enter は submit を発火させない", () => {
      const { onApply } = setup({ defaultUrl: "https://e.x" });
      fireEvent.keyDown(urlInput(), { key: "Enter", isComposing: true });
      expect(onApply).not.toHaveBeenCalled();
    });
  });

  describe("キャンセルボタン", () => {
    test("キャンセルを押すと onCancel を呼べる", () => {
      const { onCancel } = setup();
      fireEvent.mouseDown(screen.getByRole("button", { name: "キャンセル" }));
      expect(onCancel).toHaveBeenCalled();
    });
  });
});
