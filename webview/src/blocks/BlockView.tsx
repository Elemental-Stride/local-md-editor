import {
  type DragEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  type Block,
  type BlockId,
  type BulletItemBlock,
  type HeadingBlock,
  type OrderedItemBlock,
  type ParagraphBlock,
  parseInlines,
  type TaskItemBlock,
} from "@local-md-editor/shared";
import { renderInlines } from "./InlineRenderer.js";
import { filterItems, type SlashItem, SlashMenu } from "./SlashMenu.js";
import { TableView } from "./TableView.js";
import { CodeBlockView } from "./CodeBlockView.js";
import { LinkModal } from "./LinkModal.js";

type BlockWithInlines =
  | ParagraphBlock
  | HeadingBlock
  | BulletItemBlock
  | OrderedItemBlock
  | TaskItemBlock;

const renderContent = (block: BlockWithInlines): ReactNode => {
  if (block.inlines.length > 0) return renderInlines(block.inlines);
  const text = contentOf(block);
  // 空ブロックは <br /> で 1 行分の高さを保ち、クリックして編集に
  // 入れるようにする。これがないと空段落の <p> が高さ 0 になり、
  // 例えばコードブロック直下に空行を作ってもクリックできなくなる。
  if (text === "") return <br />;
  return renderInlines(parseInlines(text));
};

type Props = {
  block: Block;
  onChange: (next: Block) => void;
  onCommit: () => void;
  onInsertAfter: (block: Block) => void;
  onSplitBlock: (block: Block, before: string, after: string) => void;
  onDeleteAndFocusPrev: (blockId: BlockId) => void;
  onNavigateOut: (blockId: BlockId, dir: "up" | "down") => void;
  onFocus: (blockId: BlockId) => void;
  onDragStart?: (e: DragEvent<HTMLElement>) => void;
  initiallyEditing?: boolean;
  initialCursor?: "start" | "end";
  searchHighlight?: { current: boolean } | null;
};

type LinkPromptState = {
  selStart: number;
  selEnd: number;
  defaultLabel: string;
  defaultUrl: string;
};

// ブロック間移動の判定用。↑ はキャレットより前に `\n` が無いとき、
// ↓ は後に無いときブロック外へ抜ける。ソフトラップされた行は textarea
// 内に留まる（ブラウザネイティブの挙動に任せる）。
const isAtFirstLine = (ta: HTMLTextAreaElement): boolean =>
  !ta.value.slice(0, ta.selectionStart).includes("\n");
const isAtLastLine = (ta: HTMLTextAreaElement): boolean =>
  !ta.value.slice(ta.selectionEnd).includes("\n");

// ドロップされた画像 File を data URL として読み込み、インラインに埋め
// 込めるようにする。約 1MB を超えるファイルは markdown を肥大化させる
// ため対象外。
const readAsDataUrl = (file: File): Promise<string | null> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve(typeof reader.result === "string" ? reader.result : null);
    });
    reader.addEventListener("error", () => resolve(null));
    reader.readAsDataURL(file);
  });

const MAX_IMAGE_BYTES = 1_000_000;

