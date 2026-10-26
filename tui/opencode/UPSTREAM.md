# OpenCode TUI vendor

- Repository: https://github.com/anomalyco/opencode
- Tag: `v2.1.0`
- Commit: `60c68d145a14127ce633e26aa5fdfb882a7baa6d` (2026-10-20)
- Vendored: 2026-10-24
- License: MIT; `LICENSE` is the upstream root license verbatim.

## Packages

Full upstream source:

- `client`
- `latex`
- `merman`
- `protocol`
- `schema`
- `theme`
- `tui`

Sliced to the TUI import graph:

- `core`: `src/util/slug.ts`, with a trimmed project config that satisfies the TUI's upstream TypeScript reference.
- `plugin`: TUI context/definitions and the host, runtime, source, and Promise entrypoints reachable from TUI plugin support; `@opencode/ai` and `@ai-sdk/provider` are not needed by those paths.
- `simulation`: `src/protocol/index.ts`
- `ui`: the five audio files imported by the TUI
- `util`: TUI-used activity calendar, flock/hash, global paths, runtime module loading, no-timeout fetch, open, retry, and session title utilities

Package manifests are reduced to the required exports and runtime dependencies so installing the nested project does not install unrelated OpenCode server, CLI, or UI dependencies. `packages/tui/package.json` remains from upstream. The root catalog keeps the tag's OpenTUI 0.6.6 and TypeScript 7.0.2 pins; `zod` is additionally pinned to Poracode's root version because the adapter imports shared Poracode contracts.

## Local patches

- `packages/tui/src/app.tsx`: optional adapter `fetch` is used by initial and reconnect clients; `plugins.local: false` skips project-local plugin discovery, and `plugins.server: false` disables host-reported plugin loading while leaving built-in system feature plugins intact. Each patch is marked `// poracode:`.
- `packages/tui/src/plugin/context.tsx`: gate host-reported plugin discovery and loading for embedded clients. This additional isolation patch was required because the live-server smoke exposed server-reported plugin paths into the user's `~/.config/opencode/plugins` directory.
- `packages/tui/tsconfig.json`: scope the package project to `src` plus `../../../src/dev/simulation-frontend.d.ts`, excluding upstream tests that require sliced server/simulation sources.
- `tui/src/dev/build-smoke.ts`: inject the upstream runtime-module loader map at build time so the standalone executable embeds Effect and plugin modules rather than looking for `node_modules` at runtime.
- `packages/core/tsconfig.json`: retain the upstream project-reference emit settings but include only the sliced `src/util/slug.ts`.
- `packages/util/src/global-roots.ts`: `PORACODE_TUI_HOME` maps the OpenCode data, cache, config, state, and temp roots directly under that directory without changing XDG variables. Marked `// poracode:`.
- `packages/util/src/global.ts`: ignore `OPENCODE_CONFIG_DIR` while `PORACODE_TUI_HOME` is set so the explicit OpenCode-only override cannot bypass isolation. Marked `// poracode:`.
- `packages/{client,core,latex,merman,plugin,protocol,schema,simulation,theme,ui,util}/package.json`: trimmed to the export maps and dependency edges required by the vendored TUI graph. The plugin manifest retains the upstream root and TUI/runtime entrypoints used for TUI plugins but omits unrelated AI/provider dependencies.

The dev harness clears `OPENCODE_DRIVE`, and the compile smoke externalizes `@opencode/simulation/frontend`. That development-only drive mode is not part of the required simulation protocol slice.

