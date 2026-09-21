import { documentToMarkdown, type TableBlock } from "@local-md-editor/shared";
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

import { nearestBoundary, TableView } from "../TableView.js";

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

// グリップ用セルを除いた本文セルだけを拾う。
const cellEls = (container: HTMLElement) =>
  container.querySelectorAll("[data-cell-id]") as NodeListOf<HTMLTableCellElement>;

const wrapperOf = (container: HTMLElement) =>
  container.querySelector(".relative.my-2") as HTMLElement;

const toolbarBtn = (label: string): HTMLButtonElement | null =>
  screen.queryByLabelText(label) as HTMLButtonElement | null;

const ctrl = (label: string): HTMLButtonElement =>
  screen.getByLabelText(label) as HTMLButtonElement;

// セルにカーソルを乗せると、その行と列のコントロールが現れる。
const hoverCell = (container: HTMLElement, index: number): void => {
  fireEvent.mouseEnter(cellEls(container)[index]);
};

// 列 / 行の帯にある当たり判定領域にカーソルを乗せる（削除の − 用）。
const hoverZone = (container: HTMLElement, zoneId: string): void => {
  fireEvent.mouseEnter(container.querySelector(`[data-zone="${zoneId}"]`) as HTMLElement);
};

// 罫線ホバーはカーソル座標と帯セルの矩形の距離で判定する。happy-dom は
// 実レイアウトを持たず矩形がすべて 0 になるので、帯セルの矩形を差し替えて
// から mousemove を起こす。
const COLUMN_W = 60;
const ROW_H = 30;
const TABLE_LEFT = 100;
const TABLE_TOP = 20;

const fakeRect = (
  box: { left: number; right: number; top: number; bottom: number; },
): DOMRect =>
  ({
    ...box,
    x: box.left,
    y: box.top,
    width: box.right - box.left,
    height: box.bottom - box.top,
    toJSON: () => ({}),
  }) as DOMRect;

const stubBarRects = (container: HTMLElement): void => {
  container.querySelectorAll<HTMLElement>("[data-column-bar]").forEach((el, i) => {
    el.getBoundingClientRect = () =>
      fakeRect({
        left: TABLE_LEFT + i * COLUMN_W,
        right: TABLE_LEFT + (i + 1) * COLUMN_W,
        top: 0,
        bottom: TABLE_TOP,
      });
  });
  container.querySelectorAll<HTMLElement>("[data-row-bar]").forEach((el, i) => {
    el.getBoundingClientRect = () =>
      fakeRect({
        left: TABLE_LEFT - 40,
        right: TABLE_LEFT,
        top: TABLE_TOP + i * ROW_H,
        bottom: TABLE_TOP + (i + 1) * ROW_H,
      });
  });
};

const moveTo = (container: HTMLElement, clientX: number, clientY: number): void => {
  stubBarRects(container);
  fireEvent.mouseMove(container.querySelector("table") as HTMLElement, { clientX, clientY });
};

// 指定した列境界 (0 = 先頭) の罫線にカーソルを寄せる。行の罫線からは十分離す。
const hoverColumnLine = (container: HTMLElement, index: number): void => {
  moveTo(container, TABLE_LEFT + index * COLUMN_W, 9999);
};

const hoverRowLine = (container: HTMLElement, index: number): void => {
  moveTo(container, 9999, TABLE_TOP + index * ROW_H);
};

const firstOnChange = (onChange: ReturnType<typeof vi.fn>): TableBlock =>
  onChange.mock.calls[0][0] as TableBlock;

// when: nearestBoundary(edges, pos) を呼ぶ
describe("nearestBoundary", () => {
  // 幅 60 の帯が 3 つ並んだ状態。境界は 0 / 60 / 120 / 180。
  const edges = [
    { start: 0, end: 60 },
    { start: 60, end: 120 },
    { start: 120, end: 180 },
  ];

  describe("近い境界を選ぶ", () => {
    test("先頭の境界に寄っていれば 0 とその距離を返せる", () => {
      expect(nearestBoundary(edges, 4)).toEqual({ index: 0, distance: 4 });
    });

    test("帯と帯の境界に寄っていればその番号を返せる", () => {
      expect(nearestBoundary(edges, 62)?.index).toBe(1);
    });

    test("末尾の境界に寄っていれば帯の数と同じ番号を返せる", () => {
      expect(nearestBoundary(edges, 178)?.index).toBe(3);
    });

    test("境界のちょうど上なら距離 0 としてその番号を返せる", () => {
      expect(nearestBoundary(edges, 120)).toEqual({ index: 2, distance: 0 });
    });
  });

  describe("境界から離れているとき", () => {
    test("どの境界からも離れていれば null を返す", () => {
      expect(nearestBoundary(edges, 90)).toBeNull();
    });

    test("帯が 1 つも無ければ null を返す", () => {
      expect(nearestBoundary([], 0)).toBeNull();
    });
  });
});

