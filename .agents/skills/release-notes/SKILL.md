---
name: release-notes
description: Write consistent, hand-written-looking changelog entries for a Poracode release. Use when the user wants to "add release notes", "update the changelog", "write the changelog for vX.Y.Z", "cut a release entry", or has just tagged/shipped a release and wants the in-app + website changelog updated. Audits release metadata, every commit, and the full previous-release diff—including direct-commit releases with sparse PR coverage—then distills the user-facing changes and maintainer highlights into one curated entry prepended to website/public/changelog.json.
allowed-tools: Bash(gh:*), Bash(git:*), Bash(pnpm:*), Bash(node:*), Read, Edit, Write, Grep, Glob
---

# Release Notes — Poracode

Turn a release's PRs, complete commit range, and actual code diff into a **curated, human-readable changelog entry** that reads like a person wrote it — and keep every release in the changelog consistent in voice, shape, and length.

Poracode's changelog is **curated data**, not auto-generated. GitHub already auto-lists merged PRs on the Release page; this skill produces the _hand-written_ layer that ships inside the app (Settings → Changelog, the "What's New" dialog) and on the marketing site.

## When to use

- The user asks to **add/write release notes**, **update the changelog**, or **"do the changelog for vX.Y.Z"**.
- A release was just tagged/published and the in-app + website changelog need an entry.
- Backfilling missing releases into the changelog.

## When NOT to use

- Editing the _mechanics_ of the changelog feature (the React surfaces, the seen-state gate) — that's normal code work, not this skill.
- Writing a single commit message or a GitHub Release body (GitHub generates that).

## The one file you edit

There is a **single source of truth**: **`website/public/changelog.json`** on master.
The marketing site serves it at `https://www.poracodeapp.com/changelog.json` and the
desktop app fetches + caches it at runtime, so editing this one file (and pushing to
master, which redeploys the site) updates both surfaces **without an app rebuild**.

Shape — an object with a newest-first `releases` array (do not invent fields):

```json
{
  "releases": [
    {
      "version": "1.3.1",
      "date": "2026-06-17",
      "title": "Short punchy headline, NO version number",
      "summary": "One or two sentences — the release's elevator pitch.",
      "changes": [
        {
          "kind": "added",
          "label": "Projects",
          "text": "One complete, user-facing sentence."
        },
        { "kind": "fixed", "text": "A mixed-scope fix that needs no forced label." }
      ]
    }
  ]
}
```

`kind` is one of `added` | `improved` | `fixed`. Release-note text stays English (it is
not localized — only the surrounding app UI chrome is). `label` is an optional short
feature or product prefix; labeled and unlabeled changes may appear in the same release.

## Step 1 — Gather source material

Resolve the repo slug from the remote (default `SDSLeon/lightcode`):

```bash
gh repo view --json nameWithOwner -q .nameWithOwner
```

Then collect, for the target version:

- **The release date** and the **auto-generated PR list** (the body):
  ```bash
  gh api repos/<owner>/<repo>/releases/tags/v<X.Y.Z> --jq '{date: .published_at, body: .body}'
  ```
- **The complete git range**, even when a GitHub release and PR list exist. PRs are
  supplementary, not authoritative: direct commits, local merges, and squash details may
  be absent. Read every commit subject and body, inspect the range-level file list and
  diffstat, then inspect the substantive patches and nearby tests before writing:
  ```bash
  git log --date=iso-strict --pretty='format:%H%n%ad%n%s%n%b' <previousTag>..<target>
  git diff --stat <previousTag>..<target>
  git diff --name-status <previousTag>..<target>
  git diff <previousTag>..<target>
  ```
  Do not infer behavior from commit titles alone — open the patch when the subject is
  ambiguous (especially `feat`/`fix` that touch UI, settings, i18n, or provider adapters).
- **An unpublished target boundary**, when no target tag exists. Use the intended release
  commit (usually `HEAD`), confirm its package version matches the requested version, and
  state this boundary in the handoff rather than pretending the tag exists.
- **The maintainer's highlight notes**, if they pasted any (Telegram/X-style bullets, "now with: …"). These are authoritative for _what matters most_ — lead with them. If the user didn't provide notes and the release is large, ask once whether they have highlights; otherwise proceed from the collected release metadata and git evidence.

### Step 1b — Commit disposition ledger (mandatory)

Before drafting prose, walk **every** non-merge commit in `<previousTag>..<target>` and
assign one disposition. Keep this ledger in your working notes (it does not ship in
`changelog.json`, but you must not skip it):

| Disposition              | When                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **include**              | User-facing on its own — gets its own bullet (or is the seed of one).                                                                                  |
| **fold into \<bullet\>** | Related to a larger change already included; note which bullet absorbs it.                                                                             |
| **omit**                 | Implementation-only, test-only, merge-only, build, chore, pure rename, or internal refactors with no visible behavior change. Write a one-line reason. |

**Always-include signals** (treat as `include` or `fold`, never silent `omit`):

- New or changed **user-visible copy** — especially commits that add msgids / touch
  `src/renderer/locales/**/messages.po` (or mobile/website locale catalogs). New
  strings almost always mean a user can see something new.
