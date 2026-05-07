import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

// VS Code が body に付与するテーマクラスから dark/light を判定する。
// 高コントラストも dark 寄りにまとめる。テーマ動的切替は MVP では未対応で、
// 開いたタイミングのテーマで初期化する。
const isDarkTheme = (): boolean => {
  const cls = document.body.classList;
  return cls.contains("vscode-dark") || cls.contains("vscode-high-contrast");
};

let initialized = false;
const ensureInit = (): void => {
  if (initialized) return;
  // securityLevel: "strict" によりラベル内 HTML / クリックハンドラ等が
  // 無効化され、CSP 違反になるような動的スクリプトを mermaid 自身が
  // 出さなくなる。バンドル済みなので外部通信は発生しない。
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: isDarkTheme() ? "dark" : "default",
    fontFamily: "var(--vscode-font-family, sans-serif)",
  });
  initialized = true;
};

let renderSeq = 0;

type Props = {
  value: string;
};

export const MermaidView = ({ value }: Props): JSX.Element => {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);

  useEffect(() => {
    const token = ++tokenRef.current;
    if (value.trim() === "") {
      setSvg(null);
      setError(null);
      return;
    }
    ensureInit();
    const id = `mmd-${++renderSeq}`;
    mermaid.render(id, value).then(
      (result) => {
        if (token !== tokenRef.current) return;
        setSvg(result.svg);
        setError(null);
      },
      (e: unknown) => {
        if (token !== tokenRef.current) return;
        setSvg(null);
        setError(e instanceof Error ? e.message : String(e));
      },
    );
    // mermaid.render は描画用 DOM を一時的に body へ追加することがあるため、
    // アンマウント時に取り残された要素を片付ける。`d${id}` は内部実装上の
    // プレフィックスだが strict セキュリティで副作用は無いため掃除のみ行う。
    return () => {
      const stray = document.getElementById(id);
      if (stray && stray.parentNode) stray.parentNode.removeChild(stray);
      const strayD = document.getElementById(`d${id}`);
      if (strayD && strayD.parentNode) strayD.parentNode.removeChild(strayD);
    };
  }, [value]);

  if (value.trim() === "") {
    return (
      <div className="px-3 py-2 text-xs opacity-50">
        Mermaid プレビューは空です（クリックして編集）
      </div>
    );
  }
  if (error) {
    return (
      <pre className="m-0 whitespace-pre-wrap px-3 py-2 font-mono text-xs"
        style={{ color: "var(--vscode-errorForeground, #f88)" }}
      >
        Mermaid 構文エラー: {error}
      </pre>
    );
  }
  if (svg === null) {
    return <div className="px-3 py-2 text-xs opacity-50">レンダリング中…</div>;
  }
  return (
    <div
      className="overflow-x-auto px-3 py-2 [&_svg]:max-w-full [&_svg]:h-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};
