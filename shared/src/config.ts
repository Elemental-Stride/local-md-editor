export type EditorConfig = {
  compatibility: {
    // HTML コメント (例: <!-- markdownlint-disable -->) を Editor 上で非表示にする。
    // ファイル保存時にはコメントは保持されるため、他ツール (markdownlint 等) は引き続き動作する。
    hideHtmlComments: boolean;
  };
};

export const DEFAULT_EDITOR_CONFIG: EditorConfig = {
  compatibility: {
    hideHtmlComments: true,
  },
};
