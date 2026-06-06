# Lightcode

Universal AI agent orchestrator — Electron desktop app managing Claude, Codex, and Gemini via real PTY sessions (terminal-native) and structured runtimes (native chat).

## Quick Reference

- **Package manager:** `pnpm` (11.2.2, pinned in `package.json#packageManager`)
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

## Working Rules

- For UI changes, follow existing app patterns first. Prefer shared variants and local component conventions over raw library defaults or new visual treatments.
- Keep visual scope tight. Do not add layout stabilizers, decorative styling, or state treatments unless they are part of the request.
- For runtime/chat bugs, trace the real state path before changing the display layer. Timer, notification, resume, and launch symptoms usually come from thread runtime state.
- For performance complaints, investigate render invalidation, measurement loops, and sync I/O before applying cosmetic workarounds.
- For provider work, normalize provider-native payloads at the provider boundary. Shared UI/runtime code should consume provider-agnostic shapes only.
- When changing Codex/OpenCode behavior, verify current provider payloads or protocol behavior and check cross-provider parity when applicable.
- For focused fixes, prefer nearby tests plus touched-file lint/format checks. If asked to fix all checks, run and make green: `pnpm run typecheck`, `pnpm run lint`, and `pnpm run test`.
- **Prevent God Files:** Do not allow files to grow indefinitely. If a file becomes complex or violates single-responsibility principles during your work, refactor it by extracting related logic into new modules or sub-components. Splitting files is preferred over extending existing ones.
- Use `pnpm exec vitest run ...` for targeted Vitest runs; do not use Jest-only flags like `--runInBand`.
- With `exactOptionalPropertyTypes`, avoid passing explicit `undefined` for optional props; use conditional spreads when needed.

## Guidelines

- [Architecture & Code Organization](.agents/docs/architecture.md)
- [Agent Adapter Rules](.agents/docs/agent-adapters.md)
- [UI Patterns & Component Reuse](.agents/docs/ui-patterns.md)
- [Editing & React Patterns](.agents/docs/editing-rules.md)
