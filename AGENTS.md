# Lightcode

Terminal-native AI agent orchestrator — Electron desktop app managing Claude, Codex, and Gemini CLIs via real PTY sessions plus provider structured runtimes.

## Quick Reference

- **Package manager:** `pnpm` (10.30.3)
- **Node:** >= 24.10.0
- **Typecheck:** `pnpm run typecheck` (tsgo) / `pnpm run typecheck:compat` (tsc)
- **Lint:** `pnpm run lint` (oxlint)
- **Format:** `pnpm run fmt` (oxfmt) / `pnpm run fmt:check`
- **Test:** `pnpm run test` (vitest)
- **Dev:** `pnpm run dev`
- **Build:** `pnpm run build` then `pnpm run dist`

## Critical Rules

- Terminal-presentation threads must be backed by a real PTY process; GUI-presentation threads must be backed by the provider structured runtime process. The active presentation surface is the source of truth.
- The renderer must never spawn agent processes — the supervisor runtime owns all agent processes.
- React Compiler is the default memoization strategy. Do not add `useMemo`, `useCallback`, or `React.memo` unless escaping the compiler. Keep `babel-plugin-react-compiler` pinned to an exact version.
- Use HeroUI v3 for all non-terminal UI. When working with HeroUI components, always load the `heroui-react` skill first (`/skill heroui-react`).
- The codebase is provider-agnostic. Providers are self-contained plugins — both supervisor adapters and renderer UI. No provider-specific if/else in shared runtime, UI, or layout code. Adding a new provider should require zero changes to existing shared files.
- Windows projects use native Windows cwd. WSL projects run through `wsl.exe -d <distro> --cd <linuxPath> -- <agent command>`.

## Guidelines

- [Architecture & Code Organization](.agents/docs/architecture.md)
- [Agent Adapter Rules](.agents/docs/agent-adapters.md)
- [UI Patterns & Component Reuse](.agents/docs/ui-patterns.md)
- [Editing & React Patterns](.agents/docs/editing-rules.md)

## Cursor Cloud specific instructions

### Environment

- **Node.js 24.15+** is required (`engines.node` in `package.json` is `>=24.10.0`). Use `nvm` to install/activate: `nvm use 24` (the update script handles this).
- **pnpm 10.33.0** is the package manager (declared via `packageManager` field). Activated through `corepack enable && corepack prepare pnpm@10.33.0 --activate`.
- After `pnpm install`, the `postinstall` script automatically runs `electron-rebuild --only better-sqlite3` and `scripts/ensure-native-deps.mjs` to compile native addons (`better-sqlite3`, `node-pty`).

### Running the app

- `pnpm run dev` launches three concurrent processes (Vite renderer on port 3100, tsdown --watch for main/supervisor, and electronmon for hot-reloading Electron). The app requires `DISPLAY` to be set (Xvfb is fine).
- D-Bus errors in the console are harmless in headless/container environments.
- WSL/codex/cursor hook install failures are expected on Linux — those are Windows-only features.
- The app stores its SQLite database at `~/.lightcode-dev/state.sqlite` in dev mode.

### Agent CLIs

- For full end-to-end testing, install agent CLIs globally: `npm install -g @anthropic-ai/claude-code @google/gemini-cli`.
- The supervisor detects agents via `command -v <binary>` in a login shell. Binary names: `claude`, `gemini`, `codex`, `copilot`, `cursor-agent`, `opencode`.
- Gemini requires OAuth (a browser sign-in window opens on first detection). Claude requires `ANTHROPIC_API_KEY` for authenticated use but launches successfully without it.

### Testing caveats

- 4 tests in `base.windows-path.test.ts` and `acp/session.test.ts` fail on Linux because they test Windows-specific path normalization. These are pre-existing and expected on non-Windows.
- `pnpm run test` runs vitest; `pnpm run lint` runs oxlint; `pnpm run typecheck` runs tsgo.
- The pre-commit hook runs `pnpm run lint:fix && pnpm run typecheck && git add -u`.
