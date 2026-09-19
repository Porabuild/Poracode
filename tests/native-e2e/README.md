# Native E2E harness

Loopback host used by iOS/Android remote-pairing tests. It is fixture-only: the
control plane never invents protocol responses or returns pairing secrets.

## Run

```sh
pnpm native:e2e                 # focused Vitest suite (ephemeral ports)
PORACODE_NATIVE_E2E_SLOT=0 pnpm native:e2e:mock-host
PORACODE_NATIVE_E2E_SLOT=1 pnpm native:e2e:real-host
```

CLI modes take ports from `PORACODE_NATIVE_E2E_SLOT` only
(`base = 49152 + slot * 8`). Offsets: P0 app host, P1 control, P2 relay,
P3 production host, P4 upstream. Occupied ports fail; CLI will not fall back
to ephemeral ports.

## Control plane

Authenticated with `Authorization: Harness <capability>` (constant-time compare).

| Method | Path                         | Purpose                                   |
| ------ | ---------------------------- | ----------------------------------------- |
| GET    | `/healthz`                   | Liveness, no secrets                      |
| GET    | `/v1/state`                  | Booleans / counts / enums                 |
| POST   | `/v1/reset`                  | Reset lab state                           |
| POST   | `/v1/checkpoints/:fixtureId` | Allowlisted checkpoint                    |
| POST   | `/v1/faults/:fixtureId`      | Allowlisted fault                         |
| POST   | `/v1/frames/:fixtureId`      | Allowlisted frame                         |
| POST   | `/v1/real/restart`           | Production host restart (blocker in mock) |

There is no `/pair`, `/emit`, or `/shutdown`. Pairing material is written to
`secrets/pairing.json` (0600) in the run directory and consumed/deleted after
exchange. `ready.json` and `/v1/state` never include tokens, tickets, fragments,
or the control capability.

## Run directory

`.tmp/native-e2e/run-<timestamp>-<pid>-<nonce>/` (0700) with a `.native-e2e-run`
marker. Cleanup may recursively delete only a validated marker-bearing directory
under that parent. `PORACODE_NATIVE_E2E_KEEP=1` retains sanitized artifacts and
always deletes `secrets/`.

## Coverage

`harness/operation-map.json` locks the 224 manifest-derived keys (65 routes,
108 procedures, 9 client WS, 10 server WS, 16 replay, 16 runtime). The mock-host
profile positively covers all 207 operations with schema-validated generated
requests, producer-shaped procedure goldens, stateful route/procedure fixtures,
binary image bytes, raw upload bytes, and a real 302 forward-entry exchange.
There are no residual operation-level mock gaps. Loading or negatively
exercising inventory never counts as a positive pass. Mutations require a
follow-up evidence record (for example `gitStage` then `getGitStatus`).

The only intentionally unsupported mock variant is provider/external project
creation (`project-command` kinds `create` and `clone`), which remains a truthful
501 because it would otherwise fake a provider or network integration. Other
deterministic variants of that authoritative route positively cover the route.

## Real host

`pnpm native:e2e:real-host` starts `dist/main/server.cjs` with a disposable
profile namespace in `PORACODE_BASE_DIR`, waits on
`/.well-known/poracode/environment`, and pairs only through authenticated
`pair --json`. Fixture preparation holds a temporary owner lease, uses a synthetic
storage key, and writes the mapped `.host-v1` root. `RealHostHandle.baseDir` remains
the actual database/fixture root; `profileNamespace` is the CLI input. Cleanup
tracks both the namespace and its owned/lease siblings. Missing artifacts surface as
`missing-server-artifact` rather than a fake pass. Production has no fault or
emit injection.
