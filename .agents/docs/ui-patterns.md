# UI Patterns & Component Reuse

## Component Decomposition

Keep components narrowly scoped to what they render. A "GOD component" — one that renders a tab strip, editor body, toolbar, and status row from a single top-level subscription — cascades re-renders through every subtree on any update. Split it into subcomponents and let each subscribe to its own slice.

- **Row/entry components take an identifier, not the entity payload.** `<FileRow path={p} />`, `<TreeEntryRow path={p} />`, `<PrSection prKey={k} />` — not `<FileRow file={...} />` with `isSelected` computed by the parent.
- **Subcomponents own their subscriptions.** A row reads its own "active / dirty / expanded / loading / drop-target" flags via per-entity hooks. Parent iterators only subscribe to the list of ids.
- **No prop drilling of store state.** If a child needs a store value, the child calls a hook. Intermediate components stay out of the subscription path.
- **No callback hell.** A row that needs to stage/close/toggle calls the store action directly (or uses a hook that does). Don't thread 6 handler props through every layer.

See `.agents/docs/editing-rules.md` → Store Subscriptions & Render Isolation for the mechanical rules (primitive selectors, WeakMap caches, equality gates, split-by-subscription).

## Component Reuse

Before creating a new component, check if an existing one handles the use case.

### Key Reuse Points

- **`ThreadComposer`** supports an `inputContent` prop that replaces the textarea with custom content (prompt options, approval panels). Use this for any agent interaction that replaces the text input — do not create separate panels.
- **`ThreadRuntimeRequestPanel`** handles structured server requests (Codex App Server). Terminal-mode prompts use `inputContent` on the composer instead.
- **`StatusIcon`** is the shared animated icon wrapper. Provider icons (`ClaudeIcon`, `CodexStatusIcon`, `GeminiIcon`) are thin wrappers that pass their SVG path — do not duplicate animation logic.
- **`getStatusTone()`** maps thread status/attention to icon tone for all providers. Do not create per-provider tone mappers.
- **`ProviderIcon`** is the registry-based component that renders the correct icon by agent kind and tone. Use it rather than importing provider icons directly.
- **`BranchSelector`** handles branch picking and worktree creation in `ThreadDraftView`. Reuse it for any branch-related UI.
- **`OptionMenu`** is the dropdown for model/effort/permission selections. It supports custom label formatters via the provider registry.

### Dialogs

Match the canonical dialog look — do not restyle. Reference: `CreatePrModal`, `ContinueInProviderDialog`.

- **Form / input dialogs:** HeroUI `Modal` (`Modal.Backdrop` → `Container` → `Dialog`), kept **compact** (`Dialog` `sm:max-w-[~460px]`, `Modal.Body className="p-4"` with inner `gap-3`). Include a `Modal.CloseTrigger`.
- **Footer buttons:** Cancel is a **muted ghost** — `<Button slot="close" variant="ghost" className="text-muted">Cancel</Button>`. The confirm/primary action is the **white tertiary** — `variant="tertiary"`. Do **not** use `variant="primary"` for the action in these dialogs.
- **Destructive confirms:** use the shared `ConfirmDialog` (`AlertDialog`) with `confirmVariant="danger"`; its Cancel is `variant="tertiary"` by convention.
- Keep dialog body height stable — avoid controls that appear/disappear as the user types (fold previews into an existing control rather than adding a conditional line).

## ACP Composer Behavior

- **Inline file mentions stay text-first, then serialize to structured segments.** `MentionInput` + the `serializeMentions.ts` helpers (`serializeToSegments` / `flattenSegments`) accept raw `@path` tokens, so repo-relative references like `@.agents/docs/ui-patterns.md` become `{ kind: "file" }` prompt segments on submit without requiring a picker chip.
- **ACP resource paths resolve from the active project root.** Relative file mentions and attachments are normalized before ACP conversion so Windows, WSL, spaces, and `file://` URIs stay valid.
- **GUI ACP threads support steering via follow-up submits while working.** A new submit during `working` interrupts the active turn, queues the follow-up as structured `{ prompt, segments, config }`, and drains queued turns FIFO once the session returns to `idle` / `needs_reply`.
- **Terminal presentation stays PTY-owned.** Do not add queueing or fake stop/steering UI to terminal-native threads; the terminal surface remains the source of truth there.

## Provider Registration (Plugin Pattern)

The renderer is provider-agnostic. Provider-specific rendering is registered via side-effect imports in `src/renderer/components/providers/` — no provider-specific if/else in shared UI, layout, or thread components:

```
registerProviderIcon(kind, IconComponent)     — Icon for sidebar, thread header
registerProviderLabel(kind, label)             — Provider kind → display name
registerCommitGenDefaults(kind, defaults)      — Default model/effort for commit generation
```

Each provider directory (`claude/`, `codex/`, `gemini/`) contains its icon component and registration calls. The index file (`providers/index.ts`) re-exports all providers via side-effect imports.

