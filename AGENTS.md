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
- **Every user-facing string you add or change in `src/renderer` must be localized.** Wrap it in a Lingui macro, run `pnpm i18n:extract`, then fill the new `msgstr` in all 12 non-English catalogs — never ship empty translations (that leaves a half-English UI). See [Internationalization (i18n)](#internationalization-i18n).
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

## Internationalization (i18n)

Any time you add or edit a menu, button, dialog, label, placeholder, tooltip, toast, `aria-label`, or any other text the user can read, you must localize it in the same change. The renderer is localized with Lingui (`@lingui/*` v6). Source locale is `en`; there are **12 non-English catalogs** (`es`, `ru`, `uk`, `zh-CN`, `ja`, `pt-BR`, `de`, `fr`, `ko`, `pl`, `vi`, `tr`) at `src/renderer/locales/{locale}/messages.po`. Lingui scans **only `src/renderer`** — see the per-locale terminology table, gotchas, and "add a language" steps in [Internationalization (i18n)](.agents/docs/i18n.md).

### Step 1 — Wrap the string in the right macro for its context

**Inside a React component** — import the macros and pull `t` from the hook:

```tsx
import { Trans, useLingui } from "@lingui/react/macro";

function MyPanel() {
  const { t } = useLingui();
  return (
    <SettingsPage title={t`General`}>
      {/* JSX body text → <Trans>; it handles interpolation and nested markup */}
      <SettingRow description={<Trans>Choose the display language.</Trans>}>
        {/* attribute / string values → t`…` */}
        <Button aria-label={t`Save`}>{t`Save`}</Button>
      </SettingRow>
    </SettingsPage>
  );
}
```

- JSX text content → `<Trans>…</Trans>`. Attributes, `aria-label`, `title`, `placeholder`, and any plain string → `` t`…` ``.
- Interpolate with the value inline: `` t`Discard changes in ${path}?` `` or `<Trans>Removing {count} files</Trans>`.

**Module-level lists (option/menu definitions outside a component)** — `t` only exists at render time, so define labels lazily with `msg` and resolve them where they render:

```ts
import { msg } from "@lingui/core/macro";

export const themeOptions = [
  { id: "system", label: msg`System` },
  { id: "dark", label: msg`Dark` },
] as const;
// resolve at render: const { t } = useLingui(); ...options.map(o => ({ ...o, label: t(o.label) }))
// reuse the existing useLocalizedOptions() helper in views/SettingsOverlay/parts/settingsOptions.ts
```

**Non-React files (actions, command handlers, toasts)** — there is no hook, so translate eagerly through the singleton:

```ts
import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";

// verbatim from actions/agentLoginActions.ts and actions/projectActions.ts:
toast.warning(i18n._(msg`Add a project before signing in.`));
toast.danger(i18n._(msg`Stop the project's running threads before changing its folder.`));
// interpolate inline, just like in a component:
toast.warning(i18n._(msg`Unable to install ${label}.`));
```

**Text that originates outside the renderer (supervisor / main process)** — those processes carry no catalogs and must stay macro-free. Add a stable key to `src/shared/messages.ts`, add the matching `msg(...)` descriptor in `src/renderer/i18n/sharedMessages.ts`, and emit it with `msg("my.key", { param })`. `{param}` placeholders are interpolated by the resolver.

### Step 2 — Extract, then translate every locale

1. Run `pnpm i18n:extract`. This registers the new msgids across all 13 catalogs. Forgetting this is the most common mistake — the new IDs never reach the catalogs and the strings silently stay English.
2. **The catalogs are fully translated, not English-fallback.** Open each of the 12 non-English `messages.po` files and fill the new `msgstr ""` entries with a real translation. Leaving them empty ships a half-English UI. (`en` is the source locale and needs no `msgstr`.) Match the per-language terminology already used in the catalog — grep an existing entry first; keep product nouns like `Lightcode`, `WSL`, `.lightcode/worktrees` literal. The terminology cheat-sheet is in [i18n.md](.agents/docs/i18n.md).
3. Re-run `pnpm i18n:extract` to normalize `.po` formatting, and confirm the printed stats table shows **0 missing** for every locale.

### Checklist before you finish

- [ ] No raw user-facing string literals left in `src/renderer` JSX/attributes/toasts.
- [ ] `pnpm i18n:extract` run; stats table shows 0 missing in all locales.
- [ ] Every new `msgstr` filled in all 12 non-English catalogs (not just `en`).
- [ ] `pnpm run typecheck` and `pnpm run lint` pass on touched files.

## Guidelines

- [Architecture & Code Organization](.agents/docs/architecture.md)
- [Agent Adapter Rules](.agents/docs/agent-adapters.md)
- [UI Patterns & Component Reuse](.agents/docs/ui-patterns.md)
- [Editing & React Patterns](.agents/docs/editing-rules.md)
- [Internationalization (i18n)](.agents/docs/i18n.md)
