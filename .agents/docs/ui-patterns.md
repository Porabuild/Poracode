# UI Patterns & Component Reuse

## Component Reuse

Before creating a new component, check if an existing one handles the use case.

### Key Reuse Points

- **`ThreadComposer`** supports an `inputContent` prop that replaces the textarea with custom content (prompt options, approval panels). Use this for any agent interaction that replaces the text input — do not create separate panels.
- **`ThreadServerRequestPanel`** handles structured server requests (Codex App Server). Terminal-mode prompts use `inputContent` on the composer instead.
- **`StatusIcon`** is the shared animated icon wrapper. Provider icons (`ClaudeIcon`, `CodexStatusIcon`, `GeminiIcon`) are thin wrappers that pass their SVG path — do not duplicate animation logic.
- **`getStatusTone()`** maps thread status/attention to icon tone for all providers. Do not create per-provider tone mappers.
- **`ProviderIcon`** is the registry-based component that renders the correct icon by agent kind and tone. Use it rather than importing provider icons directly.
- **`BranchSelector`** handles branch picking and worktree creation in `ThreadDraftView`. Reuse it for any branch-related UI.
- **`OptionMenu`** is the dropdown for model/effort/permission selections. It supports custom label formatters via the provider registry.

## Provider Registration (Plugin Pattern)

The renderer is provider-agnostic. Provider-specific rendering is registered via side-effect imports in `src/renderer/components/providers/` — no provider-specific if/else in shared UI, layout, or thread components:

```
registerProviderIcon(kind, IconComponent)     — Icon for sidebar, thread header
registerModelLabels(kind, formatter)           — Model ID → display name
registerCommitGenDefaults(kind, defaults)      — Default model/effort for commit generation
```

Each provider directory (`claude/`, `codex/`, `gemini/`) contains its icon component and registration calls. The index file (`providers/index.ts`) re-exports all providers via side-effect imports.

Shared provider utilities live at the `providers/` root:

- `statusTone.ts` — Status → tone mapping
- `StatusIcon.tsx` — Animated status indicator
- `ProviderIcon.tsx` — Registry + lookup component
- `commitGen.ts` — Multi-provider commit generation with fallback

## Code Organization (Renderer)

| Directory                 | Purpose                                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/thread/`      | ThreadView, ThreadComposer, ThreadDraftView, TerminalPane, ThreadServerRequestPanel                                                                        |
| `components/terminal/`    | XTermSurface (xterm.js integration)                                                                                                                        |
| `components/devTerminal/` | DevTerminalPanel (shell session tabs)                                                                                                                      |
| `components/providers/`   | Per-provider icons/registration + shared provider utilities                                                                                                |
| `components/common/`      | Generic, provider-agnostic components (Button, Card, Input, TextArea, Select, OptionMenu, ContextMenu, PromptOptions, BranchSelector, SidebarButton, etc.) |
| `components/layout/`      | AppShell (sidebar + main + right panel), SplitPaneContainer (multi-pane)                                                                                   |
| `components/sidebar/`     | Sidebar with project/thread lists, drag-drop reordering, git status badges                                                                                 |
| `components/gitReview/`   | GitReviewOverlay, GitDiffContent (@git-diff-view/react), GitReviewSidebar (staging UI)                                                                     |
| `components/settings/`    | SettingsOverlay (theme, commit gen config)                                                                                                                 |
| `components/ui/`          | AppProvider (HeroUI + theme setup)                                                                                                                         |
| `state/`                  | Zustand stores (appStore, gitStore, devTerminalStore, sharedSettingsStore, updateStore)                                                                    |

## Theme System

Three modes: light, dark, system. Resolved via `useResolvedAppearance()` hook in `components/ui/provider.tsx`. Theme is applied as a class on the root element and synced to Electron window chrome via IPC. Terminal theme (xterm.js) reads CSS variables for background/foreground/cursor colors.

## Layout

- **AppShell**: Collapsible sidebar (220-500px, collapsed to 48px icon rail) + main content + optional right panel (320-700px). Drag-to-resize with localStorage persistence.
- **SplitPaneContainer**: Horizontal multi-pane for side-by-side threads (1-3 panes, equal initial distribution, 15% minimum each).
- Resizable panels use **local state only** (not Zustand) to avoid resize lag.

## Drag-and-Drop

- Sidebar supports reordering projects and threads via native drag API.
- Threads can be dragged from the sidebar to the pane area to open side-by-side.
- `src/renderer/state/reorder.ts` provides the `reorderArray` helper.
