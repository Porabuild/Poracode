# Poracode

Universal AI agent orchestrator with Electron, web/PWA, and independent native iOS and Android clients. A shared backend runs under the desktop app or an independent Node CLI server; its supervisor runs providers through real PTYs (terminal presentation) and structured runtimes (native chat presentation).

`CLAUDE.md` is a symlink to this file. Keep one copy of each rule; put procedures in skills (`.agents/skills/`) and subsystem detail in `.agents/docs/`.

## Commands

- Package manager: `Bun` (version pinned in `package.json#packageManager`); Node >= 24.10.0.
- Installed CLI: bare interactive `poracode` opens the TUI; use `poracode -p "PROMPT" --directory PATH` for one-shot runs and `poracode serve --open` for the web app.
- `bun run dev` — run the app. `bun run build` then `bun run dist` — package it.
- Local renderer builds skip hidden source maps; set `PORACODE_SOURCEMAPS=1` to generate them. Release CI generates them on the Sentry upload job.
- `bun run typecheck` (Bun, all available cores; `bun run typecheck:tsc` compares with TypeScript 7), `bun run lint` (Bun), `bun run fmt` / `bun run fmt:check` (Bun), `bun run test` (vitest).
- TUI: `bun run tui:install`, `bun run tui:typecheck`, `bun run tui:test`, `bun run tui:dev`; validation harness and compile smoke: `bun run --cwd tui dev:opencode-server` and `bun run --cwd tui build:smoke`.
- Targeted tests: `bun run vitest run <paths>`. Jest-only flags such as `--runInBand` do not exist here.
- The pre-commit hook runs lint-staged (Bun lint `--type-aware --fix --deny-warnings` and format) and then `bun run typecheck`.

## Invariants

These protect process ownership, the provider plugin model, and users' persisted data. Breaking one is a bug even if tests pass.