Shared provider utilities live at the `providers/` root:

- `statusTone.ts` — Status → tone mapping
- `StatusIcon.tsx` — Animated status indicator
- `ProviderIcon.tsx` — Registry + lookup component
- `commitGen.ts` — Multi-provider commit generation with fallback

## Code Organization (Renderer)

`src/renderer/` splits into reusable building blocks under `components/` and feature screens/overlays under `views/`.

| `components/` dir | Purpose                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `thread/`         | ThreadView, ThreadDraftView, ThreadComposer, TerminalPane, ChatPane, ThreadRuntimeRequestPanel, PresentationModeTabs          |
| `composer/`       | Composer parts — MentionInput, AttachmentBar, ComposerAddMenu, browserMcpScope                                                |
| `terminal/`       | XTermSurface (xterm.js integration), TerminalLinkProvider                                                                     |
| `diff/`           | DiffCardList                                                                                                                  |
| `providers/`      | Per-provider icons/registration + shared provider utilities                                                                   |
| `common/`         | Generic, provider-agnostic components (Button, Card, Input, OptionMenu, ContextMenu, BranchSelector, ProviderModelMenu, etc.) |
| `layout/`         | OverlayShell, PageLayout, SplitPaneContainer (multi-pane), pane/overlay chrome helpers                                        |
| `ui/`             | AppProvider (HeroUI + theme setup)                                                                                            |

| `views/` overlay/screen   | Purpose                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `MainView/`               | AppShell (sidebar + main + right panel), Sidebar (project/thread lists), RightPanel (DevTerminalPanel, BrowserPanel, UsagePanel) |
| `GitReviewOverlay/`       | GitReviewOverlay, GitDiffContent (@git-diff-view/react), GitReviewSidebar (staging UI)                                           |
| `SettingsOverlay/`        | SettingsOverlay (theme, commit gen config, native agent registry)                                                                |
| `FileEditorOverlay/`      | File editor tabs + body                                                                                                          |
| `ProjectSettingsOverlay/` | Per-project settings                                                                                                             |
| `PrReviewOverlay/`        | PR review                                                                                                                        |
| `LoginTerminalOverlay/`   | One-shot TUI auth terminal                                                                                                       |
| `ThreadSearchOverlay/`    | Thread search                                                                                                                    |

Other `src/renderer/` dirs: `state/` (Zustand stores — see architecture.md → State Management), `hooks/` (cross-cutting hooks + selectors, e.g. `uiSelectors.ts`), plus `actions/`, `commands/`, `theme/`, `lsp/`, `workers/`, `utils/`.

## Theme System

Three modes: light, dark, system. Resolved via `useResolvedAppearance()` hook in `components/ui/provider.tsx`. Theme is applied as a class on the root element and synced to Electron window chrome via IPC. Terminal theme (xterm.js) reads CSS variables for background/foreground/cursor colors.

## Layout

- **AppShell**: Collapsible sidebar (240-500px, collapsed to 48px icon rail) + main content + optional right panel (320-1100px). Drag-to-resize with localStorage persistence.
- **SplitPaneContainer**: Recursive horizontal/vertical multi-pane tree for side-by-side threads (unbounded pane count, equal initial distribution, 15% minimum each).
- Resizable panels use **local state only** (not Zustand) to avoid resize lag.

## Module Loading

Vite 8 (Rolldown) splits renderer output into manual chunks: `xterm`, `git-diff`, `monaco`, `shiki`, `ui`, `framework`, `vendor`. Heavy chunks that are not needed at startup should be lazy-loaded:

1. **`React.lazy()`** for overlay-level code splitting — wrap the component in `lazy()` + `<Suspense>`. The feature overlays (`GitReviewOverlay`, `FileEditorOverlay`, `PrReviewOverlay`, …) are lazy-loaded in `views/MainView/parts/AppOverlays.tsx`; `GitReviewOverlay` for instance pulls in the `git-diff` chunk only when opened.
2. **Static imports within lazy boundaries** — child modules (e.g. `GitDiffContent` inside `GitReviewOverlay`) use normal static imports. They load automatically when the parent chunk loads.
3. **Idle-deferred hydration** — non-urgent startup work is scheduled via `requestIdleCallback` (with a `setTimeout` fallback) in `hooks/useAppHydration.ts`, keeping first paint cheap.

Pattern in `AppOverlays.tsx`:

```tsx
const GitReviewOverlay = lazy(() =>
  import("@/renderer/views/GitReviewOverlay/GitReviewOverlay").then((m) => ({
    default: m.GitReviewOverlay,
  })),
);

// rendered inside a <Suspense> boundary
```

## Drag-and-Drop

- Sidebar supports reordering projects and threads via native drag API.
- Threads can be dragged from the sidebar to the pane area to open side-by-side.
- `src/renderer/state/reorder.ts` provides the reordering helpers (`reorderIds`, `reorderThreadsInProject`, `reorderThreadBlockInProject`).
