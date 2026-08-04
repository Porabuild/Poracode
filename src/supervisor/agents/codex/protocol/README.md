# Codex app-server protocol types

The protocol façades import live generated definitions from `@poracode/codex-protocol`. Its generator uses the official `@openai/codex` package pinned to `0.144.5` and writes the app-server TypeScript output to `packages/codex-protocol/generated/` during `pnpm install`.

The generated directory is gitignored. Regenerate it manually from the repository root with:

```sh
pnpm codex-protocol:gen
```

If typecheck reports that `packages/codex-protocol/generated` is missing, run `pnpm install` or the command above. Bumping the exact `@openai/codex` devDependency in `packages/codex-protocol/package.json` updates the protocol typings on the next install or regeneration.
