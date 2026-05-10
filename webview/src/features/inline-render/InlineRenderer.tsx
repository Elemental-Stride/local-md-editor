import type { InlineToken } from "@local-md-editor/shared";
import { Fragment, type ReactNode } from "react";
import { classifyUrl, useResolvedUri } from "../../resources.js";
import { post } from "../../vscode.js";

export const renderInlines = (tokens: InlineToken[]): ReactNode =>
  tokens.map((t, i) => <InlineNode key={i} token={t} />);

const InlineNode = ({ token }: { token: InlineToken; }): JSX.Element => {
  switch (token.type) {
    case "text":
      return <Fragment>{token.value}</Fragment>;
    case "strong":
      return <strong className="font-semibold">{renderInlines(token.children)}</strong>;
    case "em":
      return <em className="italic">{renderInlines(token.children)}</em>;
    case "code":
      return (
        <code className="rounded bg-white/10 px-1 py-px font-mono text-[0.9em]">
          {token.value}
        </code>
      );
    case "link":
      return (
        <a
          href={token.url}
          title={token.title}
          className="underline decoration-dotted underline-offset-2"
          style={{ color: "var(--vscode-textLink-foreground)" }}
          onClick={(e) => {
            // preventDefault: webview 内 navigation を抑止。
            // stopPropagation: 親の RenderedBlock ラッパが onClick で edit mode に
            // 遷移してしまうため、リンククリック時はそこに伝播させない。
            e.preventDefault();
            e.stopPropagation();
            post({ type: "openLink", url: token.url });
          }}
        >
          {renderInlines(token.children)}
        </a>
      );
    case "image":
      return <ImageInline url={token.url} alt={token.alt} title={token.title} />;
    case "break":
      return <br />;
  }
};

type ImageProps = { url: string; alt: string; title?: string; };

const ImageInline = ({ url, alt, title }: ImageProps): JSX.Element => {
  const cls = classifyUrl(url);
  if (cls.kind === "passthrough") {
    return <img src={cls.uri} alt={alt} title={title} className="my-1 max-w-full rounded" />;
  }
  if (cls.kind === "remote") {
    return (
      <span
        className="my-1 inline-flex items-center gap-2 rounded border border-dashed px-2 py-1 text-xs opacity-70"
        title={`オフライン制約により ${url} は読み込みません`}
      >
        <span aria-hidden>🖼</span>
        <span>{alt || url}</span>
      </span>
    );
  }
  return <RelativeImage url={url} alt={alt} title={title} />;
};

const RelativeImage = ({ url, alt, title }: ImageProps): JSX.Element => {
  const resolved = useResolvedUri(url);
  if (resolved === undefined) {
    return (
      <span className="my-1 inline-block rounded border border-dashed px-2 py-1 text-xs opacity-50">
        画像を読み込み中… ({alt || url})
      </span>
    );
  }
  if (resolved === null) {
    return (
      <span className="my-1 inline-block rounded border border-dashed px-2 py-1 text-xs opacity-70">
        画像を解決できませんでした: {url}
      </span>
    );
  }
  return <img src={resolved} alt={alt} title={title} className="my-1 max-w-full rounded" />;
};
