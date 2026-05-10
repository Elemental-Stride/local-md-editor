# Changelog

All notable changes to this project will be documented in this file.

## 0.1.0 — 2026-05-10

Initial public release.

### Editor

- Custom editor for `.md` / `.markdown` files (registered as the default editor for these file types)
- Block-based editing: paragraph, heading (H1–H6), bullet / ordered / task lists, code, table, divider
- Inline formatting: bold, italic, inline code, links, images
- Slash command menu (`/`) for inserting and converting blocks
- Drag-and-drop block reordering
- Block-level keyboard navigation
- Undo / redo with `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z`
- Code block with syntax highlighting and language selector
- Mermaid diagram rendering inside `mermaid` code blocks (offline, bundled)
- Table editor with cell selection, merge / unmerge, row / column add / remove
- GFM pipe tables and HTML tables both render and round-trip safely; pipe form is preserved when the structure permits, with HTML fallback for `rowspan` / `colspan` and multi-line cells
- Search panel (`Cmd/Ctrl+F`) with highlight and navigation
- Command palette (`Cmd/Ctrl+P`) for quick block actions
- Image drag-and-drop (embedded as data URLs, ≤ 1 MB)
- Relative Markdown links (`./other.md`, `subdir/page.md`) open the linked file in VS Code; out-of-workspace targets prompt for confirmation

### Compatibility

- HTML comments (e.g. `<!-- markdownlint-disable -->`) are hidden in the editor view by default but preserved in the file, so markdownlint and similar tools keep working. Toggle via `localMdEditor.compatibility.hideHtmlComments`.

### Privacy & Safety

- Fully offline — no telemetry, analytics, or external network requests
- Strict Content Security Policy in the webview
- Files are read and written only when the user opens them in VS Code
- No background indexing or workspace scanning
- Markdown stays as plain Markdown — no proprietary on-disk format
- npm supply-chain hardening: 7-day minimum-release-age policy, `frozenLockfile`, deny-by-default `onlyBuiltDependencies`, and pinned `packageManager`
