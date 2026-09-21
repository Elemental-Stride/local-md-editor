import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TableCellEditor } from "../TableCellEditor.js";

const setup = (value: string) => {
  const onChange = vi.fn();
  const onBlur = vi.fn();
  const { container, rerender } = render(
    <TableCellEditor value={value} onChange={onChange} onBlur={onBlur} />,
  );
  return {
    onChange,
    onBlur,
    // 制御コンポーネントなので、値の更新は親からの再描画で再現する。
    setValue: (next: string) =>
      rerender(<TableCellEditor value={next} onChange={onChange} onBlur={onBlur} />),
    ta: container.querySelector("textarea") as HTMLTextAreaElement,
  };
};

// happy-dom はレイアウトを持たず scrollHeight が常に 0 なので、
// 折り返し後の高さを再現するために getter を差し替える。
const stubScrollHeight = (px: number): void => {
  Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => px,
  });
};

afterEach(() => {
  Reflect.deleteProperty(HTMLTextAreaElement.prototype, "scrollHeight");
});

// when: <TableCellEditor /> をマウントしてセルを編集する
describe("TableCellEditor", () => {
  describe("折り返しの維持", () => {
    test("折り返した内容の高さに合わせて height を設定できる", () => {
      stubScrollHeight(48);
      const { ta } = setup("とても長いセルの文章");
      expect(ta.style.height).toBe("48px");
    });

    test("内容が変わると height を計算し直せる", () => {
      stubScrollHeight(48);
      const { ta, setValue } = setup("一行");
      stubScrollHeight(72);
      setValue("さらに長くなった文章");
      expect(ta.style.height).toBe("72px");
    });

    test("内部スクロールを持たない折り返し用のクラスを持てる", () => {
      const { ta } = setup("text");
      expect(ta.className).toContain("whitespace-pre-wrap");
      expect(ta.className).toContain("break-words");
      expect(ta.className).toContain("overflow-hidden");
    });

    test("cols を 1 にして列幅を押し広げずに済ませられる", () => {
      const { ta } = setup("text");
      expect(ta.getAttribute("cols")).toBe("1");
    });
  });

  describe("編集開始時のキャレット", () => {
    test("開いた直後はキャレットを末尾に置ける", () => {
      const { ta } = setup("abcd");
      expect(ta.selectionStart).toBe(4);
      expect(ta.selectionEnd).toBe(4);
    });

    test("空セルでもキャレットを先頭 (= 末尾) に置ける", () => {
      const { ta } = setup("");
      expect(ta.selectionStart).toBe(0);
    });
  });

  describe("編集操作", () => {
    test("入力した内容を onChange に渡せる", () => {
      const { ta, onChange } = setup("old");
      fireEvent.change(ta, { target: { value: "new" } });
      expect(onChange).toHaveBeenCalledWith("new");
    });

    test("blur で onBlur を呼べる", () => {
      const { ta, onBlur } = setup("text");
      fireEvent.blur(ta);
      expect(onBlur).toHaveBeenCalled();
    });

    test("Escape で blur して編集を抜けられる", () => {
      const { ta, onBlur } = setup("text");
      ta.focus();
      fireEvent.keyDown(ta, { key: "Escape" });
      expect(onBlur).toHaveBeenCalled();
    });

    test("IME 変換中の Escape では編集を続けられる", () => {
      const { ta, onBlur } = setup("text");
      ta.focus();
      fireEvent.keyDown(ta, { key: "Escape", isComposing: true });
      expect(onBlur).not.toHaveBeenCalled();
    });
  });
});
