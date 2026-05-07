import type { Block } from "@local-md-editor/shared";
import type { DragEvent, RefObject } from "react";
import { contentOf, reclassify, withDisplayValue } from "../blockTransforms.js";

// 1MB を超える画像は markdown へ data URL で埋め込むとファイルが肥大するため取り込まない（黙ってスキップ）。
const MAX_IMAGE_BYTES = 1_000_000;

const readAsDataUrl = (file: File): Promise<string | null> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve(typeof reader.result === "string" ? reader.result : null);
    });
    reader.addEventListener("error", () => resolve(null));
    reader.readAsDataURL(file);
  });

const hasImageFile = (files: FileList): boolean =>
  Array.from(files).some((f) => f.type.startsWith("image/"));

type Args = {
  block: Block;
  onChange: (next: Block) => void;
  taRef: RefObject<HTMLTextAreaElement>;
  editing: boolean;
};

type Return = {
  onTextareaDrop: (e: DragEvent<HTMLTextAreaElement>) => void;
  onDisplayDrop: (e: DragEvent<HTMLDivElement>) => void;
};

export const useImageDrop = ({ block, onChange, taRef, editing }: Args): Return => {
  // 画像の挿入位置: 編集中ならキャレット位置、そうでなければ末尾。
  // 表示専用ブロック（code / table）には挿入しない。
  const insertImageAtCursor = (url: string, alt: string): void => {
    if (!("source" in block)) return;
    if (block.kind === "table" || block.kind === "code") return;
    const md = `![${alt}](${url})`;
    const ta = taRef.current;
    const display = contentOf(block);
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

  const dropHandler = <T extends Element>(e: DragEvent<T>): void => {
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    if (!hasImageFile(e.dataTransfer.files)) return;
    e.preventDefault();
    e.stopPropagation();
    void handleFileDrop(e.dataTransfer.files);
  };

  return {
    onTextareaDrop: dropHandler<HTMLTextAreaElement>,
    onDisplayDrop: dropHandler<HTMLDivElement>,
  };
};
