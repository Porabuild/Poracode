---
name: release-notes
description: Writes a curated, hand-written-style changelog entry for a Poracode release in website/public/changelog.json, which feeds both the in-app changelog and the website. Use when asked to add release notes, update the changelog, write the changelog for vX.Y.Z, cut a release entry, or backfill a missed release. Audits every commit and the full diff since the previous release before writing.
---

# Release Notes — Poracode

Turn a release's commits, PRs, and diff into one curated changelog entry that
reads like a person wrote it and matches the voice, shape, and length of the
existing entries. GitHub already lists merged PRs on the Release page; this is
the hand-written layer shown in the app (Settings → Changelog, the What's New
dialog) and on the marketing site.

Not for: changing the changelog feature's code (normal code work), writing a
commit message, or writing a GitHub Release body.

## The file

`website/public/changelog.json` on `master` is the single source. The site
serves it and the desktop app fetches and caches it at runtime, so a merged
change updates both surfaces without an app release.

It is an object with a newest-first `releases` array. Do not invent fields:

```json
{
  "releases": [
    {
      "version": "1.3.1",
      "date": "2026-06-17",
      "title": "Short headline without the version number",
      "summary": "One or two sentences — the release's elevator pitch.",
      "changes": [
        { "kind": "added", "label": "Projects", "text": "One complete, user-facing sentence." },
        { "kind": "fixed", "text": "A mixed-scope fix that needs no label." }
      ]
    }
  ]
}
```

`kind` is `added` | `improved` | `fixed`. `label` is an optional short product
prefix. Release-note text stays English; only the surrounding app UI is
localized.

## 1. Gather evidence

```bash
gh repo view --json nameWithOwner -q .nameWithOwner
gh api repos/<owner>/<repo>/releases/tags/v<X.Y.Z> --jq '{date: .published_at, body: .body}'
git log --date=iso-strict --pretty='format:%H%n%ad%n%s%n%b' <previousTag>..<target>
git diff --stat <previousTag>..<target>
git diff --name-status <previousTag>..<target>
git diff <previousTag>..<target>
```

The git range is authoritative; the PR list is supplementary, because direct
commits, local merges, and squash details may be missing from it. Read every
commit subject and body, then open the patches and nearby tests for anything
ambiguous — especially `feat`/`fix` commits touching UI, settings, i18n, or
provider adapters. Do not infer behavior from titles alone.

If the target tag does not exist yet, use the intended release commit (usually
`HEAD`), confirm its package version matches, and say so in the handoff.

If the maintainer pasted highlight notes, they decide what leads. For a large
release without notes, ask once whether they have highlights; otherwise proceed
from the evidence.

Useful filters:

```bash
# Commits that added or changed localized strings (a strong user-facing signal)
git log --pretty='%h %s' --name-only <previousTag>..<target> -- 'src/renderer/locales/**'
# UI and website surfaces in the range
git log --pretty='%h %s' --name-only <previousTag>..<target> -- 'src/renderer/**' 'website/src/**'
```

## 2. Decide what each commit becomes

Every bullet must trace to commits or PRs in the audited range, because the
changelog is user-facing and the app shows it unprompted — an unsupported or
misdated claim is worse than an omission. In your working notes, give every
non-merge commit one disposition: **include** (its own bullet), **fold** into a
named bullet, or **omit** with a one-line reason.

Include or fold, never silently omit:

- New or changed user-visible copy, especially commits touching
  `src/renderer/locales/**/messages.po`, `src/shared/messages.ts`, or mobile and
  website catalogs.
- Discoverability and selection-state UI: mode icons, badges, trigger labels,
  selected-state highlights, status chips, empty states, onboarding hints — even
  when the underlying feature shipped earlier (that is `improved`).
- Anything the user clicks or reads: settings, menus, tooltips, toasts, dialogs,
  composer controls, sidebar chrome, Git/PR controls, provider pickers.
- Fixes the user would have hit (done state, window size, broken launch).

Any `feat`/`fix` commit touching `src/renderer/**`, `src/shared/messages.ts`, or
locale catalogs ends as include or fold; if it does not fold cleanly, it gets
its own bullet.

Safe to omit: tests, type-only refactors, CI, lockfile-only, version bumps, pure
renames, dependency upgrades with no visible effect, micro-animation or pixel
tweaks that do not change what a control means, and website-only changes unless
they are a real product surface.

Before calling something new, check its history:

```bash
grep -in "<feature-keyword>" website/public/changelog.json
```

If the capability already existed, describe the delta as `improved` (e.g.
"GitHub Actions now supports multiple signed-in accounts") rather than "You can
now …" as `added`. Mention platform expansion (WSL, remote SSH, Windows) when
the range adds it.

## 3. Write the entry

- **title:** sentence case, about 3–8 words, no version number; name the 2–3
  headline features joined with commas or `&`.
- **summary:** 1–2 benefit-first sentences. Big releases may open with
  "A big feature release: …"; patches stay short and factual.
- **changes:** one complete user-facing sentence each, preferably second person
  and present tense, ordered added → improved → fixed. Lead `added` with the
  maintainer's highlights. Merge related work that serves one user outcome:
  roughly 6–14 bullets for a major or busy patch, 2–5 for a small hotfix.
  Folding related commits is distillation; dropping discoverability work because
  a bigger headline exists is not.
- **label:** only when the whole sentence belongs to one obvious surface
  (`Remote`, `Claude`, `Plugins`, `Security`); omit it for mixed or uncertain
  scope. Labeled and unlabeled changes can mix.

Rules that keep it reading as hand-written:

- No PR numbers, `@handles`, dependabot/CI/chore items, or raw PR-title
  phrasing.
- Describe the user outcome, not plumbing (heartbeats, task notifications, IPC
  schemas, migrations).
- Vary sentence openings; describe the benefit, not the commit.
- Keep product nouns literal (Poracode, Claude, Codex, Gemini, Grok, Command
  Code, WSL, ACP, Git, GitHub, macOS, Windows, Linux, and model names).
- A feature appears in the release that introduced it; refinements (clearer
  labels, icons, defaults, multi-account support) belong to the release that
  shipped the refinement.
- `version` has no `v`; `date` is the ISO release date.

Examples:

```text
Good: { "kind": "added", "text": "Start a new project by cloning any GitHub repository directly from Poracode." }
Good: { "kind": "improved", "label": "GitHub", "text": "GitHub Actions now supports multiple signed-in GitHub accounts, letting you switch accounts when browsing workflows, dispatching runs, or inspecting CI statuses." }
Bad:  { "kind": "added", "text": "You can now view workflow runs …" }      — the feature already existed; the delta is the improvement
Bad:  { "kind": "added", "text": "Add GitHub repository clone flow by @user in #167" } — raw PR title and noise
Bad:  { "kind": "added", "text": "Added clone." }                             — no user benefit
```

Prepend the entry to `releases` (newest first). To fix an already-published
entry, edit that release in place rather than adding a version. Re-read your
dispositions: every include maps to a bullet, and every omit still looks like
noise.

## 4. Verify and publish

```bash
pnpm exec vitest run src/shared/changelog.test.ts   # schema, ordering, uniqueness, required fields
pnpm run typecheck
```

Optionally build the site to confirm the `/changelog` page renders:
`pnpm --dir website build`.

Publish through a pull request against `master` as described in
`.github/CONTRIBUTING.md`, using the `pull-request` skill
(`.agents/skills/pull-request`); do not push to `master` directly. Once merged,
the site redeploys and the app picks up the new notes without a release.
