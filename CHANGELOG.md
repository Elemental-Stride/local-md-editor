# Changelog

All notable changes to this project will be documented in this file.

## 0.1.0 — 2026-05-07

Initial public release.

### Editor

- Custom editor for `.md` / `.markdown` files
- Block-based editing: paragraph, heading (H1–H6), bullet / ordered / task lists, code, table, divider
- Inline formatting: bold, italic, inline code, links, images
- Slash command menu (`/`) for inserting and converting blocks
- Drag-and-drop block reordering
- Block-level keyboard navigation
- Code block with syntax highlighting and language selector
- Mermaid diagram rendering inside `mermaid` code blocks (offline, bundled)
- Table editor with cell selection, merge / unmerge, row / column add / remove
- Search panel (`Cmd/Ctrl+F`) with highlight and navigation
- Command palette (`Cmd/Ctrl+P`) for quick block actions
- Image drag-and-drop (embedded as data URLs, ≤ 1 MB)

### Privacy & Safety

- Fully offline — no telemetry, analytics, or external network requests
- Strict Content Security Policy in the webview
- Files are read and written only when the user opens them in VS Code
- No background indexing or workspace scanning
- Markdown stays as plain Markdown — no proprietary on-disk format
