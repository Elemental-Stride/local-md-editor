import {
  type DragEvent,
  Fragment,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  parseInlines,
  type TableBlock,
  type TableCell,
  type TableCellId,
  type TableRow,
  tableBlockToHtml,
} from "@local-md-editor/shared";
import { renderInlines } from "../inline-render/index.js";

type Props = {
  block: TableBlock;
  onChange: (next: TableBlock) => void;
  onDelete: () => void;
  onDragStart?: (e: DragEvent<HTMLElement>) => void;
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

const GripIcon = (): JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
    <g fill="currentColor">
      <circle cx="6" cy="4" r="1.2" />
      <circle cx="10" cy="4" r="1.2" />
      <circle cx="6" cy="8" r="1.2" />
      <circle cx="10" cy="8" r="1.2" />
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="10" cy="12" r="1.2" />
    </g>
  </svg>
);

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
        (e.currentTarget as HTMLButtonElement).style.background =
          "var(--hover-bg)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
};

const Divider = (): JSX.Element => (
  <div
    className="mx-0.5 h-4 w-px"
    style={{ background: "currentColor", opacity: 0.18 }}
  />
);

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.4 } as const;

const MergeIcon = (): JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 16 16" {...stroke}>
    <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
    <path d="M5 5 L7.4 7.4 M11 5 L8.6 7.4 M5 11 L7.4 8.6 M11 11 L8.6 8.6" />
  </svg>
);

const UnmergeIcon = (): JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 16 16" {...stroke}>
    <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
    <line x1="2.5" y1="8" x2="13.5" y2="8" />
    <line x1="8" y1="2.5" x2="8" y2="13.5" />
  </svg>
);

const AddRowIcon = (): JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 16 16" {...stroke}>
    <rect x="2.5" y="2.5" width="11" height="6" rx="1" />
    <line x1="8" y1="11" x2="8" y2="14" strokeLinecap="round" />
    <line x1="6.5" y1="12.5" x2="9.5" y2="12.5" strokeLinecap="round" />
  </svg>
);

const AddColIcon = (): JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 16 16" {...stroke}>
    <rect x="2.5" y="2.5" width="6" height="11" rx="1" />
    <line x1="11" y1="8" x2="14" y2="8" strokeLinecap="round" />
    <line x1="12.5" y1="6.5" x2="12.5" y2="9.5" strokeLinecap="round" />
  </svg>
);

const RemoveRowIcon = (): JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 16 16" {...stroke}>
    <rect x="2.5" y="5" width="11" height="6" rx="1" />
    <line x1="5.5" y1="8" x2="10.5" y2="8" strokeLinecap="round" />
  </svg>
);

const RemoveColIcon = (): JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 16 16" {...stroke}>
    <rect x="5" y="2.5" width="6" height="11" rx="1" />
    <line x1="8" y1="5.5" x2="8" y2="10.5" strokeLinecap="round" />
  </svg>
);

const TrashIcon = (): JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 16 16" {...stroke} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 4.5 H13" />
    <path d="M5.5 4.5 V13 H10.5 V4.5" />
    <path d="M7 7 V11 M9 7 V11" />
    <path d="M6.5 4.5 V2.5 H9.5 V4.5" />
  </svg>
);

type GridSlot = { cellId: TableCellId | null };

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
  const grid: GridSlot[][] = Array.from({ length: numRows }, () =>
    Array.from({ length: numCols }, () => ({ cellId: null }))
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
  type BBox = { rmin: number; cmin: number; rmax: number; cmax: number };
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
  const newGrid = grid.map((row) =>
    [...row.slice(0, colIndex), ...row.slice(colIndex + 1)]
  );
  return { ...block, rows: rebuildFromGrid(newGrid, cells, rowIds) };
};

