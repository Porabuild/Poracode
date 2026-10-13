# Contributing to Poracode

Thanks for thinking about contributing! Bug reports, docs fixes, new providers, and features are all welcome.

By contributing, you agree your work is licensed under the [Apache License 2.0](../LICENSE).

## Before you start

- For anything non-trivial, [open an issue](https://github.com/Porabuild/Poracode/issues/new/choose) first so we can align on scope.
- Search [existing issues](https://github.com/Porabuild/Poracode/issues) and [PRs](https://github.com/Porabuild/Poracode/pulls) to avoid duplicates.

## Local setup

You'll need Node `>= 24.10.0` (see `.nvmrc`) and pnpm `12.3.4` (pinned in `package.json#packageManager`).

```bash
git clone https://github.com/<your-username>/poracode.git
cd poracode
pnpm install
pnpm run dev
```

Handy scripts:

| Script               | What it does                                |
| -------------------- | ------------------------------------------- |
| `pnpm run dev`       | Run the Electron app in dev mode            |
| `pnpm run typecheck` | Type-check with TypeScript 7 (native `tsc`) |
| `pnpm run lint`      | Lint with `oxlint`                          |
| `pnpm run fmt`       | Format with `oxfmt`                         |
| `pnpm run test`      | Run the test suite (`vitest`)               |
| `pnpm run build`     | Build renderer + electron bundles           |

## Pull request flow

1. Fork the repo and branch from the latest `master`. Name the branch `123-short-slug` when it fixes issue #123, otherwise `<type>/short-slug` (for example `fix/sidebar-pending-identity`).
2. Keep the change scoped to one thing.
3. Write commit subjects and the PR title as [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`, imperative, lowercase, no trailing period, 72 characters or fewer. Prefix the issue number when there is one: `#123 fix(sidebar): show worktree identity while pending`.
4. Run the checks listed in [`AGENTS.md`](../AGENTS.md) before pushing. Husky runs `lint-staged` and `typecheck` on commit; don't bypass it with `--no-verify`.
5. Open a PR against `master` and fill in the template. Start the body with `Closes #123` when it resolves an issue. Include before/after screenshots for any visible UI change, and list only the checks you actually ran.
6. CI (`ci`) must pass and reviewers must resolve their threads before merge.

Rebase on the latest `master` before requesting review. Agents working in this repo follow the same flow through the `commit`, `verify`, `pull-request`, and `address-pr-feedback` skills in `.agents/skills/`.

## Code style & deeper docs

`oxlint` and `oxfmt` are the source of truth for style. For architecture, agent adapters, UI patterns, and editing rules, read [`AGENTS.md`](../AGENTS.md) and `.agents/docs/`; please skim the relevant one before changing those areas.

## Reporting issues

Use the [issue templates](https://github.com/Porabuild/Poracode/issues/new/choose). Include OS, Poracode version, the agent(s) involved, and reproduction steps.

For security issues, don't open a public issue. See [SECURITY.md](SECURITY.md).

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
