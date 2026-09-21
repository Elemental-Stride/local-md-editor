const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
} as const;

export const PlusIcon = (): JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 12 12" {...stroke} aria-hidden="true">
    <line x1="6" y1="2.5" x2="6" y2="9.5" />
    <line x1="2.5" y1="6" x2="9.5" y2="6" />
  </svg>
);

export const MinusIcon = (): JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 12 12" {...stroke} aria-hidden="true">
    <line x1="2.5" y1="6" x2="9.5" y2="6" />
  </svg>
);

export const TrashIcon = (): JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    {...stroke}
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 4.5 H13" />
    <path d="M5.5 4.5 V13 H10.5 V4.5" />
    <path d="M6.5 4.5 V2.5 H9.5 V4.5" />
  </svg>
);

export const MergeIcon = (): JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 16 16" {...stroke} aria-hidden="true">
    <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
    <path d="M5 5 L7.4 7.4 M11 5 L8.6 7.4 M5 11 L7.4 8.6 M11 11 L8.6 8.6" />
  </svg>
);

export const UnmergeIcon = (): JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 16 16" {...stroke} aria-hidden="true">
    <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
    <line x1="2.5" y1="8" x2="13.5" y2="8" />
    <line x1="8" y1="2.5" x2="8" y2="13.5" />
  </svg>
);