const makeTableId = (prefix: string): string =>
  `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

type LayoutPos = { r: number; c: number; rowspan: number; colspan: number };

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
const withSyncedSource = (block: TableBlock, rows: TableRow[]): TableBlock => {
  const next: TableBlock = { ...block, rows };
  return { ...next, source: tableBlockToHtml(next) };
};

export const TableView = (
  { block, onChange, onDelete, onDragStart }: Props,
): JSX.Element => {
  const [selection, setSelection] = useState<Set<TableCellId>>(new Set());
  const [anchorId, setAnchorId] = useState<TableCellId | null>(null);
  const [editingCellId, setEditingCellId] = useState<TableCellId | null>(null);
  const [hovered, setHovered] = useState(false);
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

  // 直近クリックされたセルを、行 / 列の挿入・削除のターゲットとして扱う。
  const targetPos = anchorId ? positions.get(anchorId) ?? null : null;
  const showToolbar = hovered || selection.size > 0 || editingCellId !== null;

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
    const cellsInRect: { cell: TableCell; pos: LayoutPos }[] = [];
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
            ? { ...row, cells: [...row.cells.slice(0, insertIdx), newCell, ...row.cells.slice(insertIdx)] }
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

  const addRow = (): void => {
    const insertAt = targetPos ? targetPos.r + targetPos.rowspan : numRows;
    const next = insertRowAt(block, insertAt);
    onChange(withSyncedSource(next, next.rows));
  };

  const addColumn = (): void => {
    const insertAt = targetPos ? targetPos.c + targetPos.colspan : numCols;
    const next = insertColumnAt(block, insertAt);
    onChange(withSyncedSource(next, next.rows));
  };

  const removeRow = (): void => {
    if (!targetPos || numRows <= 1) return;
    const next = deleteRowAt(block, targetPos.r);
    onChange(withSyncedSource(next, next.rows));
    setSelection(new Set());
    setAnchorId(null);
  };

  const removeColumn = (): void => {
    if (!targetPos || numCols <= 1) return;
    const next = deleteColumnAt(block, targetPos.c);
    onChange(withSyncedSource(next, next.rows));
    setSelection(new Set());
    setAnchorId(null);
  };

  return (
    <div
      ref={wrapperRef}
      className="relative my-2"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={`absolute bottom-full left-0 mb-1.5 flex items-center gap-0.5 rounded-md border p-0.5 backdrop-blur-sm transition-all duration-150 ${
          showToolbar
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-1 opacity-0"
        }`}
        style={{
          background: "var(--vscode-editorWidget-background)",
          borderColor: "var(--vscode-editorWidget-border, var(--vscode-widget-border))",
          boxShadow: "0 4px 12px rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.12)",
        }}
      >
        {onDragStart && (
          <>
            <span
              draggable
              onDragStart={onDragStart}
              title="ドラッグしてテーブルを並べ替え"
              aria-label="ドラッグしてテーブルを並べ替え"
              className="flex h-7 w-7 items-center justify-center rounded opacity-60 hover:opacity-100"
              style={{ cursor: "grab" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLSpanElement).style.background =
                  "var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.08))";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLSpanElement).style.background = "transparent";
              }}
            >
              <GripIcon />
            </span>
            <Divider />
          </>
        )}
        <IconButton title="セル結合" onClick={mergeCells} disabled={!canMerge}>
          <MergeIcon />
        </IconButton>
        <IconButton title="結合解除" onClick={unmergeCell} disabled={!canUnmerge}>
          <UnmergeIcon />
        </IconButton>
        <Divider />
        <IconButton title="行を追加" onClick={addRow}>
          <AddRowIcon />
        </IconButton>
        <IconButton title="列を追加" onClick={addColumn}>
          <AddColIcon />
        </IconButton>
        <IconButton
          title="選択セルの行を削除"
          onClick={removeRow}
          disabled={!targetPos || numRows <= 1}
        >
          <RemoveRowIcon />
        </IconButton>
        <IconButton
          title="選択セルの列を削除"
          onClick={removeColumn}
          disabled={!targetPos || numCols <= 1}
        >
          <RemoveColIcon />
        </IconButton>
        <Divider />
        <IconButton title="テーブルを削除" onClick={onDelete} variant="danger">
          <TrashIcon />
        </IconButton>
      </div>
      <table className="border-collapse">
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.id}>
              {row.cells.map((cell) => {
                const isSelected = selection.has(cell.id);
                const isEditing = editingCellId === cell.id;
                const Tag = cell.isHeader ? "th" : "td";
                return (
                  <Tag
                    key={cell.id}
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
                        <textarea
                          autoFocus
                          className="w-full resize-none bg-transparent outline-none"
                          value={cell.text}
                          spellCheck={false}
                          rows={Math.max(1, cell.text.split("\n").length)}
                          onChange={(e) => updateCell(cell.id, { text: e.target.value })}
                          onBlur={() => setEditingCellId(null)}
                          onKeyDown={(e) => {
                            if (e.nativeEvent.isComposing) return;
                            if (e.key === "Escape") {
                              (e.currentTarget as HTMLTextAreaElement).blur();
                            }
                          }}
                        />
                      )
                      : (
                        <span className="whitespace-pre-wrap">
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
