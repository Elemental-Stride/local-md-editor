import {
  type Block,
  type BulletItemBlock,
  type HeadingBlock,
  type OrderedItemBlock,
  type ParagraphBlock,
  parseInlines,
  type TaskItemBlock,
} from "@local-md-editor/shared";
import type { ReactNode } from "react";
import { renderInlines } from "../inline-render/index.js";
import {
  contentOf,
  headingClass,
  indentStyle,
  orderedMarker,
  toggleTaskSource,
} from "./blockTransforms.js";

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
};

export const RenderedBlock = ({ block, onChange }: Props): JSX.Element => {
  switch (block.kind) {
    case "heading": {
      const Tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return <Tag className={headingClass[block.level]}>{renderContent(block)}</Tag>;
    }
    case "paragraph":
      return <p className="whitespace-pre-wrap leading-relaxed">{renderContent(block)}</p>;
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
    case "blockquote":
      // RawBlock 系には inlines が無いので素のテキストを <blockquote> として
      // 表示する。`> ` 接頭は contentOf で剥がしてから出す。
      return (
        <blockquote className="whitespace-pre-wrap border-l-4 border-current/30 pl-3 italic leading-relaxed opacity-80">
          {contentOf(block)}
        </blockquote>
      );
    default:
      return (
        <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed opacity-90">
          {block.source}
        </pre>
      );
  }
};
