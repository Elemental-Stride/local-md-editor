import { type KeyboardEvent, useLayoutEffect, useRef } from "react";

type Props = {
  value: string;
  onChange: (next: string) => void;
  onBlur: () => void;
};

// セル編集用の textarea。行数を内容から数えるのではなく、実際に折り返した
// 高さ (scrollHeight) に合わせて伸ばす。固定行数だと、プレビューでは折り
// 返して見えていた長い文章が編集時に 1 行ぶんの高さに押し込められ、
// 末尾がセル内スクロールの向こうに隠れてしまうため。
export const TableCellEditor = ({ value, onChange, onBlur }: Props): JSX.Element => {
  const taRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    // 一度 auto に戻さないと、縮む方向の再計算ができない。
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  // 編集に入った直後はキャレットを末尾に置く。先頭に置かれると、書き足す
  // にも末尾を消すにも毎回移動が要るため。
  // autoFocus と layout effect の前後関係でキャレットが先頭に残ることが
  // あるので、次フレームでもう一度確定させる（BlockEditor と同じ対処）。
  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    const moveToEnd = (): void => {
      const end = el.value.length;
      el.setSelectionRange(end, end);
    };
    moveToEnd();
    const handle = requestAnimationFrame(moveToEnd);
    return () => cancelAnimationFrame(handle);
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") e.currentTarget.blur();
  };

  return (
    <textarea
      ref={taRef}
      autoFocus
      rows={1}
      // cols の既定値 (20) は列幅の下限として効いてしまうので 1 にし、
      // 実際の幅は w-full でセルに合わせる。
      cols={1}
      className="block w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent outline-none"
      value={value}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={handleKeyDown}
    />
  );
};
