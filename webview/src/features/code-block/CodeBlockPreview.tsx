import type { CodeBlock } from "@local-md-editor/shared";
import { TOKEN_CLASS, tokenize } from "../highlight/index.js";
import { MermaidView } from "../mermaid/index.js";

type Props = {
  block: CodeBlock;
  onEnterEdit: () => void;
};

// コードブロックの非編集時表示。Mermaid のときは図、それ以外は
// 軽量シンタックスハイライト付きの素のテキストを表示する。
export const CodeBlockPreview = ({ block, onEnterEdit }: Props): JSX.Element => {
  if (block.lang === "mermaid") {
    return (
      <div className="cursor-text" onClick={onEnterEdit} title="クリックして編集">
        <MermaidView value={block.value} />
      </div>
    );
  }
  return <SyntaxHighlightedPreview block={block} onEnterEdit={onEnterEdit} />;
};

const SyntaxHighlightedPreview = (
  { block, onEnterEdit }: Props,
): JSX.Element => {
  const tokens = tokenize(block.value, block.lang);
  return (
    <pre
      className="m-0 overflow-x-auto whitespace-pre px-3 py-2 font-mono text-[13px] leading-relaxed"
      onClick={onEnterEdit}
    >
      {tokens.length === 0
        ? <span className="opacity-40">空のコードブロック</span>
        : tokens.map((t, i) => (
          <span key={i} className={TOKEN_CLASS[t.type]}>{t.value}</span>
        ))}
    </pre>
  );
};