- `tui/src/dev/simulation-frontend.d.ts`: compile-time signature for the omitted, optional simulation frontend; it has no runtime implementation.
- `packages/tui/src/brand.ts`, `packages/tui/src/logo.ts`, and `packages/tui/src/component/logo.tsx`: central Poracode identity, desktop-derived palette anchors, legacy theme display labels, and the ASCII Pora-dot wordmark.
- `packages/tui/src/theme/poracode.ts`, `packages/tui/src/theme/v1.ts`, `packages/tui/src/theme/index.ts`, `packages/tui/src/context/theme.tsx`, `packages/tui/src/config/index.tsx`, `packages/tui/src/component/dialog-config.tsx`, `packages/tui/src/component/dialog-theme-list.tsx`, `packages/tui/src/component/theme-error-toast.tsx`, and `packages/tui/src/mini/theme.ts`: register the built-in `poracode` theme, use it for new and missing selections, preserve explicit user themes, and fall back to Poracode for invalid custom themes.
- `packages/theme/src/tui/schema.ts`, `packages/theme/src/tui/types.ts`, `packages/theme/src/tui/resolve.ts`, and `packages/theme/src/tui/v1-migrate.ts`: add the semantic `text.brand` token; legacy themes inherit a compatible accent when the optional token is absent.
- `packages/tui/src/app.tsx`, `packages/tui/src/attention.ts`, `packages/tui/src/ui/dialog-help.tsx`, `packages/tui/src/component/dialog-status.tsx`, `packages/tui/src/component/dialog-debug.tsx`, `packages/tui/src/component/error-component.tsx`, `packages/tui/src/component/terminal-pane.tsx`, `packages/tui/src/util/error.ts`, `packages/tui/src/util/error-details.ts`, `packages/tui/src/routes/session/permission.tsx`, `packages/tui/src/mini/footer.permission.tsx`, `packages/tui/src/mini/footer.prompt.tsx`, `packages/tui/src/mini/runtime.lifecycle.ts`, and `packages/tui/src/feature-plugins/system/stats.tsx`: rebrand user-facing identity, use the Poracode help URL, and replace the upstream crash-issue link with a local diagnostic report.
- `packages/tui/src/feature-plugins/sidebar/footer.tsx`, `packages/tui/src/component/prompt/index.tsx`, `packages/tui/src/component/dialog-model.tsx`, `packages/tui/src/config/keybind.ts`, and `packages/tui/src/config/v1/keybind.ts`: disable provider connection onboarding while retaining stored command and keybind identifiers.
- `packages/tui/src/feature-plugins/system/storybook/highlights.tsx`: replace product identity in the opt-in story fixture.
- `packages/tui/src/logo.ts` (block-art exports), `packages/tui/src/util/presentation.ts`, `packages/tui/src/mini/splash.ts`, `packages/tui/src/mini/demo.ts`, `packages/tui/src/util/tool-display.ts`, `packages/tui/src/component/dialog-update.tsx`, `packages/tui/src/component/dialog-pair.tsx`, `packages/tui/src/component/devtools-bar.tsx`, `packages/tui/src/context/keymap.tsx`, and `packages/tui/src/feature-plugins/system/storybook/{session-tabs,session-location-missing,link-clicks,merman-layouts,one-cell-spinner}.tsx`: Poracode block art and `P` mark, `poracode tui --session` resume command, `poracode` direct-mode label, first-party provider label, dormant update-dialog copy, remote-serve instruction, debug-snapshot filename, and neutral story/demo fixtures.
- `packages/tui/src/context/theme.tsx`: the selection memo only rewrites the active theme on a load failure; a merely missing selection keeps its name so late-registered themes still resolve (upstream semantics with the Poracode fallback).
- `packages/tui/test/feature-plugins/sidebar-footer.test.tsx`, `packages/tui/test/poracode-branding.test.tsx`, and `packages/theme/test/theme.test.ts`: cover hidden provider onboarding, rendered home branding, built-in light/dark defaults, and compatibility for older theme documents.

## Re-sync

The vendored tree is reproduced from the pinned tag plus the executable patch series in `patches/`. `bun scripts/regenerate-tui-patches.mjs` fetches the tag, diffs it against the vendored tree, rewrites `patches/NNNN-*.patch` (one per changed file), and verifies that re-applying the series onto a fresh extract reproduces `tui/opencode` byte-for-byte. Regenerate after every intentional vendored edit.

`bun scripts/sync-tui-upstream.mjs --tag vX.Y.Z` performs a dry-run sync: fetch the tag, rebuild the vendored subset from upstream paths that still exist, apply `patches/*`, and report upstream-removed paths, patch conflicts (`*.rej` written into the staged tree), and upstream-added files inside the sliced packages (reported, not adopted). With `--apply` and zero conflicts it writes the refreshed tree (local-only files carry over); then update this file with the new tag/commit/package slices, run `bun install` from `tui/`, `bun run --cwd tui typecheck`, `bun run --cwd tui test`, the vendored TUI package typecheck, and both source and compiled PTY smokes before accepting the refresh.
