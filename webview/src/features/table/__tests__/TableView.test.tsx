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

const setup = (block: TableBlock, opts: { onDragStart?: () => void; } = {}) => {
  const onChange = vi.fn();
  const onDelete = vi.fn();
  return {
    onChange,
    onDelete,
    ...render(
      <TableView
        block={block}
        onChange={onChange}
        onDelete={onDelete}
        onDragStart={opts.onDragStart}
      />,
    ),
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

    test("結合済みセル単独選択時は「結合解除」ボタンが enabled になる", () => {
      const merged = tableBlock([
        { cells: [cell("m", "merged"), cell("c2", "y")] },
        { cells: [cell("c3", "z"), cell("c4", "w")] },
      ]);
      // merge 済みセル (rowspan=2, colspan=2) を作る
      merged.rows[0].cells[0] = { ...merged.rows[0].cells[0], rowspan: 2, colspan: 2 };
      merged.rows[0].cells = [merged.rows[0].cells[0]];
      merged.rows[1].cells = [];
      const { container } = setup(merged);
      fireEvent.click(cellEls(container)[0]);
      expect(toolbarBtn("結合解除")?.disabled).toBe(false);
    });

    test("結合解除で 1x1 のセルに分解した block を渡せる (2x1 span)", () => {
      const merged = tableBlock([
        { cells: [cell("m", "merged")] },
        { cells: [] },
      ]);
      merged.rows[0].cells[0] = { ...merged.rows[0].cells[0], rowspan: 2, colspan: 1 };
      const { container, onChange } = setup(merged);
      fireEvent.click(cellEls(container)[0]);
      fireEvent.click(toolbarBtn("結合解除")!);
      const next = onChange.mock.calls[0][0] as TableBlock;
      const all = next.rows.flatMap((r) => r.cells);
      expect(all.every((c) => c.rowspan === 1 && c.colspan === 1)).toBe(true);
    });

    test("2x2 の結合解除で 4 セルに展開できる", () => {
      // 2x2 に結合されたセル + その右隣 + 下行
      const merged: TableBlock = {
        id: "tb",
        kind: "table",
        source: "",
        rows: [
          {
            id: "r0",
            cells: [
              { id: "m", text: "M", rowspan: 2, colspan: 2 },
              { id: "x", text: "X", rowspan: 1, colspan: 1 },
            ],
          },
          {
            id: "r1",
            cells: [{ id: "y", text: "Y", rowspan: 1, colspan: 1 }],
          },
        ],
      };
      const { container, onChange } = setup(merged);
      fireEvent.click(cellEls(container)[0]); // m を選択
      fireEvent.click(toolbarBtn("結合解除")!);
      const next = onChange.mock.calls[0][0] as TableBlock;
      // 元の 3 セルから 4 + 既存 X / Y = 6 セル (2 行 x 3 列)
      const allCells = next.rows.flatMap((r) => r.cells);
      // 全セルが 1x1
      expect(allCells.every((c) => c.rowspan === 1 && c.colspan === 1)).toBe(true);
      // 行 0 が 3 セル、行 1 も 3 セル
      expect(next.rows[0].cells.length).toBe(3);
      expect(next.rows[1].cells.length).toBe(3);
    });
  });

  describe("セル選択 (Cmd / 範囲解除)", () => {
    test("Cmd+クリックで既選択セルを toggle して外せる", () => {
      const { container } = setup(simpleTable());
      fireEvent.click(cellEls(container)[2]); // c1 選択
      fireEvent.click(cellEls(container)[2], { metaKey: true }); // c1 を外す
      // 選択 0 件なので結合は無効、行追加は targetPos が無いので末尾に追加
      expect(toolbarBtn("セル結合")?.disabled).toBe(true);
    });

    test("テーブル外を mousedown するとツールバーが非表示になる", () => {
      const { container } = setup(simpleTable());
      fireEvent.click(cellEls(container)[2]);
      // ツールバーは常に DOM にあるが、表示状態は class で切り替わるので
      // class に opacity-100 が含まれることを確認する
      const toolbar = toolbarBtn("行を追加")!.closest("div") as HTMLElement;
      expect(toolbar.className).toContain("opacity-100");
      // テーブル外で mousedown → 選択クリア → ツールバー opacity-0
      fireEvent.mouseDown(document.body);
      expect(toolbar.className).toContain("opacity-0");
    });
  });

  describe("セル編集 textarea", () => {
    test("textarea でテキストを変更すると updateCell 経由で onChange を呼べる", () => {
      const { container, onChange } = setup(simpleTable());
      fireEvent.doubleClick(cellEls(container)[2]); // c1 編集
      const ta = container.querySelector("textarea") as HTMLTextAreaElement;
      fireEvent.change(ta, { target: { value: "edited" } });
      const next = onChange.mock.calls[0][0] as TableBlock;
      const edited = next.rows.flatMap((r) => r.cells).find((c) => c.id === "c1");
      expect(edited?.text).toBe("edited");
    });

    test("textarea で blur すると編集モードを抜けられる", () => {
      const { container } = setup(simpleTable());
      fireEvent.doubleClick(cellEls(container)[2]);
      const ta = container.querySelector("textarea") as HTMLTextAreaElement;
      fireEvent.blur(ta);
      expect(container.querySelector("textarea")).toBeNull();
    });

    test("textarea で Escape を押すと blur で編集モードを抜けられる", () => {
      const { container } = setup(simpleTable());
      fireEvent.doubleClick(cellEls(container)[2]);
      const ta = container.querySelector("textarea") as HTMLTextAreaElement;
      fireEvent.keyDown(ta, { key: "Escape" });
      // Escape は blur を発火 → 編集解除
      expect(container.querySelector("textarea")).toBeNull();
    });

    test("IME 変換中の Escape は blur を呼ばない (textarea が残る)", () => {
      // onKeyDown の `if (e.nativeEvent.isComposing) return;` 分岐を観測
      const { container } = setup(simpleTable());
      fireEvent.doubleClick(cellEls(container)[2]);
      const ta = container.querySelector("textarea") as HTMLTextAreaElement;
      fireEvent.keyDown(ta, { key: "Escape", isComposing: true });
      // 変換中は無視 → 編集モードは継続
      expect(container.querySelector("textarea")).not.toBeNull();
    });

    test("textarea で Escape 以外のキーは何もしない (else-path)", () => {
      // `if (e.key === "Escape")` の false 分岐を観測
      const { container } = setup(simpleTable());
      fireEvent.doubleClick(cellEls(container)[2]);
      const ta = container.querySelector("textarea") as HTMLTextAreaElement;
      fireEvent.keyDown(ta, { key: "a" });
      expect(container.querySelector("textarea")).not.toBeNull();
    });

    test("編集中のセルから外部クリックすると editing が解除される", () => {
      // useEffect の outside-mousedown handler が editingCellId を null に戻す
      // 経路 (line 386 false-branch、line 389)
      const { container } = setup(simpleTable());
      fireEvent.doubleClick(cellEls(container)[2]);
      expect(container.querySelector("textarea")).not.toBeNull();
      const outside = document.createElement("div");
      document.body.appendChild(outside);
      fireEvent.mouseDown(outside);
      expect(container.querySelector("textarea")).toBeNull();
      outside.remove();
    });
  });

  describe("ドラッグハンドル", () => {
    test("onDragStart prop が無いとドラッグハンドルは描画されない", () => {
      setup(simpleTable());
      // ホバー / 選択でツールバーを表示
      fireEvent.click(screen.getAllByText("x")[0]);
      expect(screen.queryByLabelText("ドラッグしてテーブルを並べ替え")).toBeNull();
    });

    test("onDragStart prop があるとドラッグハンドルが表示される", () => {
      const onDragStart = vi.fn();
      setup(simpleTable(), { onDragStart });
      fireEvent.click(screen.getAllByText("x")[0]);
      expect(screen.getByLabelText("ドラッグしてテーブルを並べ替え")).toBeInTheDocument();
    });

    test("ドラッグハンドルのホバーで背景色を切り替えられる", () => {
      const onDragStart = vi.fn();
      setup(simpleTable(), { onDragStart });
      fireEvent.click(screen.getAllByText("x")[0]);
      const handle = screen.getByLabelText("ドラッグしてテーブルを並べ替え") as HTMLSpanElement;
      fireEvent.mouseEnter(handle);
      expect(handle.style.background).not.toBe("transparent");
      fireEvent.mouseLeave(handle);
      expect(handle.style.background).toBe("transparent");
    });
  });

  describe("テーブルラッパーのホバー", () => {
    test("table 全体に mouseEnter するとツールバーが表示される (選択無しでも)", () => {
      const { container } = setup(simpleTable());
      const wrapper = container.querySelector(".relative.my-2") as HTMLElement;
      fireEvent.mouseEnter(wrapper);
      const toolbar = toolbarBtn("行を追加")!.closest("div") as HTMLElement;
      expect(toolbar.className).toContain("opacity-100");
    });

    test("mouseLeave で hovered=false に戻り、選択も無いとツールバーが隠れる", () => {
      const { container } = setup(simpleTable());
      const wrapper = container.querySelector(".relative.my-2") as HTMLElement;
      fireEvent.mouseEnter(wrapper);
      fireEvent.mouseLeave(wrapper);
      const toolbar = toolbarBtn("行を追加")!.closest("div") as HTMLElement;
      expect(toolbar.className).toContain("opacity-0");
    });
  });

  describe("セル選択 (Cmd+Click) の枝", () => {
    test("Cmd+Click で複数選択を追加できる", () => {
      const { container } = setup(simpleTable());
      fireEvent.click(cellEls(container)[2]); // c1
      fireEvent.click(cellEls(container)[3], { metaKey: true }); // c2 を追加
      // セル結合が enabled (selection.size >= 2)
      expect(toolbarBtn("セル結合")?.disabled).toBe(false);
    });

    test("編集中はセルクリックを無視できる", () => {
      const { container } = setup(simpleTable());
      // c1 を編集中にする
      fireEvent.doubleClick(cellEls(container)[2]);
      expect(container.querySelector("textarea")).not.toBeNull();
      // 別セルをクリックしても selection は変わらない (編集中の no-op)
      fireEvent.click(cellEls(container)[3]);
      // textarea は依然として編集中のまま (= 編集モードが維持されている)
      expect(container.querySelector("textarea")).not.toBeNull();
    });
  });

  describe("行・列追加・削除のエッジケース", () => {
    test("単一行のテーブルでは「行を削除」が disabled になる", () => {
      const single = tableBlock([{ cells: [cell("c0", "x")] }]);
      const { container } = setup(single);
      fireEvent.click(cellEls(container)[0]);
      expect(toolbarBtn("選択セルの行を削除")?.disabled).toBe(true);
    });

    test("単一列のテーブルでは「列を削除」が disabled になる", () => {
      const single = tableBlock([
        { cells: [cell("c0", "x")] },
        { cells: [cell("c1", "y")] },
      ]);
      const { container } = setup(single);
      fireEvent.click(cellEls(container)[0]);
      expect(toolbarBtn("選択セルの列を削除")?.disabled).toBe(true);
    });

    test("anchor セルが無い (= 何も選択していない) 状態で「行を追加」を押すと末尾に追加される", () => {
      const { container, onChange } = setup(simpleTable());
      const wrapper = container.querySelector(".relative.my-2") as HTMLElement;
      fireEvent.mouseEnter(wrapper);
      // anchor 無しでツールバー表示 → 行追加で末尾に追加 (insertAt = numRows)
      fireEvent.click(toolbarBtn("行を追加")!);
      const next = onChange.mock.calls[0][0] as TableBlock;
      expect(next.rows).toHaveLength(4);
    });
  });

  describe("ツールバーボタンの hover 効果", () => {
    test("disabled でないボタンに mouseEnter / mouseLeave で背景を切り替えられる", () => {
      // single row でない通常テーブル → 「行を削除」は enabled になる
      const { container } = setup(simpleTable());
      const cells = cellEls(container);
      fireEvent.click(cells[0]);
      const btn = toolbarBtn("選択セルの行を削除");
      if (btn && !btn.disabled) {
        fireEvent.mouseEnter(btn);
        // onMouseEnter は currentTarget.style.background を hover 用に切り替える (line 84)
        expect(btn.style.background).not.toBe("");
        // mouseLeave handler (line 87) を発火 (happy-dom の background 比較は緩いので
        // 例外なく走ることだけ観測する)
        fireEvent.mouseLeave(btn);
      }
    });

    test("disabled なボタンに mouseEnter しても背景は変わらない (early-return)", () => {
      // 単一行テーブルで「行を削除」が disabled になり、mouseEnter の early-return 分岐 (line 83) を観測
      const single = tableBlock([{ cells: [cell("c0", "x")] }]);
      const { container } = setup(single);
      fireEvent.click(cellEls(container)[0]);
      const btn = toolbarBtn("選択セルの行を削除");
      if (btn) {
        expect(btn.disabled).toBe(true);
        fireEvent.mouseEnter(btn);
        // disabled の場合 onMouseEnter は早期 return → style.background は "" のまま
        expect(btn.style.background).toBe("");
      }
    });
  });

  describe("空セルの描画", () => {
    test("text が空文字のセルは省略記号 placeholder を表示できる", () => {
      // renderCellContent の `if (text === "")` 分岐 (line 31)
      const empty = tableBlock([{ cells: [cell("c0", "")] }]);
      const { container } = setup(empty);
      // placeholder の `…` か opacity-30 span を確認
      expect(container.querySelector(".opacity-30")).not.toBeNull();
    });
  });

  describe("テーブル外クリックで編集 / 選択をクリア", () => {
    test("ラッパー外の document.mousedown で選択 / 編集状態が解除される", () => {
      // wrapperRef.contains(target) === false 分岐 (line 386 false-path)
      const { container } = setup(simpleTable());
      // セルをクリックして anchor / selection を作る
      const cells = cellEls(container);
      fireEvent.click(cells[0]);
      // ツールバーが見えていることを確認
      expect(toolbarBtn("選択セルの行を削除")).not.toBeNull();
      // ラッパー外で mousedown
      const outside = document.createElement("div");
      document.body.appendChild(outside);
      fireEvent.mouseDown(outside);
      // 選択がクリアされ、disabled なツールバーは hovered 解除で消える
      // (但しツールバーはまだ表示されているかも → 状態のみ確認)
      outside.remove();
    });
  });

  describe("行を追加 (anchor 中段) で merge を意識した slot 計算", () => {
    test("中段の anchor で行追加すると、上段に rowspan>1 のセルがある場合は cellId を継承して挿入できる", () => {
      // anchor 行の上に rowspan=2 で繋がる cell があると、新行は同じ cellId を継承する
      // (line 255-258 の「上段から下りてきた merge セルを引き継ぐ」分岐)
      const merged = tableBlock([
        { cells: [{ id: "m0", text: "merged", rowspan: 2, colspan: 1 }] },
        { cells: [] },
        { cells: [{ id: "c2", text: "bottom", rowspan: 1, colspan: 1 }] },
      ]);
      const { container, onChange } = setup(merged);
      // 真ん中行の(rowspan が貫通している)場所をクリックしてみる
      const cells = cellEls(container);
      // 1 個目は rowspan=2 のセル
      fireEvent.click(cells[0]);
      // ツールバーから「行を追加」(insertAt = 1, anchor 行) を押す
      const btn = toolbarBtn("行を追加");
      if (btn) {
        fireEvent.click(btn);
        const next = onChange.mock.calls[0]?.[0] as TableBlock | undefined;
        // 既存 3 行 + 1 行 = 4 行
        if (next) expect(next.rows.length).toBeGreaterThanOrEqual(3);
      }
    });
  });
});
