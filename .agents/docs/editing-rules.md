# Editing & React Patterns

## React Compiler

React Compiler is enabled in the renderer via Vite 8, `@vitejs/plugin-react`, `@rolldown/plugin-babel`, and `babel-plugin-react-compiler`. It processes all `src/renderer/**/*.tsx` files.

- **Do not** add `useMemo`, `useCallback`, or `React.memo` by default. React Compiler is the default memoization strategy; manual memoization is an escape hatch for cases the compiler cannot optimize.
- Keep `babel-plugin-react-compiler` pinned to an **exact version** unless explicitly updating and revalidating.

## React Hooks

- `useEffect` is for real side effects and external synchronization only. Prefer `useEffectEvent` and `startTransition` when they fit the interaction.
- Components connect to Zustand stores directly — avoid prop drilling through intermediate components.

## Renderer Philosophy

- Keep the renderer thin. Hot-path logic belongs in the supervisor or shared helpers.
- Preserve terminal fidelity over convenience. Do not re-render CLI output as chat bubbles or semantic blocks.
- The terminal viewport is the source of truth. Sidebar badges, loading states, and attention markers are advisory only.

## Vite Configuration

- Use Vite 8 Rolldown-native config (e.g. `rolldownOptions`) over older Rollup-first patterns.
- Manual chunks are defined for xterm, git-diff, ui (HeroUI + React Aria), framework (React + Zustand + Zod), and vendor.

## Cleanup

- Always fix all tests broken by your changes — never leave failing tests behind.
- Remove all dead code introduced by your changes: unused imports, unreachable functions, orphaned types, stale test helpers, and dead modules/files.

## Linting & Formatting

- **Linter**: oxlint (Rust-based, with plugins: import, react, jsx-a11y, node, vitest). Config: `.oxlintrc.json`.
- **Formatter**: oxfmt (Rust-based, LF line endings). Config: `.oxfmtrc.json`.
- These are not ESLint/Prettier. Use `pnpm run lint` and `pnpm run fmt`.

## TypeScript

- Target: ES2024, strict mode, bundler module resolution.
- `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are enabled.
- Primary typecheck: `tsgo` (TypeScript native Rust implementation). Compat check: `tsc`.