export const BlockView = (
  {
    block,
    onChange,
    onCommit,
    onInsertAfter,
    onSplitBlock,
    onDeleteAndFocusPrev,
    onNavigateOut,
    onFocus,
    onDragStart,
    initiallyEditing,
    initialCursor,
    searchHighlight,
  }: Props,
): JSX.Element => {
  const [editing, setEditing] = useState(!!initiallyEditing);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuFilter, setMenuFilter] = useState("");
  const [menuIndex, setMenuIndex] = useState(0);
  const [linkPrompt, setLinkPrompt] = useState<LinkPromptState | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const initialEditMount = useRef(initiallyEditing === true);
  const enteredViaClick = useRef(false);
  const filteredItems = filterItems(menuFilter);

  useEffect(() => {
    setMenuIndex(0);
  }, [menuFilter]);

  const fontSig = block.kind === "heading" ? `h${block.level}` : block.kind;
  useLayoutEffect(() => {
    if (!editing) return;
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    if (initialEditMount.current) {
      initialEditMount.current = false;
      if (initialCursor === "start") {
        const markerLen = block.kind === "heading"
          ? 0
          : block.kind === "code"
          ? 0
          : block.kind === "table"
          ? 0
          : "source" in block ? block.source.length - contentOf(block).length : 0;
        el.setSelectionRange(markerLen, markerLen);
      } else {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    } else if (enteredViaClick.current) {
      enteredViaClick.current = false;
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [editing, "source" in block ? block.source : "", fontSig, initialCursor]);

  const closeMenu = (): void => {
    setMenuOpen(false);
    setMenuFilter("");
  };

  const selectMenuItem = (item: SlashItem): void => {
    const transformed = item.apply(block);
    onChange(transformed);
    if (item.thenInsertAfter) {
      onInsertAfter(transformed);
    }
    closeMenu();
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
    });
  };

  // textarea のキャレット位置に ![alt](url) を挿入する。編集モード外
  // （描画済み表示への画像ドロップ）から呼ばれた場合は、ブロック内容の
  // 末尾に追加する。
  const insertImageAtCursor = (url: string, alt: string): void => {
    if (!("source" in block)) return;
    if (block.kind === "table" || block.kind === "code") return;
    const md = `![${alt}](${url})`;
    const ta = taRef.current;
    const display = displayValue(block);
    if (editing && ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newDisplay = display.slice(0, start) + md + display.slice(end);
      const newSource = withDisplayValue(block, newDisplay);
      onChange(reclassify(block, newSource));
      const caret = start + md.length;
      requestAnimationFrame(() => ta.setSelectionRange(caret, caret));
    } else {
      const newDisplay = display + (display === "" ? "" : " ") + md;
      const newSource = withDisplayValue(block, newDisplay);
      onChange(reclassify(block, newSource));
    }
  };

  const handleFileDrop = async (files: FileList): Promise<void> => {
    // サイズ超過は黙ってスキップ（markdown に埋め込むとファイルが肥大するため）。
    const eligible = Array.from(files).filter(
      (f) => f.type.startsWith("image/") && f.size <= MAX_IMAGE_BYTES,
    );
    const results = await Promise.all(
      eligible.map(async (f) => ({ name: f.name, url: await readAsDataUrl(f) })),
    );
    for (const r of results) {
      if (r.url) insertImageAtCursor(r.url, r.name.replace(/\.[^.]+$/, ""));
    }
  };

  const onTextareaDrop = (e: DragEvent<HTMLTextAreaElement>): void => {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const hasImage = Array.from(e.dataTransfer.files).some((f) => f.type.startsWith("image/"));
      if (hasImage) {
        e.preventDefault();
        e.stopPropagation();
        void handleFileDrop(e.dataTransfer.files);
      }
    }
  };

  const onDisplayDrop = (e: DragEvent<HTMLDivElement>): void => {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const hasImage = Array.from(e.dataTransfer.files).some((f) => f.type.startsWith("image/"));
      if (hasImage) {
        e.preventDefault();
        e.stopPropagation();
        void handleFileDrop(e.dataTransfer.files);
      }
    }
  };

  // テーブルは専用コンポーネント（セル編集 + 選択 + 結合 UI）に委譲する。
  // テキスト系ブロックとテーブルの間で種別が切り替わってもフック呼び出し
  // 順が揺れないよう、すべてのフックはこの分岐より上で宣言してある。
  if (block.kind === "table") {
    return (
      <TableView
        block={block}
        onChange={onChange}
        onDelete={() => onDeleteAndFocusPrev(block.id)}
        onDragStart={onDragStart}
      />
    );
  }

  if (block.kind === "code") {
    return (
      <CodeBlockView
        block={block}
        onChange={onChange}
        onCommit={onCommit}
        onDelete={() => onDeleteAndFocusPrev(block.id)}
        onInsertAfter={() => onInsertAfter(block)}
        onDragStart={onDragStart}
        onNavigateOut={(dir) => onNavigateOut(block.id, dir)}
        onFocus={() => onFocus(block.id)}
        initiallyEditing={initiallyEditing}
        initialCursor={initialCursor}
      />
    );
  }

  const openLinkPromptFromTextarea = (ta: HTMLTextAreaElement): void => {
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const display = displayValue(block);
    setLinkPrompt({
      selStart: start,
      selEnd: end,
      defaultLabel: display.slice(start, end),
      defaultUrl: "",
    });
  };

  const applyLink = (label: string, url: string): void => {
    if (!linkPrompt) return;
    const display = displayValue(block);
    const visibleLabel = label === "" ? url : label;
    const inserted = `[${visibleLabel}](${url})`;
    const newDisplay = display.slice(0, linkPrompt.selStart)
      + inserted
      + display.slice(linkPrompt.selEnd);
    onChange(reclassify(block, withDisplayValue(block, newDisplay)));
    const caret = linkPrompt.selStart + inserted.length;
    setLinkPrompt(null);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  };

  if (editing) {
    const editorClass = block.kind === "heading"
      ? `${headingClass[block.level]} leading-tight`
      : "font-mono text-sm leading-relaxed";
    const display = displayValue(block);

    const editor = (
      <textarea
        ref={taRef}
        autoFocus
        className={`w-full resize-none overflow-hidden bg-transparent outline-none ${editorClass}`}
        value={display}
        spellCheck={false}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={onTextareaDrop}
        onFocus={() => onFocus(block.id)}
        onChange={(e) => {
          const newDisplay = e.target.value;
          const newSource = withDisplayValue(block, newDisplay);
          const newBlock = reclassify(block, newSource);
          const oldContent = contentOf(block);
          const newContent = contentOf(newBlock);
          if (newContent === "/" && oldContent === "") {
            setMenuOpen(true);
            setMenuFilter("");
          } else if (menuOpen) {
            if (newContent.startsWith("/") && !newContent.includes(" ")) {
              setMenuFilter(newContent.slice(1));
            } else {
              closeMenu();
            }
          }
          onChange(newBlock);
        }}
        onBlur={(e) => {
          if (linkPrompt) return;
          setEditing(false);
          closeMenu();
          if (e.relatedTarget instanceof HTMLTextAreaElement) return;
          onCommit();
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (menuOpen) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setMenuIndex((i) => Math.min(filteredItems.length - 1, i + 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setMenuIndex((i) => Math.max(0, i - 1));
              return;
            }
            if (e.key === "Enter" && filteredItems.length > 0) {
              e.preventDefault();
              selectMenuItem(filteredItems[menuIndex]);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              closeMenu();
              return;
            }
          }
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            openLinkPromptFromTextarea(e.currentTarget);
            return;
          }
          if (e.key === "Escape") {
            (e.currentTarget as HTMLTextAreaElement).blur();
            return;
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onInsertAfter(block);
            return;
          }
          if (
            e.key === "Enter"
            && !e.shiftKey
            && !e.metaKey
            && !e.ctrlKey
            && block.kind !== "html"
            && block.kind !== "blockquote"
            && block.kind !== "thematicBreak"
            && block.kind !== "other"
          ) {
            e.preventDefault();
            const ta = e.currentTarget as HTMLTextAreaElement;
            const contentCursor = ta.selectionStart;
            onSplitBlock(
              block,
              display.slice(0, contentCursor),
              display.slice(contentCursor),
            );
            return;
          }
          if (e.key === "ArrowUp" && isAtFirstLine(e.currentTarget)) {
            e.preventDefault();
            onNavigateOut(block.id, "up");
            return;
          }
          if (e.key === "ArrowDown" && isAtLastLine(e.currentTarget)) {
            e.preventDefault();
            onNavigateOut(block.id, "down");
            return;
          }
          if (e.key === "Backspace") {
            const ta = e.currentTarget as HTMLTextAreaElement;
            const markered = block.kind === "heading"
              || block.kind === "bulletItem"
              || block.kind === "orderedItem"
              || block.kind === "taskItem";
            if (markered && ta.selectionStart === 0 && ta.selectionEnd === 0) {
              e.preventDefault();
              onChange({
                id: block.id,
                kind: "paragraph",
                source: displayValue(block),
                inlines: [],
              });
              return;
            }
            if (display === "") {
              e.preventDefault();
              onDeleteAndFocusPrev(block.id);
              return;
            }
          }
          if (e.key === "Tab") {
            e.preventDefault();
            if (block.kind === "heading") return;
            const ta = taRef.current;
            if (!ta) return;
            if (!("source" in block)) return;
            const oldStart = ta.selectionStart;
            const oldEnd = ta.selectionEnd;
            const hidesMarker = block.kind === "bulletItem"
              || block.kind === "orderedItem"
              || block.kind === "taskItem";
            const insertSourcePos = hidesMarker
              ? 0
              : block.source.lastIndexOf("\n", oldStart - 1) + 1;
            if (e.shiftKey) {
              const m = block.source.slice(insertSourcePos).match(/^( {1,2})/);
              if (!m) return;
              const removed = m[1].length;
              const next = block.source.slice(0, insertSourcePos)
                + block.source.slice(insertSourcePos + removed);
              onChange({ ...block, source: next } as Block);
              if (!hidesMarker) {
                const cs = Math.max(insertSourcePos, oldStart - removed);
                const ce = Math.max(insertSourcePos, oldEnd - removed);
                requestAnimationFrame(() => ta.setSelectionRange(cs, ce));
              }
            } else {
              const next = block.source.slice(0, insertSourcePos)
                + "  "
                + block.source.slice(insertSourcePos);
              onChange({ ...block, source: next } as Block);
              if (!hidesMarker) {
                requestAnimationFrame(() => ta.setSelectionRange(oldStart + 2, oldEnd + 2));
              }
            }
            return;
          }
        }}
      />
    );

    const slashMenu = menuOpen
      ? (
        <SlashMenu
          items={filteredItems}
          selectedIndex={menuIndex}
          onSelect={selectMenuItem}
        />
      )
      : null;

    const linkPromptEl = linkPrompt
      ? (
        <LinkModal
          defaultLabel={linkPrompt.defaultLabel}
          defaultUrl={linkPrompt.defaultUrl}
          onApply={applyLink}
          onCancel={() => {
            setLinkPrompt(null);
            requestAnimationFrame(() => taRef.current?.focus());
          }}
        />
      )
      : null;

    const markerTextClass = "select-none font-mono text-sm leading-relaxed opacity-60";
    let markerEl: ReactNode = null;
    if (block.kind === "bulletItem") {
      markerEl = <span className={markerTextClass}>•</span>;
    } else if (block.kind === "orderedItem") {
      markerEl = (
        <span className={`${markerTextClass} tabular-nums`}>
          {orderedMarker(block.source)}
        </span>
      );
    } else if (block.kind === "taskItem") {
      const checked = block.checked;
      markerEl = (
        <input
          type="checkbox"
          className="mt-[5px]"
          checked={checked}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const next = e.currentTarget.checked;
            onChange({
              ...block,
              checked: next,
              source: toggleTaskSource(block.source, next),
            });
          }}
        />
      );
    }

    if (markerEl !== null) {
      return (
        <div
          className={`flex items-start gap-2 ${searchHighlight ? searchHighlightClass(searchHighlight.current) : ""}`}
          style={"source" in block ? indentStyle(block.source) : undefined}
        >
          {markerEl}
          <div className="relative flex-1">
            {editor}
            {slashMenu}
            {linkPromptEl}
          </div>
        </div>
      );
    }

    return (
      <div
        className={`relative ${searchHighlight ? searchHighlightClass(searchHighlight.current) : ""}`}
      >
        {editor}
        {slashMenu}
        {linkPromptEl}
      </div>
    );
  }

  return (
    <div
      className={`cursor-text rounded px-1 hover:bg-white/5 ${
        searchHighlight ? searchHighlightClass(searchHighlight.current) : ""
      }`}
      onClick={() => {
        enteredViaClick.current = true;
        setEditing(true);
        onFocus(block.id);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={onDisplayDrop}
    >
      <RenderedBlock block={block} onChange={onChange} />
    </div>
  );
};

const searchHighlightClass = (current: boolean): string =>
  current ? "ring-2 ring-yellow-400/80 bg-yellow-400/10" : "bg-yellow-300/10";

const displayValue = (block: Block): string => {
  switch (block.kind) {
    case "heading": {
      const m = block.source.match(/^(#{1,6}) /);
      return m ? block.source.slice(m[0].length) : block.source;
    }
    case "bulletItem": {
      const m = block.source.match(/^\s*[-*+] /);
      return m ? block.source.slice(m[0].length) : block.source;
    }
    case "orderedItem": {
      const m = block.source.match(/^\s*\d+[.)] /);
      return m ? block.source.slice(m[0].length) : block.source;
    }
    case "taskItem": {
      const m = block.source.match(/^\s*[-*+] \[[ xX]\] /);
      return m ? block.source.slice(m[0].length) : block.source;
    }
    case "code":
    case "table":
      return "";
    default:
      return block.source;
  }
};

const withDisplayValue = (block: Block, display: string): string => {
  switch (block.kind) {
    case "heading":
      return `${"#".repeat(block.level)} ${display}`;
    case "bulletItem": {
      const indent = block.source.match(/^( *)/)?.[0] ?? "";
      const m = block.source.match(/^\s*([-*+]) /);
      const marker = m?.[1] ?? "-";
      return `${indent}${marker} ${display}`;
    }
    case "orderedItem": {
      const m = block.source.match(/^(\s*)(\d+[.)])\s/);
      const indent = m?.[1] ?? "";
      const marker = m?.[2] ?? "1.";
      return `${indent}${marker} ${display}`;
    }
    case "taskItem": {
      const indent = block.source.match(/^( *)/)?.[0] ?? "";
      const m = block.source.match(/^\s*([-*+]) /);
      const marker = m?.[1] ?? "-";
      return `${indent}${marker} [${block.checked ? "x" : " "}] ${display}`;
    }
    case "code":
    case "table":
      return display;
    default:
      return display;
  }
};

const contentOf = (block: Block): string => {
  switch (block.kind) {
    case "heading": {
      const m = block.source.match(/^(#{1,6}) /);
      return m ? block.source.slice(m[0].length) : block.source;
    }
    case "bulletItem": {
      const m = block.source.match(/^\s*[-*+] /);
      return m ? block.source.slice(m[0].length) : block.source;
    }
    case "orderedItem": {
      const m = block.source.match(/^\s*\d+[.)] /);
      return m ? block.source.slice(m[0].length) : block.source;
    }
    case "taskItem": {
      const m = block.source.match(/^\s*[-*+] \[[ xX]\] /);
      return m ? block.source.slice(m[0].length) : block.source;
    }
    case "code":
    case "table":
      return "";
    default:
      return block.source;
  }
};

const reclassify = (current: Block, source: string): Block => {
  if (
    current.kind === "blockquote"
    || current.kind === "thematicBreak"
    || current.kind === "html"
    || current.kind === "table"
    || current.kind === "code"
    || current.kind === "other"
  ) {
    if (current.kind === "code" || current.kind === "table") return current;
    return { ...current, source } as Block;
  }

  const headingMatch = source.match(/^(#{1,6}) /);
  if (headingMatch) {
    const level = headingMatch[1].length as HeadingBlock["level"];
    if (current.kind === "heading" && current.level === level) {
      return { ...current, source };
    }
    return { id: current.id, kind: "heading", level, source, inlines: [] };
  }

  const taskMatch = source.match(/^\s*[-*+] \[([ xX])\] /);
  if (taskMatch) {
    const checked = taskMatch[1].toLowerCase() === "x";
    if (current.kind === "taskItem") {
      return { ...current, source, checked };
    }
    return { id: current.id, kind: "taskItem", checked, source, inlines: [] };
  }

  if (/^\s*[-*+] /.test(source)) {
    if (current.kind === "bulletItem") return { ...current, source };
    return { id: current.id, kind: "bulletItem", source, inlines: [] };
  }

  if (/^\s*\d+[.)] /.test(source)) {
    if (current.kind === "orderedItem") return { ...current, source };
    return { id: current.id, kind: "orderedItem", source, inlines: [] };
  }

  if (current.kind === "paragraph") return { ...current, source };
  return { id: current.id, kind: "paragraph", source, inlines: [] };
};

const headingClass: Record<HeadingBlock["level"], string> = {
  1: "text-3xl font-bold",
  2: "text-2xl font-bold",
  3: "text-xl font-semibold",
  4: "text-lg font-semibold",
  5: "text-base font-semibold",
  6: "text-sm font-semibold",
};

const orderedMarker = (source: string): string => {
  const m = source.match(/^\s*(\d+)([.)])/);
  return m ? `${m[1]}${m[2]}` : "1.";
};

const sourceIndent = (source: string): number => {
  const m = source.match(/^( *)/);
  return m ? m[0].length : 0;
};

const indentStyle = (source: string): { paddingLeft: string } | undefined => {
  const n = sourceIndent(source);
  if (n === 0) return undefined;
  return { paddingLeft: `${n * 0.5}rem` };
};

const toggleTaskSource = (source: string, checked: boolean): string =>
  source.replace(/(\[)[xX ](\])/, (_, l: string, r: string) => `${l}${checked ? "x" : " "}${r}`);

type RenderedProps = {
  block: Block;
  onChange: (next: Block) => void;
};

const RenderedBlock = ({ block, onChange }: RenderedProps): JSX.Element => {
  switch (block.kind) {
    case "heading": {
      const Tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return <Tag className={headingClass[block.level]}>{renderContent(block)}</Tag>;
    }
    case "paragraph":
      return (
        <p className="whitespace-pre-wrap leading-relaxed">{renderContent(block)}</p>
      );
    case "bulletItem":
      return (
        <div className="flex gap-2" style={indentStyle(block.source)}>
          <span className="select-none pt-px opacity-60">•</span>
          <span className="flex-1 whitespace-pre-wrap leading-relaxed">
            {renderContent(block)}
          </span>
        </div>
      );
    case "orderedItem":
      return (
        <div className="flex gap-2" style={indentStyle(block.source)}>
          <span className="select-none pt-px tabular-nums opacity-60">
            {orderedMarker(block.source)}
          </span>
          <span className="flex-1 whitespace-pre-wrap leading-relaxed">
            {renderContent(block)}
          </span>
        </div>
      );
    case "taskItem": {
      const tb: TaskItemBlock = block;
      return (
        <div className="flex items-baseline gap-2" style={indentStyle(tb.source)}>
          <input
            type="checkbox"
            checked={tb.checked}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const checked = e.currentTarget.checked;
              onChange({
                ...tb,
                checked,
                source: toggleTaskSource(tb.source, checked),
              });
            }}
          />
          <span
            className={`flex-1 whitespace-pre-wrap leading-relaxed ${
              tb.checked ? "line-through opacity-60" : ""
            }`}
          >
            {renderContent(tb)}
          </span>
        </div>
      );
    }
    case "thematicBreak":
      return <hr className="my-2 opacity-30" />;
    default:
      return (
        <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed opacity-90">
          {block.source}
        </pre>
      );
  }
};
