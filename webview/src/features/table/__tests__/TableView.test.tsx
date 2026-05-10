import type { TableBlock } from "@local-md-editor/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("../../../vscode.js", () => ({
  post: vi.fn(),
  onMessage: () => () => {},
}));
vi.mock("../../../resources.js", () => ({
  classifyUrl: () => ({ kind: "remote" }),
  useResolvedUri: () => null,
}));

import { TableView } from "../TableView.js";

const cell = (id: string, text: string, isHeader = false) => ({
  id,
  text,
  rowspan: 1,
  colspan: 1,
  ...(isHeader ? { isHeader: true } : {}),
});

const tableBlock = (
  rows: { cells: ReturnType<typeof cell>[]; }[],
): TableBlock => ({
  id: "tb",
  kind: "table",
  source: "",
  rows: rows.map((r, i) => ({ id: `r${i}`, cells: r.cells })),
});

const setup = (block: TableBlock) => {
  const onChange = vi.fn();
  const onDelete = vi.fn();
  return {
    onChange,
    onDelete,
    ...render(<TableView block={block} onChange={onChange} onDelete={onDelete} />),
  };
};

const simpleTable = () =>
  tableBlock([
    { cells: [cell("h1", "A", true), cell("h2", "B", true)] },
    { cells: [cell("c1", "x"), cell("c2", "y")] },
    { cells: [cell("c3", "z"), cell("c4", "w")] },
  ]);

const cellEls = (container: HTMLElement) =>
  container.querySelectorAll("td, th") as NodeListOf<HTMLTableCellElement>;

const toolbarBtn = (label: string): HTMLButtonElement | null =>
  screen.queryByLabelText(label) as HTMLButtonElement | null;

// when: <TableView /> をマウントしてセル選択 / 編集 / 構造変更する
describe("TableView", () => {
  describe("基本描画", () => {
    test("rows / cells から <table>/<tr>/<td>/<th> を構成できる", () => {
      const { container } = setup(simpleTable());
      expect(container.querySelector("table")).not.toBeNull();
      expect(container.querySelectorAll("tr")).toHaveLength(3);
      expect(container.querySelectorAll("th")).toHaveLength(2);
      expect(container.querySelectorAll("td")).toHaveLength(4);
    });

    test("セルテキストを描画できる", () => {
      const { container } = setup(simpleTable());
      expect(container.textContent).toContain("A");
      expect(container.textContent).toContain("z");
    });
  });

  describe("セル選択", () => {
    test("セルクリックでツールバー (行/列追加 など) が表示される", () => {
      const { container } = setup(simpleTable());
      fireEvent.click(cellEls(container)[2]);
      expect(toolbarBtn("行を追加")).not.toBeNull();
    });

    test("単一セル選択ではセル結合が disabled になる", () => {
      const { container } = setup(simpleTable());
      fireEvent.click(cellEls(container)[2]);
      expect(toolbarBtn("セル結合")?.disabled).toBe(true);
    });

    test("複数選択 (Shift+クリック) でセル結合が enabled になる", () => {
      const { container } = setup(simpleTable());
      fireEvent.click(cellEls(container)[2]);
      fireEvent.click(cellEls(container)[3], { shiftKey: true });
      expect(toolbarBtn("セル結合")?.disabled).toBe(false);
    });
  });

  describe("セル編集", () => {
    test("セルをダブルクリックで textarea を出せる", () => {
      const { container } = setup(simpleTable());
      fireEvent.doubleClick(cellEls(container)[2]);
      expect(container.querySelector("textarea")).not.toBeNull();
    });
  });

  describe("行・列の追加", () => {
    test("「行を追加」で rows 数が増えた block を渡せる", () => {
      const { container, onChange } = setup(simpleTable());
      fireEvent.click(cellEls(container)[2]);
      fireEvent.click(toolbarBtn("行を追加")!);
      const next = onChange.mock.calls[0][0] as TableBlock;
      expect(next.rows).toHaveLength(4);
    });

    test("「列を追加」で各行のセル数が増えた block を渡せる", () => {
      const { container, onChange } = setup(simpleTable());
      fireEvent.click(cellEls(container)[2]);
      fireEvent.click(toolbarBtn("列を追加")!);
      const next = onChange.mock.calls[0][0] as TableBlock;
      expect(next.rows[0].cells).toHaveLength(3);
    });
  });

  describe("行・列の削除", () => {
    test("「選択セルの行を削除」で行を 1 つ減らせる", () => {
      const { container, onChange } = setup(simpleTable());
      fireEvent.click(cellEls(container)[2]);
      fireEvent.click(toolbarBtn("選択セルの行を削除")!);
      const next = onChange.mock.calls[0][0] as TableBlock;
      expect(next.rows).toHaveLength(2);
    });

    test("「選択セルの列を削除」で列を 1 つ減らせる", () => {
      const { container, onChange } = setup(simpleTable());
      fireEvent.click(cellEls(container)[2]);
      fireEvent.click(toolbarBtn("選択セルの列を削除")!);
      const next = onChange.mock.calls[0][0] as TableBlock;
      expect(next.rows[0].cells).toHaveLength(1);
    });
  });

  describe("テーブル削除", () => {
    test("「テーブルを削除」で onDelete を呼べる", () => {
      const { container, onDelete } = setup(simpleTable());
      fireEvent.click(cellEls(container)[2]);
      fireEvent.click(toolbarBtn("テーブルを削除")!);
      expect(onDelete).toHaveBeenCalled();
    });
  });

  describe("セル結合 (merge)", () => {
    test("複数選択して結合すると rowspan/colspan を持つ block を渡せる", () => {
      const { container, onChange } = setup(simpleTable());
      fireEvent.click(cellEls(container)[2]); // c1
      fireEvent.click(cellEls(container)[3], { shiftKey: true }); // c2
      fireEvent.click(toolbarBtn("セル結合")!);
      const next = onChange.mock.calls[0][0] as TableBlock;
      const merged = next.rows.flatMap((r) => r.cells).find(
        (c) => (c.colspan ?? 1) > 1 || (c.rowspan ?? 1) > 1,
      );
      expect(merged).toBeDefined();
    });
  });
});
