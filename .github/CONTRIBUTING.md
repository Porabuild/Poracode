# Contributing to Lightcode

Thanks for thinking about contributing! Bug reports, docs fixes, new providers, and features are all welcome.

By contributing, you agree your work is licensed under the [Apache License 2.0](../LICENSE).

## Before you start

- For anything non-trivial, [open an issue](https://github.com/poracode/poracode/issues/new/choose) first so we can align on scope.
- Search [existing issues](https://github.com/poracode/poracode/issues) and [PRs](https://github.com/poracode/poracode/pulls) to avoid duplicates.

## Local setup

You'll need Node `>= 24.10.0` (see `.nvmrc`) and pnpm `11.x` (pinned in `package.json`).

```bash
git clone https://github.com/<your-username>/lightcode.git
cd lightcode
pnpm install
pnpm run dev
```

Handy scripts:

| Script               | What it does                      |
| -------------------- | --------------------------------- |
| `pnpm run dev`       | Run the Electron app in dev mode  |
| `pnpm run typecheck` | Type-check with `tsgo`            |
| `pnpm run lint`      | Lint with `oxlint`                |
| `pnpm run fmt`       | Format with `oxfmt`               |
| `pnpm run test`      | Run the test suite (`vitest`)     |
| `pnpm run build`     | Build renderer + electron bundles |

## Pull request flow

1. Fork the repo and create a branch: `feat/...`, `fix/...`, `docs/...`, etc.
2. Keep the change scoped to one thing.
3. Run `pnpm run typecheck`, `pnpm run lint`, `pnpm run fmt:check`, and `pnpm run test` before pushing.
4. Open a PR against `master` and fill in the template: what changed, why, and how you tested.
5. CI (`ci`) must pass and review threads must be resolved before merge.

Rebase on the latest `master` before requesting review. Husky runs `lint-staged` on commit, so formatting fixes apply automatically.

## Code style & deeper docs

`oxlint` and `oxfmt` are the source of truth for style. For architecture, agent adapters, UI patterns, and editing rules, read [`AGENTS.md`](../AGENTS.md) and `.agents/docs/`; please skim the relevant one before changing those areas.

## Reporting issues

Use the [issue templates](https://github.com/poracode/poracode/issues/new/choose). Include OS, Lightcode version, the agent(s) involved, and reproduction steps.

For security issues, don't open a public issue. See [SECURITY.md](SECURITY.md).

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
