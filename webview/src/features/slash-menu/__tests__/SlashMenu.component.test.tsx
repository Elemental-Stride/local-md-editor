import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { SLASH_ITEMS, SlashMenu } from "../SlashMenu.js";

// when: <SlashMenu /> をマウントしてアイテム描画とクリックを観測する
describe("SlashMenu (component)", () => {
  describe("空", () => {
    test("items が空のときは「該当なし」プレースホルダを表示できる", () => {
      render(<SlashMenu items={[]} selectedIndex={0} onSelect={vi.fn()} />);
      expect(screen.getByText("該当なし")).toBeInTheDocument();
    });
  });

  describe("リスト描画", () => {
    test("items の label と hint を全件表示できる", () => {
      render(<SlashMenu items={SLASH_ITEMS} selectedIndex={0} onSelect={vi.fn()} />);
      expect(screen.getByText("テキスト")).toBeInTheDocument();
      expect(screen.getByText("/text")).toBeInTheDocument();
      expect(screen.getByText("見出し 1")).toBeInTheDocument();
    });

    test("ボタンの個数が items 数と一致する", () => {
      render(<SlashMenu items={SLASH_ITEMS} selectedIndex={0} onSelect={vi.fn()} />);
      expect(screen.getAllByRole("button")).toHaveLength(SLASH_ITEMS.length);
    });
  });

  describe("クリック", () => {
    test("onMouseDown で該当 item を onSelect に渡せる", () => {
      const onSelect = vi.fn();
      render(<SlashMenu items={SLASH_ITEMS} selectedIndex={0} onSelect={onSelect} />);
      const h1Item = SLASH_ITEMS.find((i) => i.id === "h1")!;
      fireEvent.mouseDown(screen.getByText("見出し 1"));
      expect(onSelect).toHaveBeenCalledWith(h1Item);
    });
  });
});
