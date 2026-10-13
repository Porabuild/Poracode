# UI Patterns & Component Reuse

Component decomposition and store-subscription rules (identifier props, per-entity hooks, no prop drilling) are in [Editing & React Patterns](editing-rules.md#store-subscriptions--render-isolation). Provider UI registration is in [Agent Adapter Rules](agent-adapters.md#plugin-architecture).

## Component Reuse

Before creating a new component, check whether an existing one handles the use case.

- **`ThreadComposer`** supports an `inputContent` prop that replaces the textarea with custom content (prompt options, approval panels). Use it for any agent interaction that replaces the text input — do not create separate panels.
- **`ThreadRuntimeRequestPanel`** handles structured server requests. Terminal-mode prompts use `inputContent` on the composer instead.
- **`StatusIcon`** is the shared animated icon wrapper. Provider icons are thin wrappers that pass their SVG path — do not duplicate animation logic.
- **`getStatusTone()`** maps thread status/attention to icon tone for all providers. Do not create per-provider tone mappers.
- **`ProviderIcon`** renders the correct icon by agent kind and tone from the registry. Use it rather than importing provider icons directly.
- **`BranchSelector`** handles branch picking and worktree creation in `ThreadDraftView`. Reuse it for any branch-related UI.
- **`OptionMenu`** is the dropdown for model/effort/permission selections. It supports custom label formatters via the provider registry.

### Dialogs

Match the canonical dialog look — do not restyle. Reference: `CreatePrModal`, `ContinueInProviderDialog`.

- **Form / input dialogs:** HeroUI `Modal` (`Modal.Backdrop` → `Container` → `Dialog`), kept compact (`Dialog` `sm:max-w-[~460px]`, `Modal.Body className="p-4"` with inner `gap-3`). Include a `Modal.CloseTrigger`.
- **Footer buttons:** Cancel is a muted ghost — `<Button slot="close" variant="ghost" className="text-muted">Cancel</Button>`. The confirm action is the white tertiary — `variant="tertiary"`. Do not use `variant="primary"` for the action in these dialogs.
- **Destructive confirms:** use the shared `ConfirmDialog` (`AlertDialog`) with `confirmVariant="danger"`; its Cancel is `variant="tertiary"` by convention.
- Keep dialog body height stable — avoid controls that appear/disappear as the user types (fold previews into an existing control rather than adding a conditional line).

## Code Organization (Renderer)

`src/renderer/components/` holds reusable building blocks grouped by domain (`thread/`, `composer/`, `terminal/`, `diff/`, `providers/`, `layout/`, …); `common/` is for generic, provider-agnostic components such as `OptionMenu`, `BranchSelector`, and `ProviderModelMenu`. `src/renderer/views/` holds feature screens and overlays (`MainView/` for the app shell, sidebar, and right panel; `SettingsOverlay/`, `GitReviewOverlay/`, and the other `*Overlay` / `*View` folders). List those directories to find the right home for new code; other top-level renderer folders include `state/` (Zustand stores), `hooks/` (cross-cutting hooks and selectors such as `uiSelectors.ts`), `actions/`, `commands/`, `theme/`, `lsp/`, `workers/`, and `utils/`.

## Theme System

Three modes: light, dark, system. Resolved via the `useResolvedAppearance()` hook in `components/ui/provider.tsx`. Theme is applied as a class on the root element and synced to Electron window chrome via IPC. The xterm.js terminal theme reads CSS variables for background/foreground/cursor colors.

## Layout

- **AppShell** (`views/MainView/parts/AppShell/`): collapsible sidebar (collapses to an icon rail) + main content + optional right panel, with drag-to-resize and persisted widths.
- **SplitPaneContainer**: recursive horizontal/vertical multi-pane tree for side-by-side threads (unbounded pane count, equal initial distribution, minimum share per pane).
- Resizable panels use local state only (not Zustand) to avoid resize lag.

## Module Loading

Vite 8 (Rolldown) splits renderer output into manual chunks (`xterm`, `git-diff`, `monaco`, `shiki`, `ui`, `framework`, `vendor`). Keep heavy code that is not needed at startup out of the initial chunk:

1. **Deferred features** — overlays and other heavy surfaces are wrapped with `preloadable()` (`utils/preloadable.tsx`, a `React.lazy` wrapper with an explicit `preload()`) in `src/renderer/deferredFeatures.ts`, and rendered inside a `<Suspense>` boundary (see `views/MainView/parts/AppOverlays.tsx`). Add new deferred surfaces there rather than calling `lazy()` ad hoc.
2. **Static imports within lazy boundaries** — child modules of a deferred surface use normal static imports; they load with the parent chunk.
3. **Idle-deferred hydration** — non-urgent startup work is scheduled via `requestIdleCallback` (with a `setTimeout` fallback) in `hooks/useAppHydration.ts`, keeping first paint cheap.

## Drag-and-Drop

- The sidebar reorders projects and threads via the native drag API.
- Threads can be dragged from the sidebar to the pane area to open side by side.
- `src/renderer/state/reorder.ts` provides the reordering helpers (`reorderIds`, `reorderThreadsInProject`, `reorderThreadBlockInProject`).
