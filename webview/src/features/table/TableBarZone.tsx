import type { ReactNode } from "react";

type Props = {
  // 位置指定クラス（罫線の上、または列 / 行の真ん中）。
  className: string;
  zoneId: string;
  active: boolean;
  onEnter: () => void;
  onLeave?: () => void;
  children: ReactNode;
};

// コントロール帯のホバー判定領域。罫線の上には挿入の ＋、列 / 行の上には
// 削除の − を割り当て、カーソルが乗っている 1 つだけがボタンを描画する。
// ＋ の判定を罫線そのものに持たせることで「どの線に入るのか」を位置で示す。
export const TableBarZone = (
  { className, zoneId, active, onEnter, onLeave, children }: Props,
): JSX.Element => (
  <div
    data-zone={zoneId}
    className={`absolute flex items-center justify-center ${className}`}
    onMouseEnter={onEnter}
    onMouseLeave={onLeave}
  >
    {active ? children : null}
  </div>
);
