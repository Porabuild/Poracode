# Notes & To-dos Panel — Design

**Date:** 2026-06-08
**Goal:** Add a per-project Notes/To-dos panel to the right panel (iCloud Notes–style),
reusing a popular editor library, with the ability to spin up a new thread from a to-do
item or from selected note text.

## Decisions (locked with user)

- **Editor library:** TipTap v3 (headless ProseMirror; themes cleanly with Tailwind/HeroUI).
- **Structure:** Separate surfaces — a free-form rich-text **Notes** editor on top, a
  structured **To-dos** list (add / check / edit / reorder / delete) below.
- **New thread:** Pre-fill a draft composer with the to-do/selected text so the user can
  review/edit and pick model/mode before sending (does not auto-launch).
- **Storage:** App SQLite DB, scoped per project (private to the app, never touches the repo).

## Dependencies

- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm` (ProseMirror peer), `@tiptap/extensions`
  (Placeholder). BubbleMenu imported from `@tiptap/react/menus`.
- To-dos are a custom structured list (NOT TipTap TaskList) per the "separate" decision.

## Data model

`src/shared/contracts/notes.ts`

```ts
NotesTodoItem = { id: string; text: string; done: boolean; createdAt: string }
ProjectNotes  = { projectId: string; doc: unknown | null; todos: NotesTodoItem[]; updatedAt: string }
```

`doc` is the TipTap ProseMirror JSON document (opaque; stored as JSON), or `null` when empty.

## Persistence (mirrors `thread_runtime_items` pattern)

New SQLite table `project_notes` (one row per project), with its own targeted read/write
IPC — deliberately NOT folded into the app-store `dbSyncAll` snapshot, so large/frequently
edited note docs don't rewrite the entire projects+threads payload on each keystroke.

- **Schema:** `project_notes(project_id TEXT PRIMARY KEY, doc TEXT, todos TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)`.
  No FK; orphan cleanup is explicit (see below) to avoid an insert/sync FK race when a
  brand-new project's notes are written before the project row syncs.
- **Migration:** `db.ts` adds `CREATE TABLE IF NOT EXISTS project_notes ...` to the init block
  and a `storedVersion < 16` step; `SCHEMA_VERSION` bumped 15 → 16.
- **Functions:** `dbGetProjectNotes(projectId): ProjectNotes | null`,
  `dbSetProjectNotes(notes: ProjectNotes): void` (upsert).
- **Cleanup:** `dbDeleteProject` and the project-deletion loop in `dbSyncAll` also
  `DELETE FROM project_notes WHERE project_id = ?`.
- **IPC:** `dbGetProjectNotes` / `dbSetProjectNotes` added to `procedures/db.ts`,
  `schemas.ts` (payloads), `procedureMap.ts` (`MAIN_LOCAL_PROCEDURE_NAMES`), and
  `localHandlers.ts`. Preload bridge auto-wires via `createInvokeBridge`.

## Renderer state — `src/renderer/state/notesStore.ts`

Standalone Zustand store (NOT persisted through the app-store middleware). Per-project
cache `{ status, doc, todos }`. Actions: `ensureLoaded`, `setDoc`, `addTodo`, `toggleTodo`,
`updateTodoText`, `removeTodo`, `reorderTodos`, `flush`, `flushAll`. Mutations schedule a
~600ms debounced `dbSetProjectNotes`; `flush`/`flushAll` (panel close, beforeunload) write
immediately. Missing-bridge (tests) is handled gracefully — in-memory only.

## New-thread seeding — `src/renderer/actions/notesActions.ts`

`newThreadFromText(projectId, text)`:

1. Merge `text` into the project's draft text (append to any in-progress prompt; preserve
   file/attachment segments).
2. Push a one-shot **composer seed** (`draftSlice.setComposerSeed`) so the draft composer
   applies it whether it mounts fresh or is already open.
3. `openNewThread(projectId)` (respects side-by-side `newThreadMode`).

`ThreadDraftComposerArea` consumes a pending seed on mount and on nonce change via the
existing `MentionInput` ref (`restoreFromSegments`), then clears it.

## UI

`src/renderer/views/MainView/parts/RightPanel/parts/NotesPanel/`

- `NotesPanel.tsx` — container; `ensureLoaded(projectId)`; stacked layout: Notes editor
  (top, scroll) over To-dos list (bottom, scroll), split by a thin divider; flushes on unmount.
- `NotesEditor.tsx` — TipTap `useEditor` (StarterKit + Placeholder); `onUpdate` →
  `setDoc`; **BubbleMenu** on selection with "✦ New thread from selection" (+ bold/italic).
- `TodoList.tsx` / `TodoRow.tsx` — add input; each row: checkbox, inline-editable text,
  hover "New thread" action, and a right-click context menu ("New thread from this to-do",
  "Delete"); drag-to-reorder reusing the repo's reorder helper.

## Right-panel integration

- `panelStore.ts`: `RightPanelTab` gains `"notes"`; add `notesPanelOpen` + setter +
  `openNotesPanel()`; include in `closeAllPanels`.
- `panelActions.ts`: `openNotesPanel()` (toggle-closes if already active, like usage).
- `UnifiedRightPanel.tsx`: `notesContent` prop, `showNotesTab`, a `NotebookPen` tab button,
  and a content layer.
- `ProjectAuxiliaryPanel.tsx`: resolve active project scope → render `<NotesPanel projectId>`,
  wire `onOpenNotes`. Notes tab shown for all scopes (including Home — it's a scratchpad).

## Styling

ProseMirror/editor styles (placeholder, list spacing, focus) added to
`src/renderer/styles.css`, scoped to a `.lc-notes-editor` wrapper using existing design
tokens (`--foreground`, `--muted`, `--border`, `--accent`).

## Testing

- `vitest` unit tests: notesStore (todo CRUD/reorder, debounced-persist scheduling, flush,
  lazy load), `newThreadFromText` (seed + nonce + openNewThread), contract schema parse.
- No node-vitest test for the `db.ts` round-trip: `better-sqlite3` is rebuilt against
  Electron's ABI and cannot load under plain-node vitest. The DB path is exercised by the
  interactive smoke test instead.
- `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check`, `pnpm test`, `pnpm build`.
- Interactive smoke test of the panel via the interactive-testing skill.

## Out of scope (YAGNI)

Markdown import/export, cross-project notes, collaboration, attachments in notes,
slash-command blocks. To-dos use TipTap-free custom rows; no TaskList extension.
