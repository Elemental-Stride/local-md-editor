import {
  parseInlines,
  type TableBlock,
  tableBlockToHtml,
  tableBlockToMarkdown,
  type TableCell,
  type TableCellId,
  type TableRow,
} from "@local-md-editor/shared";
import {
  type CSSProperties,
  Fragment,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { renderInlines } from "../inline-render/index.js";
import { TableBarZone } from "./TableBarZone.js";
import { TableCellEditor } from "./TableCellEditor.js";
import { TableControlButton } from "./TableControlButton.js";
import { MergeIcon, MinusIcon, PlusIcon, TrashIcon, UnmergeIcon } from "./TableIcons.js";

type Props = {
  block: TableBlock;
  onChange: (next: TableBlock) => void;
  onDelete: () => void;
};

// Render a cell's markdown source: split on `\n` so multi-line cells show as
// `<br>` between segments, and run each line through the inline parser so
// `**bold**`, `*italic*`, `` `code` ``, and `[link](url)` render as rich text.
const renderCellContent = (text: string): ReactNode => {
  if (text === "") return <span className="opacity-30">…</span>;
  const lines = text.split("\n");
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {renderInlines(parseInlines(line))}
    </Fragment>
  ));
};

// --- toolbar primitives --------------------------------------------------

const IconButton = (
  { children, title, onClick, disabled, variant }: {
    children: ReactNode;
    title: string;
    onClick: () => void;
    disabled?: boolean;
    variant?: "default" | "danger";
  },
): JSX.Element => {
  const danger = variant === "danger";
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 w-7 items-center justify-center rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent ${
        danger ? "hover:text-red-400" : ""
      }`}
      style={{
        // VS Code 風のホバー背景。控えめでテーマ追従。
        ["--hover-bg" as string]: danger
          ? "var(--vscode-inputValidation-errorBackground, rgba(255,80,80,0.12))"
          : "var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.08))",
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        (e.currentTarget as HTMLButtonElement).style.background = "var(--hover-bg)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
};

type GridSlot = { cellId: TableCellId | null; };

const buildLogicalGrid = (block: TableBlock): {
  grid: GridSlot[][];
  cells: Map<TableCellId, TableCell>;
  numCols: number;
} => {
  const numRows = block.rows.length;
  const cells = new Map<TableCellId, TableCell>();
  for (const row of block.rows) for (const c of row.cells) cells.set(c.id, c);
  const layout = computeLayout(block);
  const numCols = layout.numCols;
  const grid: GridSlot[][] = Array.from(
    { length: numRows },
    () => Array.from({ length: numCols }, () => ({ cellId: null })),
  );
  for (const [id, pos] of layout.positions) {
    const cell = cells.get(id);
    if (!cell) continue;
    for (let dr = 0; dr < cell.rowspan; dr++) {
      for (let dc = 0; dc < cell.colspan; dc++) {
        if (pos.r + dr < numRows && pos.c + dc < numCols) {
          grid[pos.r + dr][pos.c + dc] = { cellId: id };
        }
      }
    }
  }
  return { grid, cells, numCols };
};

// Walk the (possibly mutated) grid and rebuild the rows array. Each cell's
// new rowspan/colspan is derived from its bounding box in the grid, so cells
// that span across deleted rows/columns shrink automatically and cells whose
// only slots were removed disappear entirely.
const rebuildFromGrid = (
  grid: GridSlot[][],
  cells: Map<TableCellId, TableCell>,
  rowIds: string[],
): TableRow[] => {
  if (grid.length === 0) return [];
  const numCols = grid[0]?.length ?? 0;
  type BBox = { rmin: number; cmin: number; rmax: number; cmax: number; };
  const bboxes = new Map<TableCellId, BBox>();
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < numCols; c++) {
      const id = grid[r][c].cellId;
      if (!id) continue;
      const bb = bboxes.get(id);
      if (!bb) bboxes.set(id, { rmin: r, cmin: c, rmax: r, cmax: c });
      else {
        bb.rmin = Math.min(bb.rmin, r);
        bb.cmin = Math.min(bb.cmin, c);
        bb.rmax = Math.max(bb.rmax, r);
        bb.cmax = Math.max(bb.cmax, c);
      }
    }
  }
  const result: TableRow[] = [];
  for (let r = 0; r < grid.length; r++) {
    const newCells: TableCell[] = [];
    for (let c = 0; c < numCols; c++) {
      const id = grid[r][c].cellId;
      if (!id) continue;
      const bb = bboxes.get(id);
      if (!bb) continue;
      if (bb.rmin === r && bb.cmin === c) {
        const original = cells.get(id);
        if (original) {
          newCells.push({
            ...original,
            rowspan: bb.rmax - bb.rmin + 1,
            colspan: bb.cmax - bb.cmin + 1,
          });
        }
      }
    }
    result.push({ id: rowIds[r] ?? makeTableId("tr"), cells: newCells });
  }
  return result;
};

const insertRowAt = (block: TableBlock, insertAt: number): TableBlock => {
  const { grid, cells, numCols } = buildLogicalGrid(block);
  const rowIds = block.rows.map((r) => r.id);
  const newRowSlots: GridSlot[] = [];
  for (let c = 0; c < numCols; c++) {
    // 同じセルが (insertAt-1, c) と (insertAt, c) の両方を占めているなら、
    // そのセルは挿入境界をまたいでおり、新しい行もカバーし続ける必要がある。
    if (
      insertAt > 0 && insertAt < grid.length
      && grid[insertAt - 1][c].cellId !== null
      && grid[insertAt - 1][c].cellId === grid[insertAt][c].cellId
    ) {
      newRowSlots.push({ cellId: grid[insertAt - 1][c].cellId });
    } else {
      const newCell: TableCell = {
        id: makeTableId("tc"),
        text: "",
        rowspan: 1,
        colspan: 1,
        isHeader: false,
      };
      cells.set(newCell.id, newCell);
      newRowSlots.push({ cellId: newCell.id });
    }
  }
  const newGrid = [...grid.slice(0, insertAt), newRowSlots, ...grid.slice(insertAt)];
  const newRowIds = [
    ...rowIds.slice(0, insertAt),
    makeTableId("tr"),
    ...rowIds.slice(insertAt),
  ];
  return { ...block, rows: rebuildFromGrid(newGrid, cells, newRowIds) };
};

const insertColumnAt = (block: TableBlock, insertAt: number): TableBlock => {
  const { grid, cells } = buildLogicalGrid(block);
  const rowIds = block.rows.map((r) => r.id);
  const newGrid = grid.map((row) => {
    let slot: GridSlot;
    if (
      insertAt > 0 && insertAt < row.length
      && row[insertAt - 1].cellId !== null
      && row[insertAt - 1].cellId === row[insertAt].cellId
    ) {
      slot = { cellId: row[insertAt - 1].cellId };
    } else {
      // 行の先頭セルの isHeader に揃え、ヘッダ行の見た目が崩れないようにする。
      const firstCellId = row.find((s) => s.cellId)?.cellId ?? null;
      const inheritHeader = firstCellId
        ? cells.get(firstCellId)?.isHeader ?? false
        : false;
      const newCell: TableCell = {
        id: makeTableId("tc"),
        text: "",
        rowspan: 1,
        colspan: 1,
        isHeader: inheritHeader,
      };
      cells.set(newCell.id, newCell);
      slot = { cellId: newCell.id };
    }
    return [...row.slice(0, insertAt), slot, ...row.slice(insertAt)];
  });
  return { ...block, rows: rebuildFromGrid(newGrid, cells, rowIds) };
};

const deleteRowAt = (block: TableBlock, rowIndex: number): TableBlock => {
  const { grid, cells } = buildLogicalGrid(block);
  const rowIds = block.rows.map((r) => r.id);
  const newGrid = [...grid.slice(0, rowIndex), ...grid.slice(rowIndex + 1)];
  const newRowIds = [...rowIds.slice(0, rowIndex), ...rowIds.slice(rowIndex + 1)];
  return { ...block, rows: rebuildFromGrid(newGrid, cells, newRowIds) };
};

const deleteColumnAt = (block: TableBlock, colIndex: number): TableBlock => {
  const { grid, cells } = buildLogicalGrid(block);
  const rowIds = block.rows.map((r) => r.id);
  const newGrid = grid.map((row) => [...row.slice(0, colIndex), ...row.slice(colIndex + 1)]);
  return { ...block, rows: rebuildFromGrid(newGrid, cells, rowIds) };
};

const makeTableId = (prefix: string): string =>
  `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

type LayoutPos = { r: number; c: number; rowspan: number; colspan: number; };

// カーソルが乗っている帯。削除の − はこの 1 本だけに出す。セル上では
// 何も出さず、上 / 左の帯に入ったときだけ現れる。
type BarHover = { axis: "column" | "row"; index: number; } | null;

// カーソルが近づいている罫線。挿入の ＋ はこの線にだけ出す。
// 番号は境界のインデックスで、列なら 0 (先頭) 〜 numCols (末尾)。
type LineHover = { column: number | null; row: number | null; };
const NO_LINE: LineHover = { column: null, row: null };

// 罫線に反応する距離。これ以内にカーソルが来たらその線の ＋ を出す。
const LINE_HIT_PX = 10;

// 帯セルの矩形から境界線の座標を並べ、カーソルに一番近い境界とその距離を
// 返す。近い境界が無ければ null。テーブル上のどこにカーソルがあっても
// 「いま触れている罫線」を 1 本に決めるために使う。
export const nearestBoundary = (
  edges: readonly { start: number; end: number; }[],
  pos: number,
): { index: number; distance: number; } | null => {
  if (edges.length === 0) return null;
  const boundaries = [edges[0].start, ...edges.map((e) => e.end)];
  let nearest: { index: number; distance: number; } | null = null;
  boundaries.forEach((boundary, index) => {
    const distance = Math.abs(boundary - pos);
    if (nearest === null || distance < nearest.distance) nearest = { index, distance };
  });
  if (nearest === null) return null;
  const found: { index: number; distance: number; } = nearest;
  return found.distance <= LINE_HIT_PX ? found : null;
};

const insertColumnLabel = (line: number, total: number): string =>
  line === 0
    ? "先頭に列を追加"
    : line === total
    ? "末尾に列を追加"
    : `${line} 列目と ${line + 1} 列目の間に列を追加`;

const insertRowLabel = (line: number, total: number): string =>
  line === 0
    ? "先頭に行を追加"
    : line === total
    ? "末尾に行を追加"
    : `${line} 行目と ${line + 1} 行目の間に行を追加`;

// コントロール用の帯。本文セルと違い枠線を持たない。列側は ＋ / − を横一列に
// 並べられるので 1 段ぶん、行側は ＋ と − を 2 レーンに分けるので 2 段ぶん取る。
const COLUMN_BAR_PX = 22;
const ROW_BAR_PX = 40;

// 削除の − を置くレーンの幅。
const BODY_ZONE = "w-5";
const CORNER_CELL: CSSProperties = {
  border: "none",
  padding: 0,
  width: ROW_BAR_PX,
  height: COLUMN_BAR_PX,
};
const COLUMN_BAR_CELL: CSSProperties = { border: "none", padding: 0, height: COLUMN_BAR_PX };
const ROW_BAR_CELL: CSSProperties = { border: "none", padding: 0, width: ROW_BAR_PX };

const computeLayout = (block: TableBlock): {
  positions: Map<TableCellId, LayoutPos>;
  numRows: number;
  numCols: number;
} => {
  const numRows = block.rows.length;
  const occupied = new Set<string>();
  const positions = new Map<TableCellId, LayoutPos>();
  let numCols = 0;
  for (let r = 0; r < numRows; r++) {
    let c = 0;
    for (const cell of block.rows[r].cells) {
      while (occupied.has(`${r},${c}`)) c++;
      positions.set(cell.id, { r, c, rowspan: cell.rowspan, colspan: cell.colspan });
      for (let dr = 0; dr < cell.rowspan; dr++) {
        for (let dc = 0; dc < cell.colspan; dc++) {
          occupied.add(`${r + dr},${c + dc}`);
        }
      }
      numCols = Math.max(numCols, c + cell.colspan);
      c += cell.colspan;
    }
  }
  return { positions, numRows, numCols };
};

const findCell = (block: TableBlock, id: TableCellId): TableCell | null => {
  for (const row of block.rows) {
    const c = row.cells.find((c) => c.id === id);
    if (c) return c;
  }
  return null;
};

// Re-render block.source from rows so reuseIds matches across whole-doc reparse.
// extension 側の blockSource と同じ優先順位（パイプで表現できるならパイプ、
// 無理なら HTML）で組み立てる。ここがズレると再パース後に source が一致せず、
// reuseIds が別ブロック扱いして TableView をマウントし直すため、選択・編集中
// セル・開いているメニューがまとめて消える。
const withSyncedSource = (block: TableBlock, rows: TableRow[]): TableBlock => {
  const next: TableBlock = { ...block, rows };
  return { ...next, source: tableBlockToMarkdown(next) ?? tableBlockToHtml(next) };
};

export const TableView = (
  { block, onChange, onDelete }: Props,
): JSX.Element => {
  const [selection, setSelection] = useState<Set<TableCellId>>(new Set());
  const [anchorId, setAnchorId] = useState<TableCellId | null>(null);
  const [editingCellId, setEditingCellId] = useState<TableCellId | null>(null);
  const [bar, setBar] = useState<BarHover>(null);
  const [line, setLine] = useState<LineHover>(NO_LINE);
  const [cornerHovered, setCornerHovered] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // テーブルラッパー外がクリックされたら選択 / 編集状態をクリアする。
  // 浮いているツールバーもこれで閉じる。
  useEffect(() => {
    const handler = (e: globalThis.MouseEvent): void => {
      if (!wrapperRef.current) return;
      if (wrapperRef.current.contains(e.target as Node)) return;
      setSelection(new Set());
      setAnchorId(null);
      setEditingCellId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { positions, numRows, numCols } = computeLayout(block);

  const updateCell = (cellId: TableCellId, patch: Partial<TableCell>): void => {
    const rows = block.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => (cell.id === cellId ? { ...cell, ...patch } : cell)),
    }));
    onChange(withSyncedSource(block, rows));
  };

  const handleCellClick = (e: MouseEvent, cellId: TableCellId): void => {
    if (editingCellId !== null) return;
    if (e.shiftKey && anchorId) {
      const a = positions.get(anchorId);
      const b = positions.get(cellId);
      if (!a || !b) return;
      const rmin = Math.min(a.r, b.r);
      const rmax = Math.max(a.r + a.rowspan - 1, b.r + b.rowspan - 1);
      const cmin = Math.min(a.c, b.c);
      const cmax = Math.max(a.c + a.colspan - 1, b.c + b.colspan - 1);
      const next = new Set<TableCellId>();
      for (const [id, p] of positions) {
        if (
          p.r >= rmin && p.r + p.rowspan - 1 <= rmax
          && p.c >= cmin && p.c + p.colspan - 1 <= cmax
        ) next.add(id);
      }
      setSelection(next);
    } else if (e.metaKey || e.ctrlKey) {
      const next = new Set(selection);
      if (next.has(cellId)) next.delete(cellId);
      else next.add(cellId);
      setSelection(next);
      setAnchorId(cellId);
    } else {
      setSelection(new Set([cellId]));
      setAnchorId(cellId);
    }
  };

  const mergeCells = (): void => {
    if (selection.size < 2) return;
    let rmin = Infinity, rmax = -Infinity, cmin = Infinity, cmax = -Infinity;
    for (const id of selection) {
      const p = positions.get(id);
      if (!p) continue;
      rmin = Math.min(rmin, p.r);
      rmax = Math.max(rmax, p.r + p.rowspan - 1);
      cmin = Math.min(cmin, p.c);
      cmax = Math.max(cmax, p.c + p.colspan - 1);
    }
    // 左上が選択範囲の矩形内にあるセルを集める（部分選択でもきれいな
    // 矩形として結合できるように）。
    const cellsInRect: { cell: TableCell; pos: LayoutPos; }[] = [];
    for (const [id, p] of positions) {
      if (p.r >= rmin && p.r <= rmax && p.c >= cmin && p.c <= cmax) {
        const c = findCell(block, id);
        if (c) cellsInRect.push({ cell: c, pos: p });
      }
    }
    cellsInRect.sort((a, b) => (a.pos.r === b.pos.r ? a.pos.c - b.pos.c : a.pos.r - b.pos.r));
    const topLeft = cellsInRect.find(({ pos }) => pos.r === rmin && pos.c === cmin);
    if (!topLeft) return;
    const idsToRemove = new Set(
      cellsInRect.filter((c) => c.cell.id !== topLeft.cell.id).map((c) => c.cell.id),
    );
    const mergedText = cellsInRect.map((c) => c.cell.text).filter((t) => t.length > 0).join(" ");
    const newRowspan = rmax - rmin + 1;
    const newColspan = cmax - cmin + 1;
    const rows = block.rows.map((row) => ({
      ...row,
      cells: row.cells.flatMap((cell) => {
        if (cell.id === topLeft.cell.id) {
          return [{
            ...cell,
            rowspan: newRowspan,
            colspan: newColspan,
            text: mergedText,
          }];
        }
        if (idsToRemove.has(cell.id)) return [];
        return [cell];
      }),
    }));
    onChange(withSyncedSource(block, rows));
    setSelection(new Set([topLeft.cell.id]));
    setAnchorId(topLeft.cell.id);
  };

  const unmergeCell = (): void => {
    if (selection.size !== 1) return;
    const cellId = [...selection][0];
    const pos = positions.get(cellId);
    if (!pos || (pos.rowspan === 1 && pos.colspan === 1)) return;
    const original = findCell(block, cellId);
    if (!original) return;
    const oldSpan = { rs: pos.rowspan, cs: pos.colspan };

    // 結合済みセルを 1x1 に縮める。
    let rows: TableRow[] = block.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) =>
        cell.id === cellId ? { ...cell, rowspan: 1, colspan: 1 } : cell
      ),
    }));

    // 解放されたグリッド位置ごとに空の埋めセルを挿入する。各挿入後に
    // レイアウトを再計算し、次の挿入位置を正しく算出できるようにする。
    for (let dr = 0; dr < oldSpan.rs; dr++) {
      for (let dc = 0; dc < oldSpan.cs; dc++) {
        if (dr === 0 && dc === 0) continue;
        const targetR = pos.r + dr;
        const targetC = pos.c + dc;
        if (targetR >= rows.length) continue;
        const layout = computeLayout({ ...block, rows });
        let insertIdx = rows[targetR].cells.length;
        for (let i = 0; i < rows[targetR].cells.length; i++) {
          const cId = rows[targetR].cells[i].id;
          const cPos = layout.positions.get(cId);
          if (cPos && cPos.c > targetC) {
            insertIdx = i;
            break;
          }
        }
        const newCell: TableCell = {
          id: makeTableId("tc"),
          text: "",
          rowspan: 1,
          colspan: 1,
          isHeader: original.isHeader,
        };
        rows = rows.map((row, idx) =>
          idx === targetR
            ? {
              ...row,
              cells: [...row.cells.slice(0, insertIdx), newCell, ...row.cells.slice(insertIdx)],
            }
            : row
        );
      }
    }

    onChange(withSyncedSource(block, rows));
    setSelection(new Set([cellId]));
    setAnchorId(cellId);
  };

  const canMerge = selection.size >= 2;
  const canUnmerge = (() => {
    if (selection.size !== 1) return false;
    const id = [...selection][0];
    const p = positions.get(id);
    return p !== undefined && (p.rowspan > 1 || p.colspan > 1);
  })();

  // テーブル上を動かすたび、カーソルに一番近い罫線を 1 本だけ拾う。
  // 罫線そのものは 1px しかないので、帯セルの矩形から境界座標を取り直して
  // LINE_HIT_PX 以内かどうかで判定する。
  const handleTableMouseMove = (e: MouseEvent<HTMLTableElement>): void => {
    const table = e.currentTarget;
    const rectsOf = (selector: string) =>
      Array.from(table.querySelectorAll<HTMLElement>(selector))
        .map((el) => el.getBoundingClientRect());
    const columnEdges = rectsOf("[data-column-bar]").map((r) => ({
      start: r.left,
      end: r.right,
    }));
    const rowEdges = rectsOf("[data-row-bar]").map((r) => ({ start: r.top, end: r.bottom }));
    const column = nearestBoundary(columnEdges, e.clientX);
    const row = nearestBoundary(rowEdges, e.clientY);
    // 交点付近では縦横 2 本ぶんの ＋ が集まって密集するので、近い方だけ出す。
    const takeColumn = column !== null && (row === null || column.distance <= row.distance);
    const next: LineHover = {
      column: takeColumn ? column.index : null,
      row: !takeColumn && row !== null ? row.index : null,
    };
    setLine((prev) => prev.column === next.column && prev.row === next.row ? prev : next);
  };

  const applyStructure = (next: TableBlock): void => {
    onChange(withSyncedSource(next, next.rows));
    setSelection(new Set());
    setAnchorId(null);
  };

  // ＋ は押した罫線の位置に挿入する。列 / 行の両側に ＋ を出すので、
  // 先頭・途中・末尾のどこにでも足せる。
  const insertColumnAtLine = (c: number): void => applyStructure(insertColumnAt(block, c));
  const insertRowAtLine = (r: number): void => applyStructure(insertRowAt(block, r));
  const removeColumn = (c: number): void => applyStructure(deleteColumnAt(block, c));
  const removeRow = (r: number): void => applyStructure(deleteRowAt(block, r));

  const showMergeBar = canMerge || canUnmerge;

  return (
    <div
      ref={wrapperRef}
      className="group relative my-2 w-fit pb-3 pr-3"
      onMouseLeave={() => {
        setBar(null);
        setLine(NO_LINE);
        setCornerHovered(false);
      }}
    >
      {/* 行 / 列の操作は各行・各列のコントロールに任せ、ここはセル結合だけ。 */}
      <div
        className={`absolute bottom-full left-0 mb-1.5 flex items-center gap-0.5 rounded-md border p-0.5 backdrop-blur-sm transition-all duration-150 ${
          showMergeBar
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-1 opacity-0"
        }`}
        style={{
          background: "var(--vscode-editorWidget-background)",
          borderColor: "var(--vscode-editorWidget-border, var(--vscode-widget-border))",
          boxShadow: "0 4px 12px rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.12)",
        }}
      >
        <IconButton title="セル結合" onClick={mergeCells} disabled={!canMerge}>
          <MergeIcon />
        </IconButton>
        <IconButton title="結合解除" onClick={unmergeCell} disabled={!canUnmerge}>
          <UnmergeIcon />
        </IconButton>
      </div>
      <table className="border-collapse" onMouseMove={handleTableMouseMove}>
        <tbody>
          <tr>
            <td className="relative" style={CORNER_CELL}>
              {/* テーブル全体の削除。テーブルにカーソルがある間だけ出す。 */}
              {
                /* テーブル全体の削除。常時出すと左上が混むので、左上に
                  カーソルを置いたときだけ出す。 */
              }
              <TableBarZone
                zoneId="table-corner"
                className="inset-0"
                active={cornerHovered}
                onEnter={() => setCornerHovered(true)}
                onLeave={() => setCornerHovered(false)}
              >
                <TableControlButton label="テーブルを削除" onClick={onDelete} danger>
                  <TrashIcon />
                </TableControlButton>
              </TableBarZone>
            </td>
            {Array.from({ length: numCols }, (_, c) => (
              <td
                key={c}
                data-column-bar={c}
                className="relative"
                style={COLUMN_BAR_CELL}
              >
                {/* 列の真ん中は削除の −。セルにカーソルがある間も出したままにする。 */}
                <TableBarZone
                  zoneId={`column-body-${c}`}
                  className="inset-y-0 left-2.5 right-2.5"
                  active={bar?.axis === "column" && bar.index === c}
                  onEnter={() => setBar({ axis: "column", index: c })}
                  onLeave={() => setBar(null)}
                >
                  <TableControlButton
                    label={`${c + 1} 列目を削除`}
                    onClick={() => removeColumn(c)}
                    disabled={numCols <= 1}
                    danger
                  >
                    <MinusIcon />
                  </TableControlButton>
                </TableBarZone>
                {/* ＋ は罫線の真上。カーソルが近づいた 1 本だけに出る。 */}
                {line.column === c && (
                  <TableControlButton
                    label={insertColumnLabel(c, numCols)}
                    onClick={() => insertColumnAtLine(c)}
                    className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2"
                  >
                    <PlusIcon />
                  </TableControlButton>
                )}
                {c === numCols - 1 && line.column === numCols && (
                  <TableControlButton
                    label={insertColumnLabel(numCols, numCols)}
                    onClick={() => insertColumnAtLine(numCols)}
                    className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2"
                  >
                    <PlusIcon />
                  </TableControlButton>
                )}
              </td>
            ))}
          </tr>
          {block.rows.map((row, r) => (
            <tr key={row.id}>
              <td
                data-row-bar={r}
                className="relative"
                style={ROW_BAR_CELL}
              >
                {/* 外側のレーンが削除の −。罫線の ＋ と当たり判定が重ならない。 */}
                <TableBarZone
                  zoneId={`row-body-${r}`}
                  className={`inset-y-0 left-0 ${BODY_ZONE}`}
                  active={bar?.axis === "row" && bar.index === r}
                  onEnter={() => setBar({ axis: "row", index: r })}
                  onLeave={() => setBar(null)}
                >
                  <TableControlButton
                    label={`${r + 1} 行目を削除`}
                    onClick={() => removeRow(r)}
                    disabled={numRows <= 1}
                    danger
                  >
                    <MinusIcon />
                  </TableControlButton>
                </TableBarZone>
                {/* ＋ は罫線の真上。− のレーンと重ならないよう内側に寄せる。 */}
                {line.row === r && (
                  <TableControlButton
                    label={insertRowLabel(r, numRows)}
                    onClick={() => insertRowAtLine(r)}
                    className="absolute right-0 top-0 -translate-y-1/2"
                  >
                    <PlusIcon />
                  </TableControlButton>
                )}
                {r === numRows - 1 && line.row === numRows && (
                  <TableControlButton
                    label={insertRowLabel(numRows, numRows)}
                    onClick={() => insertRowAtLine(numRows)}
                    className="absolute bottom-0 right-0 translate-y-1/2"
                  >
                    <PlusIcon />
                  </TableControlButton>
                )}
              </td>
              {row.cells.map((cell) => {
                const isSelected = selection.has(cell.id);
                const isEditing = editingCellId === cell.id;
                const Tag = cell.isHeader ? "th" : "td";
                return (
                  <Tag
                    key={cell.id}
                    data-cell-id={cell.id}
                    rowSpan={cell.rowspan > 1 ? cell.rowspan : undefined}
                    colSpan={cell.colspan > 1 ? cell.colspan : undefined}
                    className="min-w-[4rem] border p-1 align-top text-sm"
                    style={{
                      borderColor: "var(--vscode-widget-border, var(--vscode-editorWidget-border))",
                      ...(isSelected
                        ? {
                          outline: "2px solid var(--vscode-focusBorder)",
                          outlineOffset: "-2px",
                        }
                        : {}),
                      ...(cell.isHeader
                        ? { background: "var(--vscode-editorWidget-background)" }
                        : {}),
                    }}
                    onClick={(e) => handleCellClick(e, cell.id)}
                    onDoubleClick={() => setEditingCellId(cell.id)}
                  >
                    {isEditing
                      ? (
                        <TableCellEditor
                          value={cell.text}
                          onChange={(text) => updateCell(cell.id, { text })}
                          onBlur={() => setEditingCellId(null)}
                        />
                      )
                      : (
                        <span className="whitespace-pre-wrap break-words">
                          {renderCellContent(cell.text)}
                        </span>
                      )}
                  </Tag>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