- **Discoverability / selection-state UI**: mode-specific icons, badges, trigger labels,
  selected-state highlights, status chips, empty states, onboarding hints. These stay
  even when the underlying feature shipped in an earlier release — users notice the
  clarity, and "polish on an existing feature" is still `improved`, not noise.
- Settings, menus, tooltips, toasts, dialogs, composer controls, sidebar chrome,
  Git/PR controls, provider pickers — anything the user clicks or reads in the app.
- Behavior fixes the user would have hit (done-state, wrong window size, broken launch).

**Safe to omit** (with an explicit reason):

- Tests, type-only refactors, CI, lockfile-only, version bumps, pure renames without
  product behavior, dependency upgrades with no user-visible effect.
- Micro-animation / fade / layout-pixel tweaks that do not change what the control
  _means_ or how the user finds it.
- Marketing-site-only changes (`website/**` that do not affect the shared
  `changelog.json` data or in-app surfaces) — mention only when they are a real
  product surface (e.g. a new About page, pairing flow). Sticky nav on the public
  changelog page is optional; prefer app-facing notes when distilling.

**Anti-pattern that caused a real miss (1.6.1):** a small `feat(pr-watch)` that only
swapped the PR automation trigger icon/label per Auto Fix vs Auto Merge was dropped
while larger sidebar/workspace bullets dominated. It touched every locale catalog and
changed what users see on every automated PR — that is `include` as `improved`, not
"too small to list."

**Reconciliation gate:** every `feat/*` and `fix/*` commit that touches
`src/renderer/**`, `src/mobile/**`, `src/shared/messages.ts`, or locale catalogs must
end as `include` or `fold into …`. If you cannot fold it cleanly, give it a bullet.

Quick helpers when auditing:

```bash
# Commits that added/changed localized strings (strong user-facing signal)
git log --pretty='%h %s' --name-only <previousTag>..<target> -- 'src/renderer/locales/**'
# UI / settings / PR surfaces in the range
git log --pretty='%h %s' --name-only <previousTag>..<target> -- \
  'src/renderer/**' 'src/mobile/**' 'website/src/**'
```

### Step 1c — Prior Art & History Cross-Check (Mandatory Anti-Hallucination Gate)

**Never assume a feature is brand new.** Before writing bullets, cross-check previous releases in `website/public/changelog.json`:

```bash
# Search existing changelog for mentions of the area or feature
grep -in "<feature-keyword>" website/public/changelog.json
```

1. **Verify Lineage**:
   - If GitHub Actions, Plugins, Workspaces, Archived Threads, or Provider Switching are in the commit range, check what already existed in prior versions.
   - If the capability already existed, do **NOT** write `"You can now <basic action>"` as an `added` bullet. That is a hallucination of novelty.
   - Accurately describe the **delta / upgrade** as `improved` (e.g. _"GitHub Actions now supports multiple signed-in accounts"_, _"Switching providers now continues inside the same thread (Handoff 2.0)"_, _"Archived thread management is redesigned for multi-workspace and remote filtering"_).

2. **Differentiate Plumbing from User Benefits**:
   - Do **NOT** list internal architecture or IPC/notification mechanics as user bullets (e.g. avoid _"task notifications and background task updates"_ or _"added database sync migrations and Zod schemas"_).
   - Distill the user outcome: what can the user now do or see? (e.g. _"Run Antigravity via first-class ACP runtime support with live usage discovery and machine-scoped settings"_).

3. **Check Environment & Scope Support**:
   - Check if changes expanded platforms (e.g. WSL, remote SSH, Windows shell resolution, multi-machine settings). Mention platform support explicitly when added.

## Step 2 — Distill into ONE curated entry (house style)

This is the consistency contract. Match the voice of the existing entries (read a couple from `website/public/changelog.json` first).

**title**

- Short, punchy, **no version number**, sentence case. ~3–8 words.
- Name the 2–3 headline features, joined with commas / `&`. E.g. `\"Antigravity ACP, Handoff 2.0 & thread mentions\"`.

**summary**

- 1–2 sentences, benefit-first, the release's "elevator pitch".
- Big releases may open with `\"A big feature release: …\"`. Patches stay factual and short.

**changes**

- Each is **one complete, user-facing sentence**. Prefer second person and present tense: _\"You can now…\"_, _\"Sessions are saved automatically…\"_.
- `kind`: `added` (new capability) · `improved` (better/faster/refined existing) · `fixed` (bug fix). Order them added → improved → fixed.
- `label`: optional short feature/product prefix. Add it only when the whole sentence belongs
  to one obvious surface such as `Remote`, `Claude`, `Plugins`, or `Security`. Omit it for mixed-scope
  sentences or whenever the right label is uncertain; never force every change to have one.
- **Distill, don't dump.** Merge related work into one bullet when it serves the same
  user outcome. A 70-PR major may land ~6–14 bullets; a busy patch may land ~6–14.
  Tiny hotfixes stay short (~2–5). Distillation means folding related commits, **not**
  dropping discoverability improvements or new user-visible labels/icons because a
  larger headline feature is already listed.
