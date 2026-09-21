import type { ReactNode } from "react";

type Props = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  // 罫線上に置くための絶対配置クラス。
  className?: string;
  children: ReactNode;
};

// 行 / 列 / テーブルの操作に使う小さな正方形ボタン。アイコンだけだと意味が
// 伝わらないので、tooltip (title) と aria-label に日本語の操作名を必ず入れる。
export const TableControlButton = (
  { label, onClick, disabled, danger, className, children }: Props,
): JSX.Element => (
  <button
    type="button"
    title={label}
    aria-label={label}
    onClick={onClick}
    disabled={disabled}
    className={`flex h-[18px] w-[18px] items-center justify-center rounded-full opacity-60 transition-opacity hover:opacity-100 disabled:opacity-20 ${
      danger ? "hover:text-red-400" : ""
    } ${className ?? ""}`}
    style={{
      // 枠線は引かず、背景と薄い影だけで浮かせる。罫線まわりに枠が増えると
      // 表そのものの線と混ざって見分けが付かなくなるため。
      background: "var(--vscode-editorWidget-background)",
      boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
    }}
  >
    {children}
  </button>
);
