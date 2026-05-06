import { useEffect, useRef, useState } from "react";

type Props = {
  defaultLabel: string;
  defaultUrl: string;
  onApply: (label: string, url: string) => void;
  onCancel: () => void;
};

export const LinkModal = (
  { defaultLabel, defaultUrl, onApply, onCancel }: Props,
): JSX.Element => {
  const [label, setLabel] = useState(defaultLabel);
  const [url, setUrl] = useState(defaultUrl);
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    urlRef.current?.focus();
    urlRef.current?.select();
  }, []);

  const submit = (): void => {
    if (url.trim() === "") {
      onCancel();
      return;
    }
    onApply(label, url.trim());
  };

  return (
    <div
      className="absolute left-0 top-full z-20 mt-1 w-72 rounded border p-2 text-xs shadow-lg"
      style={{
        background: "var(--vscode-editorWidget-background)",
        borderColor: "var(--vscode-editorWidget-border)",
        color: "var(--vscode-editorWidget-foreground)",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 opacity-70">リンクを挿入</div>
      <input
        ref={urlRef}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://example.com"
        className="mb-1 block w-full rounded border bg-transparent px-2 py-1 outline-none"
        style={{ borderColor: "var(--vscode-input-border, transparent)" }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="表示するテキスト (省略可)"
        className="mb-1 block w-full rounded border bg-transparent px-2 py-1 outline-none"
        style={{ borderColor: "var(--vscode-input-border, transparent)" }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            onCancel();
          }}
          className="rounded px-2 py-1 opacity-70 hover:opacity-100"
        >
          キャンセル
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            submit();
          }}
          className="rounded px-2 py-1"
          style={{
            background: "var(--vscode-button-background)",
            color: "var(--vscode-button-foreground)",
          }}
        >
          挿入
        </button>
      </div>
    </div>
  );
};
