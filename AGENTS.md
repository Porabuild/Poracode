# Poracode

Universal AI agent orchestrator: an Electron desktop app (plus web, iOS, and Android clients) that runs many coding-agent providers through real PTY sessions (terminal presentation) and provider structured runtimes (native chat presentation).

`CLAUDE.md` is a symlink to this file. Keep one copy of each rule; put procedures in skills (`.agents/skills/`) and subsystem detail in `.agents/docs/`.

## Commands

- Package manager: `pnpm` (version pinned in `package.json#packageManager`); Node >= 24.10.0.
- `pnpm run dev` — run the app. `pnpm run build` then `pnpm run dist` — package it.
- `pnpm run typecheck` (TypeScript 7 native), `pnpm run lint` (oxlint), `pnpm run fmt` / `pnpm run fmt:check` (oxfmt), `pnpm run test` (vitest).
- Targeted tests: `pnpm exec vitest run <paths>`. Jest-only flags such as `--runInBand` do not exist here.
- The pre-commit hook runs lint-staged (oxlint `--type-aware --fix --deny-warnings`, oxfmt) and then `pnpm run typecheck`.

## Invariants

These protect process ownership, the provider plugin model, and users' persisted data. Breaking one is a bug even if tests pass.

- **Presentation decides the process.** A terminal-presentation thread is backed by a real PTY process; a GUI-presentation thread is backed by the provider's structured runtime process. The active presentation surface is the source of truth.
- **Only the supervisor runtime spawns agent processes.** The renderer never does, because it can be remote, reloaded, or attached to a different host.
- **Shared code is provider-agnostic.** Providers are self-contained plugins (supervisor adapter + renderer UI). Shared runtime, UI, and layout code contains no provider name, no `kind === "<provider>"` branch, and no constant, regex, parser, or state field that exists for one agent. When a provider needs different behavior, add a named, documented capability option to the shared module and declare its value in the provider folder; vendor payloads are parsed behind a provider-supplied hook. Adding a provider should need zero edits to existing shared files. Before touching a shared file for one provider, read [Provider Isolation — Hard Rules](.agents/docs/agent-adapters.md#provider-isolation--hard-rules).
- **Every compatibility boundary is versioned on purpose.** Persisted state, caches and derived indexes, serialized manifests, wire/IPC protocols, and deployed helpers/plugins can meet artifacts written by an older or newer app. When you change one, audit its version and every mirrored copy, and add a migration or a version bump with a pre-upgrade regression test. Checklist and inventory: [versioning.md](.agents/docs/versioning.md).
- **User-facing renderer strings are localized in the same change.** Wrap them in a Lingui macro, run `pnpm i18n:extract`, and fill the new `msgstr` in all 12 non-English catalogs; an empty translation ships a half-English UI. Full procedure: [i18n.md](.agents/docs/i18n.md).
- **Windows projects use a native Windows cwd.** WSL agent commands run through `wsl.exe -d <distro> --cd <linuxPath> --exec <agent command>`.

## Conventions

- **React:** React Compiler handles memoization; add `useMemo`, `useCallback`, or `React.memo` only to escape it. Keep `babel-plugin-react-compiler` pinned to an exact version. Store subscription and render rules: [editing-rules.md](.agents/docs/editing-rules.md).
- **UI:** HeroUI v3 for all non-terminal UI; use the `heroui-react` skill when working with its components. Follow existing app patterns and shared variants before raw library defaults, and keep visual scope to what was asked. For an absolutely positioned tooltip, put the positioning on an out-of-flow wrapper around a normally positioned `Tooltip.Trigger`; the trigger is `inline-block` and otherwise anchors to the wrong box.
- **Providers:** normalize provider-native payloads at the provider boundary, and look for an existing extension point before editing a shared module. When changing a provider's behavior, check its current payloads or protocol, and cross-provider parity where it applies.
- **Debugging:** for runtime and chat bugs (timers, notifications, resume, launch), trace thread runtime state before changing the display layer. For performance complaints, look for render invalidation, measurement loops, and sync I/O before cosmetic fixes.
- **File size:** split a file into focused modules once it grows past one responsibility rather than extending it; large mixed files are where regressions hide.
- **TypeScript:** with `exactOptionalPropertyTypes`, use a conditional spread instead of passing `undefined` to an optional prop.
- **Scratch output:** investigation dumps, screenshots, and temporary files go in `tmp/` or `.tmp/` (gitignored), never the repo root or tracked folders.

## Done means

- The requested change works, with no unrequested features, refactors, or docs. Tests that prove the change, and any regression test a rule above requires, are part of the change.
- Checks ran for real: for a focused change, nearby tests plus touched-file lint and format plus `pnpm run typecheck`; when asked to make everything green or before a PR is marked ready, the full gate. The `verify` skill owns the exact list.
- The report names what was verified and what was not.

## Commits and pull requests

Commit or open a PR only when asked. The `commit`, `pull-request`, and `address-pr-feedback` skills hold the procedure; the essentials:

- Subject and PR title: `type(scope): subject`, imperative, lowercase after the colon, no trailing period, ≤ 72 characters.
- Work tied to a GitHub issue puts the issue number first: `#123 fix(sidebar): show worktree identity while pending`, branch `123-short-slug`, PR body starting with `Closes #123`. Never invent an issue number.
- Commit bodies explain why. Stage explicit paths. Never bypass hooks with `--no-verify`.
- PRs target `master`, open as drafts unless the user says ready, and follow `.github/PULL_REQUEST_TEMPLATE.md`: Summary, Why, Benefits, How verified, Before / After screenshots for any visible UI change, Risk & rollback.

## Skills

Procedures live in `.agents/skills/` (`.claude/skills` is a symlink to it):

- `finalize` — review, manual QA, fix, verify, commit, push, PR, and merge after checks pass when the user says "Finalize".
- `commit`, `pull-request`, `verify`, `address-pr-feedback` — the individual change workflows.
- `interactive-testing` — drive the real Electron app over CDP, including screenshots; `provider-chat-smoke` extends it for provider chat and ACP sessions.
- `mobile-apps` — mobile web/PWA, iOS, and Android work.
- `release-notes` — changelog entries for a release.
- `heroui-react` — vendored HeroUI v3 reference (tracked in `skills-lock.json`; update from upstream, don't edit).

## Docs

Read the doc for the area you are changing:

- [architecture.md](.agents/docs/architecture.md) — process layers, transports, store organization, build, database, git.
- [agent-adapters.md](.agents/docs/agent-adapters.md) — provider isolation rules, adapter contract, plugin architecture, new-provider checklist.
- [provider-notes.md](.agents/docs/provider-notes.md) — per-provider behavior; read before changing one provider.
- [provider-runtime.md](.agents/docs/provider-runtime.md) — shared ACP, MCP launch, and hook runtime subsystems.
- [editing-rules.md](.agents/docs/editing-rules.md) — React Compiler, store subscriptions, render isolation, cleanup.
- [ui-patterns.md](.agents/docs/ui-patterns.md) — component reuse, dialogs, theme, layout, module loading.
- [i18n.md](.agents/docs/i18n.md) — localization workflow, macros, terminology.
- [versioning.md](.agents/docs/versioning.md) — compatibility-boundary checklist and inventory. Past rationale is archived in `docs/versioning-history.md`; don't load it by default.
- [computer-use.md](.agents/docs/computer-use.md) — the `computer_use` MCP server and native helper; only when changing that subsystem.
- [docs/MOBILE_DEV.md](docs/MOBILE_DEV.md) — `pnpm run dev:ios`, simulator pairing, deep linking.
