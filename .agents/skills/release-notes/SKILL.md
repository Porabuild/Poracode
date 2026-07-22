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
  Reconcile every commit with the diff: include user-facing behavior, merge related work,
  and intentionally omit implementation-only, test-only, merge-only, build, or chore noise.
  Do not infer behavior from commit titles alone.
- **An unpublished target boundary**, when no target tag exists. Use the intended release
  commit (usually `HEAD`), confirm its package version matches the requested version, and
  state this boundary in the handoff rather than pretending the tag exists.
- **The maintainer's highlight notes**, if they pasted any (Telegram/X-style bullets, "now with: …"). These are authoritative for _what matters most_ — lead with them. If the user didn't provide notes and the release is large, ask once whether they have highlights; otherwise proceed from the collected release metadata and git evidence.

## Step 2 — Distill into ONE curated entry (house style)

This is the consistency contract. Match the voice of the existing entries (read a couple from `website/public/changelog.json` first).

**title**

- Short, punchy, **no version number**, sentence case. ~3–8 words.
- Name the 2–3 headline features, joined with commas / `&`. E.g. `"Multiple Claude profiles, a usage dashboard & glass sidebar"`.

**summary**

- 1–2 sentences, benefit-first, the release's "elevator pitch".
- Big releases may open with `"A big feature release: …"`. Patches stay factual and short.

**changes**

- Each is **one complete, user-facing sentence**. Prefer second person and present tense: _"You can now…"_, _"Sessions are saved automatically…"_.
- `kind`: `added` (new capability) · `improved` (better/faster/refined existing) · `fixed` (bug fix). Order them added → improved → fixed.
- `label`: optional short feature/product prefix. Add it only when the whole sentence belongs
  to one obvious surface such as `Remote`, `Claude`, or `Security`. Omit it for mixed-scope
  sentences or whenever the right label is uncertain; never force every change to have one.
- **Distill, don't dump.** Merge related PRs into one bullet. A 70-PR release yields ~6–9 bullets, never 70. Patches: ~2–4.
- Lead the `added` bullets with the maintainer's highlights when present.

**Hard rules (what makes it look hand-written)**

- ❌ No PR numbers, no `by @handle`, no `dependabot`/CI/chore/`build(deps)` items, no raw PR-title phrasing.
- ❌ No version number inside `title`.
- ✅ Vary sentence openings — don't write "Added X. Added Y. Added Z." Describe the _benefit_, not the implementation or the commit.
- ✅ Mix labeled and unlabeled changes when that best represents the release.
- ✅ Keep product nouns literal: `Poracode, Claude, Codex, Gemini, Grok, Command Code, WSL, ACP, Opus 4.8, Ultracode, Fable 5, Git, GitHub, macOS, Windows, Linux`.
- ✅ Each feature appears in the release that introduced it — don't repeat it in a later patch.

### Good vs bad

```
✅ { kind: "added", text: "Start a new project by cloning any GitHub repository directly from Poracode." }
❌ { kind: "added", text: "Add GitHub repository clone flow by @SDSLeon in #167" }   // raw PR title + noise
❌ { kind: "added", text: "Added clone." }                                            // too thin, no benefit
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
- [ ] Changes are distilled (not one-per-PR), grouped added→improved→fixed, each a full benefit sentence.
- [ ] Every commit and the complete previous-release diff were audited; omissions are intentional noise, not missing PR coverage.
- [ ] Labels appear only where the category is clear; mixed or uncertain changes remain unlabeled.
- [ ] No PR numbers / author handles / dependabot / CI / chore noise.
- [ ] `version` (no `v`) and `date` (release date, ISO) are correct.
- [ ] `website/public/changelog.json` is valid JSON; the test + typecheck pass.