- **Presentation decides the process.** A terminal-presentation thread is backed by a real PTY process; a GUI-presentation thread is backed by the provider's structured runtime process. The active presentation surface is the source of truth.
- **Only the supervisor runtime spawns agent processes.** The renderer never does, because it can be remote, reloaded, or attached to a different host.
- **One authoritative owner per host data root.** Desktop and standalone hosts use the same ownership and persistence services. Clients command that owner and project its state; reconnect or attach must not create a second writer or promote cached client state to authority. Separate paired hosts retain separate state.
- **Shared code is provider-agnostic.** Providers are self-contained plugins (supervisor adapter + renderer UI). Shared runtime, UI, and layout code contains no provider name, no `kind === "<provider>"` branch, and no constant, regex, parser, or state field that exists for one agent. When a provider needs different behavior, add a named, documented capability option to the shared module and declare its value in the provider folder; vendor payloads are parsed behind a provider-supplied hook. Explicit registration follows the provider checklist; provider-specific behavior stays in provider folders. Before touching a shared file for one provider, read [Provider Isolation — Hard Rules](.agents/docs/agent-adapters.md#provider-isolation--hard-rules).
- **Every compatibility boundary is versioned on purpose.** Persisted state, caches and derived indexes, serialized manifests, wire/IPC protocols, and deployed helpers/plugins can meet artifacts written by an older or newer app. When you change one, audit its version and every mirrored copy, decide whether existing artifacts remain valid, and add a pre-upgrade regression test. Bump, migrate, or invalidate only as compatibility requires. Checklist and inventory: [versioning.md](.agents/docs/versioning.md).
- **User-facing renderer strings are localized in the same change.** Wrap them in a Lingui macro, run `bun run i18n:extract`, and fill the new `msgstr` in all 12 non-English catalogs; an empty translation ships a half-English UI. Full procedure: [i18n.md](.agents/docs/i18n.md).
- **Windows projects use a native Windows cwd.** WSL agent commands run through `wsl.exe -d <distro> --cd <linuxPath> --exec <agent command>`.

## Conventions

- **Placement:** before implementing a feature, consider state ownership, lifetime, affected clients, and platform dependencies, then choose the appropriate layer. Shared host behavior must work under both desktop and the independent CLI server; presentation and platform behavior can stay client-owned. Use the [architecture placement guide](.agents/docs/architecture.md#choosing-where-a-change-belongs), and trace existing callers before introducing a new service or transport.
- **React:** React Compiler handles memoization; add `useMemo`, `useCallback`, or `React.memo` only to escape it. Keep `babel-plugin-react-compiler` pinned to an exact version. Store subscription and render rules: [editing-rules.md](.agents/docs/editing-rules.md).
- **React UI:** HeroUI v3 for non-terminal renderer UI; use the `heroui-react` skill when working with its components. Before adding or styling a control, check for an existing shared component or variant and reuse it when it fits. Inspect nearby elements and match their component, size, icon scale, spacing, colors, borders, and hover/focus states; use a different treatment only when its role calls for it. Follow existing app patterns before raw library defaults, and keep visual scope to what was asked. For an absolutely positioned tooltip, put the positioning on an out-of-flow wrapper around a normally positioned `Tooltip.Trigger`; the trigger is `inline-block` and otherwise anchors to the wrong box.
- **Providers:** normalize provider-native payloads at the provider boundary, and look for an existing extension point before editing a shared module. When changing a provider's behavior, check its current payloads or protocol, and cross-provider parity where it applies.
- **Debugging:** for runtime and chat bugs (timers, notifications, resume, launch), trace thread runtime state before changing the display layer. For performance complaints, look for render invalidation, measurement loops, and sync I/O before cosmetic fixes.
- **File size:** split a file into focused modules once it grows past one responsibility rather than extending it; large mixed files are where regressions hide.
- **TypeScript:** with `exactOptionalPropertyTypes`, use a conditional spread instead of passing `undefined` to an optional prop.
- **Scratch output:** investigation dumps, screenshots, and temporary files go in `tmp/` or `.tmp/` (gitignored), never the repo root or tracked folders.
- **Test cleanup:** when a run finishes, fails, or you abandon it, delete the disposable trees it created. A managed smoke session under `~/.poracode-smoke` is a frozen app of about 2.6 GB: stop it, copy any report or screenshot you will cite into `tmp/`, then delete that session directory. Do the same for other large generated trees this run no longer needs (native-e2e run directories, derived data). Honor `PORACODE_NATIVE_E2E_KEEP=1`. Leave small evidence the open task still cites, including `tmp/pr-shots/`. Never delete another live session, the real Poracode profile, or the smoke parent itself. Procedure: [interactive-testing](.agents/skills/interactive-testing/SKILL.md#safety-and-teardown).

## Done means

- The requested change works, with no unrequested features, refactors, or docs. Tests that prove the change, and any regression test a rule above requires, are part of the change.
- Checks ran for real: for a focused change, nearby tests plus touched-file lint and format plus `bun run typecheck`; when asked to make everything green or before a PR is marked ready, the full gate. The `verify` skill owns the exact list.
- For shared behavior, check desktop and standalone composition paths and the affected client contracts. Verify relevant no-client, multi-client, and reconnect behavior; a renderer test alone does not prove host behavior or native-client parity. Platform-only work needs only its affected surfaces.
- The report names what was verified and what was not.
- Disposable test output this run created is gone, unless the user asked to keep that session. Cited smoke reports and screenshots live in `tmp/`; the session directory under `~/.poracode-smoke` does not.

## Commits and pull requests

Commit or open a PR only when asked. The `commit`, `pull-request`, and `address-pr-feedback` skills hold the procedure; the essentials:

- Subject and PR title: `type(scope): subject`, imperative, lowercase after the colon, no trailing period, ≤ 72 characters.
- Work tied to a GitHub issue puts the issue number first: `#123 fix(sidebar): show worktree identity while pending`, branch `123-short-slug`, PR body starting with `Closes #123`. Never invent an issue number.
- Commit bodies explain why. Stage explicit paths. Never bypass hooks with `--no-verify`.
- PRs target `master`, open as drafts unless the user says ready, and follow `.github/PULL_REQUEST_TEMPLATE.md`: Summary, Why, Benefits, How verified, Before / After (screenshots only when they help review a visible change), Risk & rollback.

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

- [architecture.md](.agents/docs/architecture.md) — feature placement, ownership, dependency boundaries, transports, stores, build, database, git.
- [agent-adapters.md](.agents/docs/agent-adapters.md) — provider isolation rules, adapter contract, plugin architecture, new-provider checklist.
- [provider-notes.md](.agents/docs/provider-notes.md) — per-provider behavior; read before changing one provider.
- [provider-runtime.md](.agents/docs/provider-runtime.md) — shared ACP, MCP launch, and hook runtime subsystems.
- [editing-rules.md](.agents/docs/editing-rules.md) — React Compiler, store subscriptions, render isolation, cleanup.
- [ui-patterns.md](.agents/docs/ui-patterns.md) — component reuse, dialogs, theme, layout, module loading.
- [i18n.md](.agents/docs/i18n.md) — localization workflow, macros, terminology.
- [versioning.md](.agents/docs/versioning.md) — compatibility-boundary checklist and inventory. Past rationale is archived in `docs/versioning-history.md`; don't load it by default.
- [computer-use.md](.agents/docs/computer-use.md) — the `computer_use` MCP server and native helper; only when changing that subsystem.
- [docs/MOBILE_DEV.md](docs/MOBILE_DEV.md) — `bun run dev:ios`, simulator pairing, deep linking.
