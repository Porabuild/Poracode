# News line

The news line is the single rotating line below the full-page new-thread composer. It mixes activity insights, changelog points, remote announcements, feature discovery, a usage limit, keyboard tips, and community promotions. Procedures for adding content live in the [`news-line` skill](../skills/news-line/SKILL.md); this doc explains how the pieces fit.

## Placement and behavior

- Rendered by `src/renderer/components/newsLine/NewsLine.tsx` inside the draft view's slack area (`ThreadDraftView.tsx`, `data-draft-slack`), so it can never move the anchored composer. Mounted only after shared settings hydrate (an opted-out user never fetches anything) and not at all in compact layouts, compact panes, the quick composer, or chat-only drafts, so hidden items never count as shown.
- Rotates every 7 seconds. Pauses on hover or focus, for 15 seconds after typing in the draft, while a changelog card is open, while the window is hidden, and through the pause button (WCAG 2.2.2). Screen readers hear changes only after the user steps through items.
- Settings → General: `newsLineEnabled` hides everything; `newsLineActivity` removes personal stats from display (discovery still reads them to know what was used).

## Sources and ordering

`useNewsLineItems.tsx` builds one rotation per visit; `newsPlaylist.ts` orders it. Urgent items (a usage limit at 80% or more) lead, the rest alternate between sources so consecutive items differ, and promotions sit between other items (never first, at most one in five).

| Source        | Module                                                                   | Data                                                                                                            | Hidden by ✕                                                     |
| ------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Insights      | `newsFacts.ts`, `useProfileStats.ts`                                     | Host profile stats (`getProfileCoreStats`, all-time, 10-minute cache)                                           | Per insight type, this device                                   |
| Changelog     | `src/shared/changelogHighlights.ts`                                      | `changelog.json`; three newest releases at or below the running version, newest first; each point at most twice | Retired, this device                                            |
| Announcements | `useAnnouncementItems.tsx`, `src/shared/newsFeed.ts`                     | Remote `news.json`                                                                                              | `remote:<id>`, this device                                      |
| Discovery     | `featureCatalog.ts`, `featureDiscoveryPicks.ts`, `useDiscoveryItems.tsx` | Catalog + usage signals + release notes                                                                         | `discover:<id>`, this device                                    |
| Usage         | `newsFacts.ts`                                                           | Provider usage snapshots at 50% or more                                                                         | This session                                                    |
| Tips          | `newsTips.ts`                                                            | Command palette registry and the user's key bindings                                                            | This device                                                     |
| Promotions    | `src/shared/communityLinks.ts`                                           | Fixed GitHub/X links                                                                                            | Shared settings `dismissedPromotions`, every client of the host |

Choices are seeded once per visit so the line is stable while it is open; dismissals and settings apply live.

## Feature discovery

`featureCatalog.ts` lists every promotable feature: its shared id (`src/shared/featureDiscovery.ts`), the product surfaces it covers, a one-line pitch, an action, `isUsed`, and optional `isRelevant`.

- **Used detection** combines data the app already has (saved crews, worktree threads, profile MCP/skill/subagent counts, settings lists) with generic device-local signals recorded by `featureUsageTracking.ts` and command dispatch: `settings:<section>` (the page on screen), `view:<kind>`, `panel:<tab>`, and `command:<id>` for the allowlisted `TRACKED_COMMAND_IDS` only (`featureUsageStore.ts`, localStorage). Opening a feature's page counts as knowing about it. Schedules and pull requests also count existing data (saved schedules, threads with a PR) so long-time users are not told to try them.
- **Rules:** relevant, not used, not closed, at most three showings, a seven-day cooldown, two per visit.
- **New features:** a changelog change with `feature: "<id>"` in a release dated within 30 days (and at or below the running version) leads discovery using that change's headline. The changelog card also shows the feature's action.
- **Coverage gate:** `featureCatalog.test.ts` requires every Settings section (`SETTINGS_SECTIONS`), sidebar shortcut (`SIDEBAR_SHORTCUT_IDS`), and built-in MCP server (`BUILT_IN_MCP_SERVER_IDS`) to be covered by a catalog feature or listed in `NOT_PROMOTED` with a reason. A new surface fails CI until someone decides.

The catalog stays provider-agnostic: features name Poracode surfaces, never a specific agent.

## Remote feed

`https://poracode.com/news.json` is a Next.js route (`website/src/app/news.json/route.ts`, revalidated hourly) built by `website/src/lib/news/feed.ts` from:

- hand-written items in `website/src/lib/news/items.json` (live after the website deploy that follows a merge to `master`), and
- derived items from public GitHub data: a star milestone shortly after it is passed, and the monthly count of open good first issues.

The app fetches it anonymously (no credentials or identifiers), at most every six hours after a success and every hour after a failure, and caches it (`newsFeedStore.ts`). `src/shared/newsFeed.ts` is the contract and the trust boundary:

- Envelope `version` must equal `NEWS_FEED_VERSION`; otherwise the feed is ignored. `paused: true` hides every remote item.
- Items validate one by one; an invalid item is dropped, never the feed. Unknown fields are ignored.
- Text is plain, at most 140 characters, with a required `en` entry; locale lookup goes exact, then language, then English. Templates (`github-stars-milestone`, `good-first-issues`) are localized by the app instead.
- Actions: `url` (HTTPS, hosts in `NEWS_LINK_HOSTS`, GitHub only under `/Porabuild/`), `feature` (opens a catalog feature), or `whats-new`. Remote content can never run a command.
- Targeting runs on the device: `start`/`end`, `minAppVersion`/`maxAppVersion`, `platforms` (`darwin`, `win32`, `linux`, `web`), `unlessUsed`/`onlyIfUsed` feature ids (unknown ids fail closed), and `weight` (1–5).

The website cannot depend on zod, so `website/src/lib/news/feed.test.ts` runs the builder's output, including every hand-written item, through the app's `parseNewsFeed`.

## Compatibility

The changelog fields (`headline`, `feature`), the feed envelope, feature ids, promotion ids, and the device-local keys are compatibility boundaries; see [versioning.md](versioning.md). Never rename or reuse a feature or promotion id.

## Verification

- Unit: `bun run vitest run src/renderer/components/newsLine src/shared/newsFeed.test.ts src/shared/changelogHighlights.test.ts website/src/lib/news`.
- Live: the `interactive-testing` skill. Mock profiles have no history, so insights do not appear there; seed usage with `__poracodeDev.stores.providerUsage.getState().mergeSnapshot(...)`. Do not click promotion or URL actions in a smoke session: they open the user's real browser.
