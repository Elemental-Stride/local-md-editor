/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        editor: "var(--vscode-editor-background)",
        editorFg: "var(--vscode-editor-foreground)",
      },
    },
  },
  plugins: [],
};