- Lead the `added` bullets with the maintainer's highlights when present.
- After drafting, re-read the disposition ledger: every `include` must map to a bullet
  (alone or folded); every `omit` must still look like noise on a second look.

**Hard rules (what makes it look hand-written)**

- ❌ No PR numbers, no `by @handle`, no `dependabot`/CI/chore/`build(deps)` items, no raw PR-title phrasing.
- ❌ No version number inside `title`.
- ❌ Do not claim existing features are newly added — verify with `grep` against `website/public/changelog.json` and mark upgrades as `improved`.
- ❌ Do not list internal protocol/plumbing mechanisms (heartbeats, task notifications, IPC schemas) in place of user outcomes.
- ❌ Do not drop mode icons, selection labels, badges, or status presentation just because the capability already existed — those are user-facing `improved` items.
- ✅ Vary sentence openings — don't write "Added X. Added Y. Added Z." Describe the _benefit_, not the implementation or the commit.
- ✅ Mix labeled and unlabeled changes when that best represents the release.
- ✅ Keep product nouns literal: `Poracode, Claude, Codex, Gemini, Grok, Command Code, WSL, ACP, Opus 4.8, Ultracode, Fable 5, Git, GitHub, macOS, Windows, Linux`.
- ✅ Each feature appears in the release that introduced it — don't repeat it in a later patch. **Refinements** of an earlier feature (clearer labels, icons, defaults, multi-account support, in-thread handoff) belong in the release that shipped the refinement.

### Good vs bad

```
✅ { kind: "added", text: "Start a new project by cloning any GitHub repository directly from Poracode." }
✅ { kind: "improved", label: "Provider switch", text: "Switching providers or models now continues seamlessly inside the same thread while preserving your full conversation history and active MCP configuration (Handoff 2.0)." }
✅ { kind: "improved", label: "GitHub", text: "GitHub Actions now supports multiple signed-in GitHub accounts, letting you switch accounts when browsing workflows, dispatching runs, or inspecting CI statuses." }
❌ { kind: "added", label: "GitHub Actions", text: "You can now view workflow runs, inspect step logs, and monitor action statuses directly inside Poracode." } // Hallucination: GitHub Actions was added in 1.6.0; multi-account support was the 1.7.0 delta
❌ { kind: "added", text: "Add GitHub repository clone flow by @SDSLeon in #167" }   // raw PR title + noise
❌ { kind: "added", text: "Added clone." }                                            // too thin, no benefit
❌ omit "PR automation mode icons" as "too small / polish"                            // discoverability is user-facing
```

### Template

```ts
{
  version: "X.Y.Z",
  date: "YYYY-MM-DD",
  title: "Headline feature, second feature & third",
  summary:
    "One or two sentences on what this release gives the user overall.",
  changes: [
    { kind: "added", label: "Projects", text: "You can now …" },
    { kind: "improved", text: "… is now faster / clearer / smoother because …" },
    { kind: "fixed", text: "… no longer … ." },
  ],
},
```

## Step 3 — Write it

Prepend the new entry to the `releases` array in **`website/public/changelog.json`**
(newest first; the app re-sorts defensively, but keep the source tidy). Keep valid JSON —
double-quoted keys/strings, no trailing commas.

When _amending_ an already-published entry (missed bullet, wrong wording), edit that
release in place — do not invent a new version. Changelog data deploys with the site;
the app refetches it without an app rebuild.

## Step 4 — Verify

```bash
pnpm exec vitest run src/shared/changelog.test.ts   # validates changelog.json: schema, sorted, unique, all fields
pnpm run typecheck
```

Optionally build the marketing site to confirm the `/changelog` page renders:
`pnpm --dir website build`.

Then commit + push to master — Vercel redeploys the site and the desktop app fetches the
new notes on its own (no app release needed for a notes-only change).

## Final checklist

- [ ] `title` has no version number; `summary` is 1–2 sentences.
- [ ] **History & prior art verified:** Grepped `website/public/changelog.json` to verify feature lineage and ensure existing capabilities are not falsely claimed as `added`.
- [ ] **User outcome focus:** Filtered out internal protocol/plumbing mechanisms (e.g. IPC schemas, background task notifications) in favor of direct user-facing capabilities and benefits.
- [ ] Changes are distilled (not one-per-PR), grouped added→improved→fixed, each a full benefit sentence.
- [ ] **Disposition ledger complete:** every non-merge commit is `include`, `fold into …`, or `omit` with a reason.
- [ ] Every `feat`/`fix` that touches renderer/mobile UI, settings, messages, or locale catalogs is `include` or `fold` — none silently omitted.
- [ ] Discoverability work (icons, selection labels, badges, status chips for existing features) is covered as `improved` when present in the range.
- [ ] Labels appear only where the category is clear; mixed or uncertain changes remain unlabeled.
- [ ] No PR numbers / author handles / dependabot / CI / chore noise.
- [ ] `version` (no `v`) and `date` (release date, ISO) are correct.
- [ ] `website/public/changelog.json` is valid JSON; the test + typecheck pass.
