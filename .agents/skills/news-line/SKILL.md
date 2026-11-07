---
name: news-line
description: Adds or changes content in Poracode's new-thread news line - feature discovery entries for new or existing features, remote announcements in news.json, release-note feature links, keyboard tips, and community promotions. Use when shipping a new user-facing feature or surface (Settings section, sidebar shortcut, built-in MCP server), when asked to announce or promote something in the app, to post news without an app release, or when the feature catalog coverage test fails.
---

# News line — Poracode

The news line rotates insights, changelog points, announcements, feature discovery, usage, tips, and promotions below the new-thread composer. Read [news-line.md](../../docs/news-line.md) for how it works; this skill is the procedure.

Pick the path:

| Goal                                      | Path                                                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A new feature or surface ships            | [Add a discovery entry](#add-a-discovery-entry) and [link the release note](#link-the-release-note) |
| The coverage test fails                   | [Add a discovery entry](#add-a-discovery-entry) or a `NOT_PROMOTED` reason                          |
| Announce something without an app release | [Post a remote item](#post-a-remote-item)                                                           |
| Teach a keyboard shortcut                 | Add `{ commandId, message }` to `newsTips.ts`; shown only while bound                               |

## Add a discovery entry

1. Add a new id to `DISCOVERABLE_FEATURE_IDS` in `src/shared/featureDiscovery.ts`. Lowercase kebab-case, never reuse or rename an existing id (old release notes and feeds reference them).
2. Add one entry to `FEATURE_CATALOG` in `src/renderer/components/newsLine/featureCatalog.ts`:
   - `covers`: the surfaces it represents (`settings:<section>`, `sidebar:<id>`, `mcp:<server id>`).
   - `pitch`: one sentence with the benefit, under ~60 English characters, no trailing period (`Let several agents split one task with a crew`).
   - `action`: 1–3 words (`Try a crew`). Reuse an existing label when one fits.
   - `open`: go straight to the feature (`openSettingsSection`, an app view, or `runAppCommand`).
   - `isUsed`: prefer real usage (saved data, profile stats, `usedMcp`) and fall back to a generic signal: `seen("settings:<section>")`, `seen("view:<kind>")`, `seen("panel:<tab>")`, or `seen("command:<id>")`. A command signal is recorded only for ids in `TRACKED_COMMAND_IDS` (`src/shared/featureDiscovery.ts`): add yours there, and record it where the feature starts if it is not dispatched through the palette or a keybinding. Add a field to `FeatureContext` in `useFeatureContext.ts` only when no signal fits.
   - `isRelevant`: gate on what the feature needs (`readyAgents >= 2`, `desktopHost`). Never branch on a provider name.
3. If a surface should not be promoted (preferences, housekeeping), add it to `NOT_PROMOTED` with a reason instead.
4. Localize: `bun run i18n:extract`, fill every new `msgstr` in all 12 catalogs ([i18n.md](../../docs/i18n.md)), re-extract until 0 missing.
5. Verify: `bun run vitest run src/renderer/components/newsLine` (the coverage test lists any surface without a decision).

## Link the release note

In the release's `website/public/changelog.json` entry, add `"feature": "<id>"` to the `added` change that introduces the feature, alongside its `headline`. For 30 days after the release date, discovery leads with that feature for people who have not used it, and the changelog card shows the feature's action. The `release-notes` skill covers the rest of the entry.

## Post a remote item

Edit `website/src/lib/news/items.json`. It goes live with the website deploy after the change merges to `master`; GitHub-derived items need no edits.

```json
{
  "id": "wsl-guide-2026-11",
  "kind": "announcement",
  "text": { "en": "New guide: run agents in WSL" },
  "action": { "type": "url", "url": "https://poracode.com/docs/wsl", "label": { "en": "Read" } },
  "start": "2026-11-05",
  "end": "2026-11-30",
  "platforms": ["win32"],
  "weight": 2
}
```

- `id`: unique, lowercase, `[a-z0-9-]`, never reused. People who closed an item never see that id again; use a new id for a new message.
- `kind`: `announcement` or `community`.
- `text`: plain text, at most 140 characters, `en` required. Add other locales (`de`, `pt-br`, ...) when you have reviewed translations; others fall back to English.
- `action` (optional): `{ "type": "url", "url": "https://..." }` on poracode.com, x.com, or github.com/Porabuild; `{ "type": "feature", "feature": "<id>" }` to open a catalog feature; or `{ "type": "whats-new" }`.
- Targeting (optional): `start`/`end` (always set `end` for anything time-bound), `minAppVersion`/`maxAppVersion`, `platforms` (`darwin`, `win32`, `linux`, `web`), `unlessUsed`/`onlyIfUsed` (feature ids), `weight` 1–5.
- Emergency stop: set `"paused": true` at the top of `items.json` and deploy.

Verify with `bun run vitest run website/src/lib/news`: it runs every item through the app's validator and fails on anything the app would drop.

## Promotions

GitHub and X promotions live in `src/shared/communityLinks.ts`. Opening or closing one stores its id in shared settings `dismissedPromotions`, hiding it on every client of that host. Adding a promotion means a new id (never reuse one), a URL, copy in `useNewsLineItems.tsx`, and translations.

## Done means

- Coverage test, news line tests, and feed tests pass; `bun run typecheck`; touched-file lint and format.
- i18n extract shows 0 missing in every locale.
- For visible changes, check the line in the app with the `interactive-testing` skill, but do not click promotion or URL actions there: they open the user's real browser.
