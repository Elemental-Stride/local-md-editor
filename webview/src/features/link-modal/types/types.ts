export type LinkPromptState = {
  selStart: number;
  selEnd: number;
  defaultLabel: string;
  defaultUrl: string;
};

export type LinkPromptController = {
  state: LinkPromptState | null;
  openFromTextarea: (ta: HTMLTextAreaElement) => void;
  apply: (label: string, url: string) => void;
  cancel: () => void;
};