// when: <TableView /> をマウントしてセル選択 / 編集 / 構造変更する
describe("TableView", () => {
  describe("基本描画", () => {
    test("rows / cells から <table>/<tr>/<td>/<th> を構成できる", () => {
      const { container } = setup(simpleTable());
      expect(container.querySelector("table")).not.toBeNull();
      // 本文 3 行 + 先頭の列グリップ行
      expect(container.querySelectorAll("tr")).toHaveLength(4);
      expect(container.querySelectorAll("th[data-cell-id]")).toHaveLength(2);
      expect(container.querySelectorAll("td[data-cell-id]")).toHaveLength(4);
    });

    test("セルテキストを描画できる", () => {
      const { container } = setup(simpleTable());
      expect(container.textContent).toContain("A");
      expect(container.textContent).toContain("z");
    });
  });

  describe("コントロールの出し分け", () => {
    test("カーソルが乗るまでは ＋ も − も隠しておける", () => {
      setup(simpleTable());
      expect(toolbarBtn("1 列目を削除")).toBeNull();
      expect(toolbarBtn("先頭に列を追加")).toBeNull();
    });

    test("セルの上では − を出さず無地のままにできる", () => {
      const { container } = setup(simpleTable());
      hoverCell(container, 2); // 2 行目 1 列目
      expect(toolbarBtn("1 列目を削除")).toBeNull();
      expect(toolbarBtn("2 行目を削除")).toBeNull();
    });

    test("上の帯に入ると列の − だけを出せる", () => {
      const { container } = setup(simpleTable());
      hoverZone(container, "column-body-0");
      expect(ctrl("1 列目を削除")).toBeInTheDocument();
      expect(toolbarBtn("1 行目を削除")).toBeNull();
    });

    test("左の帯に入ると行の − だけを出せる", () => {
      const { container } = setup(simpleTable());
      hoverZone(container, "row-body-1");
      expect(ctrl("2 行目を削除")).toBeInTheDocument();
      expect(toolbarBtn("1 列目を削除")).toBeNull();
    });

    test("帯から出ると − を片付けられる", () => {
      const { container } = setup(simpleTable());
      hoverZone(container, "column-body-0");
      fireEvent.mouseLeave(
        container.querySelector('[data-zone="column-body-0"]') as HTMLElement,
      );
      expect(toolbarBtn("1 列目を削除")).toBeNull();
    });

    test("罫線にカーソルを乗せるとその線の ＋ だけを出せる", () => {
      const { container } = setup(simpleTable());
      hoverColumnLine(container, 1);
      expect(ctrl("1 列目と 2 列目の間に列を追加")).toBeInTheDocument();
      expect(toolbarBtn("1 列目を削除")).toBeNull();
    });

    test("隣の罫線の ＋ は出さずカーソルのある 1 本だけに出せる", () => {
      const { container } = setup(simpleTable());
      hoverColumnLine(container, 1);
      expect(toolbarBtn("先頭に列を追加")).toBeNull();
      expect(toolbarBtn("末尾に列を追加")).toBeNull();
    });

    test("テーブルから離れるとコントロールを片付けられる", () => {
      const { container } = setup(simpleTable());
      hoverZone(container, "column-body-0");
      hoverColumnLine(container, 1);
      fireEvent.mouseLeave(wrapperOf(container));
      expect(toolbarBtn("1 列目を削除")).toBeNull();
      expect(toolbarBtn("1 列目と 2 列目の間に列を追加")).toBeNull();
    });
  });

  describe("縦横の罫線が近いとき", () => {
    test("交点付近では近い方の罫線 1 本にだけ ＋ を出せる", () => {
      const { container } = setup(simpleTable());
      // 列境界 1 に 2px、行境界 1 に 8px の位置 → 列側だけが出る
      moveTo(container, TABLE_LEFT + COLUMN_W + 2, TABLE_TOP + ROW_H + 8);
      expect(ctrl("1 列目と 2 列目の間に列を追加")).toBeInTheDocument();
      expect(toolbarBtn("1 行目と 2 行目の間に行を追加")).toBeNull();
    });
  });

  describe("罫線の ＋ による列の挿入", () => {
    test("先頭の罫線で先頭に列を追加できる", () => {
      const { container, onChange } = setup(simpleTable());
      hoverColumnLine(container, 0);
      fireEvent.click(ctrl("先頭に列を追加"));
      const next = firstOnChange(onChange);
      expect(next.rows[0].cells).toHaveLength(3);
      expect(next.rows[0].cells[0].text).toBe("");
    });

    test("列と列の間の罫線でその位置に列を追加できる", () => {
      const { container, onChange } = setup(simpleTable());
      hoverColumnLine(container, 1);
      fireEvent.click(ctrl("1 列目と 2 列目の間に列を追加"));
      const next = firstOnChange(onChange);
      expect(next.rows[0].cells).toHaveLength(3);
      expect(next.rows[0].cells[1].text).toBe("");
    });

    test("末尾の罫線で末尾に列を追加できる", () => {
      const { container, onChange } = setup(simpleTable());
      hoverColumnLine(container, 2);
      fireEvent.click(ctrl("末尾に列を追加"));
      const next = firstOnChange(onChange);
      expect(next.rows[0].cells).toHaveLength(3);
      expect(next.rows[0].cells[2].text).toBe("");
    });
  });

  describe("罫線の ＋ による行の挿入", () => {
    test("先頭の罫線で先頭に行を追加できる", () => {
      const { container, onChange } = setup(simpleTable());
      hoverRowLine(container, 0);
      fireEvent.click(ctrl("先頭に行を追加"));
      expect(firstOnChange(onChange).rows).toHaveLength(4);
    });

    test("行と行の間の罫線でその位置に行を追加できる", () => {
      const { container, onChange } = setup(simpleTable());
      hoverRowLine(container, 1);
      fireEvent.click(ctrl("1 行目と 2 行目の間に行を追加"));
      expect(firstOnChange(onChange).rows).toHaveLength(4);
    });

    test("末尾の罫線で末尾に行を追加できる", () => {
      const { container, onChange } = setup(simpleTable());
      hoverRowLine(container, 3);
      fireEvent.click(ctrl("末尾に行を追加"));
      const next = firstOnChange(onChange);
      expect(next.rows).toHaveLength(4);
      expect(next.rows[3].cells.every((c) => c.text === "")).toBe(true);
    });

    test("rowspan が貫通する罫線に挿入すると結合セルを引き継げる", () => {
      // insertRowAt の「上下で同じ cellId が占めている＝挿入境界をまたぐ」分岐
      const merged = tableBlock([
        { cells: [{ id: "m0", text: "merged", rowspan: 2, colspan: 1 }] },
        { cells: [] },
        { cells: [cell("c2", "bottom")] },
      ]);
      const { container, onChange } = setup(merged);
      hoverRowLine(container, 1);
      fireEvent.click(ctrl("1 行目と 2 行目の間に行を追加"));
      const next = firstOnChange(onChange);
      expect(next.rows).toHaveLength(4);
      const spanning = next.rows.flatMap((r) => r.cells).find((c) => c.id === "m0");
      expect(spanning?.rowspan).toBe(3);
    });
  });

  describe("− による削除", () => {
    test("列の − で列を削除できる", () => {
      const { container, onChange } = setup(simpleTable());
      hoverZone(container, "column-body-0");
      fireEvent.click(ctrl("1 列目を削除"));
      expect(firstOnChange(onChange).rows[0].cells).toHaveLength(1);
    });

    test("行の − で行を削除できる", () => {
      const { container, onChange } = setup(simpleTable());
      hoverZone(container, "row-body-1");
      fireEvent.click(ctrl("2 行目を削除"));
      expect(firstOnChange(onChange).rows).toHaveLength(2);
    });

    test("単一列のテーブルでは列の − を disabled にできる", () => {
      const { container } = setup(tableBlock([
        { cells: [cell("c0", "x")] },
        { cells: [cell("c1", "y")] },
      ]));
      hoverZone(container, "column-body-0");
      expect(ctrl("1 列目を削除").disabled).toBe(true);
    });

    test("単一行のテーブルでは行の − を disabled にできる", () => {
      const { container } = setup(tableBlock([{ cells: [cell("c0", "x")] }]));
      hoverZone(container, "row-body-0");
      expect(ctrl("1 行目を削除").disabled).toBe(true);
    });
  });

  describe("テーブルの削除", () => {
    test("左上に触れるまでは削除ボタンを隠しておける", () => {
      setup(simpleTable());
      expect(toolbarBtn("テーブルを削除")).toBeNull();
    });

    test("左上の削除ボタンで onDelete を呼べる", () => {
      const { container, onDelete } = setup(simpleTable());
      hoverZone(container, "table-corner");
      fireEvent.click(ctrl("テーブルを削除"));
      expect(onDelete).toHaveBeenCalled();
    });
  });

  describe("source の同期", () => {
    // source が extension のシリアライズ結果とズレると、再パース後に
    // reuseIds がブロックを同一視できず TableView がマウントし直され、
    // 選択・編集中セル・開いているメニューが消える。
    test("構造変更後の source を extension と同じ markdown にできる", () => {
      const { container, onChange } = setup(simpleTable());
      hoverRowLine(container, 3);
      fireEvent.click(ctrl("末尾に行を追加"));
      const next = firstOnChange(onChange);
      expect(next.source).toBe(documentToMarkdown({ blocks: [next] }).replace(/\n+$/, ""));
    });

    test("セル編集後の source も extension と同じ markdown にできる", () => {
      const { container, onChange } = setup(simpleTable());
      fireEvent.doubleClick(cellEls(container)[2]);
      fireEvent.change(container.querySelector("textarea") as HTMLTextAreaElement, {
        target: { value: "edited" },
      });
      const next = firstOnChange(onChange);
      expect(next.source).toBe(documentToMarkdown({ blocks: [next] }).replace(/\n+$/, ""));
    });
  });

  describe("セル選択", () => {
    test("単一セル選択では結合ツールバーを隠したままにできる", () => {
      const { container } = setup(simpleTable());
      fireEvent.click(cellEls(container)[2]);
      const toolbar = toolbarBtn("セル結合")!.closest("div") as HTMLElement;
      expect(toolbar.className).toContain("opacity-0");
    });

    test("複数選択 (Shift+クリック) で結合ツールバーを表示できる", () => {
      const { container } = setup(simpleTable());
      fireEvent.click(cellEls(container)[2]);
      fireEvent.click(cellEls(container)[3], { shiftKey: true });
      const toolbar = toolbarBtn("セル結合")!.closest("div") as HTMLElement;
      expect(toolbar.className).toContain("opacity-100");
      expect(toolbarBtn("セル結合")?.disabled).toBe(false);
    });

    test("Cmd+クリックで既選択セルを toggle して外せる", () => {
      const { container } = setup(simpleTable());
      fireEvent.click(cellEls(container)[2]);
      fireEvent.click(cellEls(container)[2], { metaKey: true });
      expect(toolbarBtn("セル結合")?.disabled).toBe(true);
    });

    test("Cmd+クリックで複数選択を追加できる", () => {
      const { container } = setup(simpleTable());
      fireEvent.click(cellEls(container)[2]);
      fireEvent.click(cellEls(container)[3], { metaKey: true });
      expect(toolbarBtn("セル結合")?.disabled).toBe(false);
    });

    test("テーブル外を mousedown すると結合ツールバーを隠せる", () => {
      const { container } = setup(simpleTable());
      fireEvent.click(cellEls(container)[2]);
      fireEvent.click(cellEls(container)[3], { shiftKey: true });
      const toolbar = toolbarBtn("セル結合")!.closest("div") as HTMLElement;
      expect(toolbar.className).toContain("opacity-100");
      fireEvent.mouseDown(document.body);
      expect(toolbar.className).toContain("opacity-0");
    });
  });

  describe("セル編集", () => {
    test("セルをダブルクリックで textarea を出せる", () => {
      const { container } = setup(simpleTable());
      fireEvent.doubleClick(cellEls(container)[2]);
      expect(container.querySelector("textarea")).not.toBeNull();
    });

    test("ダブルクリックで開いた textarea はキャレットが末尾にある", () => {
      const { container } = setup(simpleTable());
      fireEvent.doubleClick(cellEls(container)[2]); // "x"
      const ta = container.querySelector("textarea") as HTMLTextAreaElement;
      expect(ta.selectionStart).toBe(ta.value.length);
    });

    test("textarea でテキストを変更すると updateCell 経由で onChange を呼べる", () => {
      const { container, onChange } = setup(simpleTable());
      fireEvent.doubleClick(cellEls(container)[2]);
      const ta = container.querySelector("textarea") as HTMLTextAreaElement;
      fireEvent.change(ta, { target: { value: "edited" } });
      const edited = firstOnChange(onChange).rows.flatMap((r) => r.cells).find(
        (c) => c.id === "c1",
      );
      expect(edited?.text).toBe("edited");
    });

    test("textarea で blur すると編集モードを抜けられる", () => {
      const { container } = setup(simpleTable());
      fireEvent.doubleClick(cellEls(container)[2]);
      fireEvent.blur(container.querySelector("textarea") as HTMLTextAreaElement);
      expect(container.querySelector("textarea")).toBeNull();
    });

    test("textarea で Escape を押すと blur で編集モードを抜けられる", () => {
      const { container } = setup(simpleTable());
      fireEvent.doubleClick(cellEls(container)[2]);
      fireEvent.keyDown(container.querySelector("textarea") as HTMLTextAreaElement, {
        key: "Escape",
      });
      expect(container.querySelector("textarea")).toBeNull();
    });

    test("IME 変換中の Escape では textarea を残せる", () => {
      const { container } = setup(simpleTable());
      fireEvent.doubleClick(cellEls(container)[2]);
      fireEvent.keyDown(container.querySelector("textarea") as HTMLTextAreaElement, {
        key: "Escape",
        isComposing: true,
      });
      expect(container.querySelector("textarea")).not.toBeNull();
    });

    test("Escape 以外のキーでは編集モードを続けられる", () => {
      const { container } = setup(simpleTable());
      fireEvent.doubleClick(cellEls(container)[2]);
      fireEvent.keyDown(container.querySelector("textarea") as HTMLTextAreaElement, {
        key: "a",
      });
      expect(container.querySelector("textarea")).not.toBeNull();
    });

    test("編集中のセルから外部クリックすると編集を解除できる", () => {
      const { container } = setup(simpleTable());
      fireEvent.doubleClick(cellEls(container)[2]);
      const outside = document.createElement("div");
      document.body.appendChild(outside);
      fireEvent.mouseDown(outside);
      expect(container.querySelector("textarea")).toBeNull();
      outside.remove();
    });

    test("編集中はセルクリックを無視して編集を続けられる", () => {
      const { container } = setup(simpleTable());
      fireEvent.doubleClick(cellEls(container)[2]);
      fireEvent.click(cellEls(container)[3]);
      expect(container.querySelector("textarea")).not.toBeNull();
    });
  });

  describe("セル結合 (merge)", () => {
    test("複数選択して結合すると rowspan/colspan を持つ block を渡せる", () => {
      const { container, onChange } = setup(simpleTable());
      fireEvent.click(cellEls(container)[2]);
      fireEvent.click(cellEls(container)[3], { shiftKey: true });
      fireEvent.click(toolbarBtn("セル結合")!);
      const merged = firstOnChange(onChange).rows.flatMap((r) => r.cells).find(
        (c) => c.colspan > 1 || c.rowspan > 1,
      );
      expect(merged).toBeDefined();
    });

    test("結合済みセル単独選択時は「結合解除」が enabled になる", () => {
      const merged = tableBlock([
        { cells: [cell("m", "merged"), cell("c2", "y")] },
        { cells: [cell("c3", "z"), cell("c4", "w")] },
      ]);
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
      const all = firstOnChange(onChange).rows.flatMap((r) => r.cells);
      expect(all.every((c) => c.rowspan === 1 && c.colspan === 1)).toBe(true);
    });

    test("2x2 の結合解除で 4 セルに展開できる", () => {
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
      fireEvent.click(cellEls(container)[0]);
      fireEvent.click(toolbarBtn("結合解除")!);
      const next = firstOnChange(onChange);
      expect(next.rows[0].cells.length).toBe(3);
      expect(next.rows[1].cells.length).toBe(3);
    });
  });

  describe("結合ツールバーの hover 効果", () => {
    test("enabled なボタンに mouseEnter するとホバー背景を当てられる", () => {
      const { container } = setup(simpleTable());
      fireEvent.click(cellEls(container)[2]);
      fireEvent.click(cellEls(container)[3], { shiftKey: true });
      const btn = toolbarBtn("セル結合")!;
      fireEvent.mouseEnter(btn);
      expect(btn.style.background).toBe("var(--hover-bg)");
      // happy-dom は var() を含む background shorthand を "transparent" で
      // 上書きできないため、mouseLeave はハンドラの実行だけ確認する。
      fireEvent.mouseLeave(btn);
    });

    test("disabled なボタンでは mouseEnter しても背景を据え置ける", () => {
      const { container } = setup(simpleTable());
      fireEvent.click(cellEls(container)[2]);
      const btn = toolbarBtn("セル結合")!;
      expect(btn.disabled).toBe(true);
      fireEvent.mouseEnter(btn);
      expect(btn.style.background).toBe("");
    });
  });

  describe("空セルの描画", () => {
    test("text が空文字のセルは省略記号 placeholder を表示できる", () => {
      const { container } = setup(tableBlock([{ cells: [cell("c0", "")] }]));
      expect(container.querySelector(".opacity-30")).not.toBeNull();
    });
  });
});
