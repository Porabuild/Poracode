# Editing & React Patterns

## React Compiler

React Compiler is enabled in the renderer via Vite 8, `@vitejs/plugin-react`, `@rolldown/plugin-babel`, and `babel-plugin-react-compiler`. It processes all `src/renderer/**/*.tsx` files.

- Do not add `useMemo`, `useCallback`, or `React.memo` by default. React Compiler is the default memoization strategy; manual memoization is an escape hatch for cases the compiler cannot optimize, never a substitute for narrow store subscriptions — the lever for render cost is the selector shape.
- Keep `babel-plugin-react-compiler` pinned to an exact version unless explicitly updating and revalidating.

## React Hooks

- `useEffect` is for real side effects and external synchronization only. Prefer `useEffectEvent` and `startTransition` when they fit the interaction.

## Store Subscriptions & Render Isolation

The renderer's performance depends on narrow, primitive-returning Zustand selectors. The goal: editing or streaming one entity (thread A, file A, PR A, tab A) must not re-render its siblings. This section is the single source for these rules; other docs link here.

### 1. Never subscribe to whole objects or arrays when you only need a field

Bad — re-renders on any field of `prData`:

```ts
const pr = useGitStore((s) => s.prData[key]); // whole object
```

Good — primitive return, stable under `Object.is`:

```ts
const prState = useGitStore((s) => s.prData[key]?.state);
```

Primitive returns (`boolean`, `string`, `number`, `undefined`) are the preferred pattern. They do not need `useShallow`.

### 2. Per-entity hooks take the entity key as an argument

When rendering a list of N items, each row's subscription should be scoped to its own id/path/key:

```ts
export function useIsTabActive(path: string): boolean { ... }
export function useIsPathExpanded(path: string): boolean { ... }
export function useGitFile(storeKey: string, path: string, isWorktree: boolean): GitFileChange | undefined { ... }
export function usePrState(key: string): PrState | undefined { ... }
```

Row components call them directly — no `isSelected`/`isExpanded`/`file` props from the parent iterator. Selection changes then re-render only the outgoing and incoming rows, not all N.

### 3. `useShallow` only for array/object returns

Use `useShallow` when a selector must return an array or object. Do not wrap primitive selectors — it adds no value and obscures intent.

```ts
// array return — useShallow required
return useAppStore(useShallow((s) => (s.view.kind === "thread" ? s.view.panes : EMPTY)));

// primitive return — useShallow NOT needed
return useAppStore((s) => (s.view.kind === "thread" ? s.view.panes.length : 0));
```

Always return a **module-level sentinel** (`EMPTY_ARRAY`, `EMPTY_MAP`) instead of a fresh `[]` / `{}` in the selector — otherwise the reference changes every call and `useShallow` compares against a new object.

### 4. WeakMap caches keyed on store-array identity

When a selector must derive a per-entity value from a list (filter, group, lookup), build the derivation **once per array reference** and cache it in a `WeakMap<Array, Map<key, Value>>`. First caller builds O(N); subsequent callers are O(1) until the store replaces the array.

Use the shared `createArrayKeyedMap` helper in `state/derivations.ts` rather than hand-rolling the `WeakMap`:

```ts
// derivations.ts — first arg builds the per-key Map once per array reference
const getProjectThreads = createArrayKeyedMap((threads: Thread[]) =>
  buildProjectThreadsMap(threads, (t) => !t.archived),
);

// selector — O(1) after the first caller for a given array identity.
// The returned getter takes (array, key) and returns the value directly;
// the internal Map's .get is not exposed to callers.
const threads = getProjectThreads(allThreads, projectId) ?? EMPTY_THREADS;
```

Precedent: `state/derivations.ts` (`createArrayKeyedMap`), consumed by `hooks/uiSelectors.ts` and `state/gitSelectors.ts`.

### 5. Equality gates in store setters

A setter that always calls `set({ foo: value })` creates a new state reference even when `value` is unchanged, triggering every subscriber. Return `{}` when the new value is equal to the current one:

