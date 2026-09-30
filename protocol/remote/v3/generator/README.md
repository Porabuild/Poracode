# Remote protocol v3 generator

The executable generator lives in `src/shared/remote/contract/` so it is
typechecked with the rest of the shared contract. Run it from the repo root:

```sh
pnpm protocol:remote:v3:generate
pnpm protocol:remote:v3:check
```

`--check` is side-effect free and fails when `generated/` is stale, missing, or
has extra files.