```ts
setGitReviewAsPanel: (v) =>
  set((state) => (state.gitReviewAsPanel === v ? {} : { gitReviewAsPanel: v })),

setGitReviewContext: (ctx) => {
  const prev = get().gitReviewContext;
  if (prev?.projectId === ctx?.projectId && prev?.worktreePath === ctx?.worktreePath) return;
  set({ gitReviewContext: ctx });
},
```

Apply this everywhere a setter might be called with the same value (panel toggles, tab titles, tree toggles, theme flips).

### 6. Non-subscribing reads for one-shot lookups

Reads that happen inside event handlers, effects, or validation checks — anything **not** driving a render — should use `useStore.getState()` (not the hook). Subscribing when you don't need reactivity is a silent re-render source.

```ts
// Inside an action handler — no subscription
async function handleMergePr() {
  const pr = useGitStore.getState().prData[key];
  ...
}

// Inside AppContent, where we're already subscribed to view but want a cheap liveness check
const storeThreads = useAppStore.getState().threads;
const hasValidPanes = view.panes.some((id) => storeThreads.some((t) => t.id === id));
```

### 7. Split God components into narrowly-subscribed subcomponents

A component that renders a tab strip, a file tree, or a PR card often ends up subscribing to "everything it might render" at the top. Every keystroke in one tab re-renders all tabs.

Fix it by splitting the component so each subcomponent subscribes only to what **it** renders:

- `FileEditorPane` → `TabStripHeader` (tab list) + `EditorBody` (active buffer content).
- `ProjectTreeView` → `TreeChildren` (per-directory entries) + `TreeEntryRow` (per-path flags); the debounced search query is owned by the `useProjectTree` hook.
- `GitReviewSidebar` → `PrSection(prKey)` + per-file `FileRow(path)`.

The row component's props are the **identifier** (`path`, `key`, `id`) and maybe stable callbacks — never the entity payload.

### 8. Domain stores over monolithic stores

When a new cross-cutting UI domain appears (tree expansion, panel visibility, editor tabs), give it its **own** Zustand store. One-store-per-app leads to broad subscriptions and eventually to God-state.

Existing stores are `src/renderer/state/*Store.ts` (see [Architecture → State Management](architecture.md#state-management)). A new store is cheap; broadening an existing one is expensive.

### 9. Cache-invalidation keys for lazy async work

When a component lazy-loads expensive data (diffs, highlights, content), key the cache on the **change identity** of the underlying entity — not on display concerns like theme. Theme flips should re-style without re-fetching.

```ts
// Re-fetch only when the file's actual change differs. Theme is NOT in the key.
const fetchKey = `${file.path}|${file.staged ? "s" : "u"}|${file.status}|${file.insertions}|${file.deletions}`;

useEffect(() => {
  if (loadedKeyRef.current === fetchKey) return;
  loadedKeyRef.current = fetchKey;
  // fetch...
}, [fetchKey, ...]);
```

### 10. No prop-drilling of store state

If a child needs a store value, the child reads it via a hook. Do not pass `selectedPath`, `openTabs`, `prData`, etc. through three layers of props — every intermediate component re-renders on unrelated changes. Pass only the identifier and stable callbacks; a row that needs to stage, close, or toggle calls the store action directly instead of receiving a stack of handler props.

## Renderer Philosophy

- Keep authoritative host behavior out of the renderer; choose its owner using the [architecture placement guide](architecture.md#choosing-where-a-change-belongs). Rendering, interaction, and client-state calculations belong in the client; a hot path alone is not a reason to move them to the supervisor.
- Preserve terminal fidelity over convenience. Do not re-render CLI output as chat bubbles or semantic blocks.
- The terminal viewport is the source of truth. Sidebar badges, loading states, and attention markers are advisory only.

## Vite Configuration

Use Vite 8 Rolldown-native config (e.g. `rolldownOptions`) over older Rollup-first patterns. Chunking and lazy loading: [UI Patterns → Module Loading](ui-patterns.md#module-loading).

## Cleanup

- Always fix all tests broken by your changes — never leave failing tests behind.
- Remove all dead code introduced by your changes: unused imports, unreachable functions, orphaned types, stale test helpers, and dead modules/files.

## Tooling

Lint and format with oxlint and oxfmt, not ESLint/Prettier (`.oxlintrc.json`, `.oxfmtrc.json`). Compiler settings, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, are in `tsconfig.json`.
