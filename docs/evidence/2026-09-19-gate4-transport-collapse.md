# Gate-4 transport-collapse before/after evidence (2026-09-19)

Compact record per the §1h evidence-durability rule (tmp/ is not durable; this file is).
Lane: Gate-4 host-loop BEFORE/AFTER matrix for V5 plan item 2.5 (transport collapse —
renderer-stream leg deletion + desktop-internal loopback unification). Harness copies,
arm snapshots and raw logs live under gitignored `tmp/` and are reproducible from the
commands below.

## VERDICT: the Gate-4 host-loop matrix PASSES at both measurement points —

## pooled steady p99 stays ≈1.2–1.6 ms per role on both arms (budget 25 ms), and every

## AFTER delta is inside the 10% master-comparison allowance. 2.5 introduces no

## measurable host-loop latency regression.

A prior attempt at this matrix was BLOCKED (defect chain below, kept as context): the
desktop could not complete a managed launch over the harness profile shape at either
snapshot. The two boot defects were fixed at HEAD in `a470a9768` and back-ported to the
BEFORE scratch copy as measurement-neutral boot-path-only edits (see "BEFORE-arm patch
list"), after which all 12 sessions (6 per arm, sequential, same host) booted, streamed
and completed cleanly: 12/12 `exit=0`, 0 failures, 576/576 steady snapshot refreshes
HTTP 200.

Measurement points (byte-verified snapshots, `git archive` extraction + recursive diff
against a second archive extraction of the pinned SHA):

- **BEFORE**: `d6b1a7452` (post-boot-hotfixes `1841aa84b`+`d6b1a7452`, PRE-transport-collapse;
  the transport-collapse lane started editing shared files at `200e2c7c4`). Arm copy
  `tmp/v5-g4-arm-before/` — 6197 regular files + 27 symlinks; the ONLY source delta vs
  the SHA is the 3-file boot patch listed below.
- **AFTER**: `1867b98b3` (HEAD at run time = `a470a9768` boot fix + `9b330af0c` codegen +
  docs). Arm copy `tmp/v5-g4-arm-after/` — 6206 regular files + 28 symlinks, identical
  to the archive (expected additions only: `ARM_SHA.txt`, filtered `tsdown.arm.config.ts`,
  `packages/codex-protocol/generated`, `node_modules/`, `dist/`).

## Protocol and conditions (identical on both arms)

Per the Batch-3 acceptance procedure (docs/V4_MERGE_GATES.md §1l), fixture
`tmp/v4-g4-b3/template/` (1 project, 1069 threads, 60 shell+hist40 threads, 1 tail
thread with 4000-item history, remoteAccessEnabled) copied pristine per session,
`tmp/v4-g4-b3/fixture-repo/` for producers; 6 sequential sessions × 240 s steady hold,
8 real PTY producers echoing ~160 lines/s total, bounded `GET /api/snapshot?threadLimit=100`
every 5 s during steady, roles supervisor / desktop-main / backend sampled at 1 s
windows (`eventLoopDelay.p99Ms`, timer-callback mode). Pooled steady p99 across sessions
is the acceptance number vs the 25 ms budget; the BEFORE→AFTER deltas are judged against
the 10% master-comparison allowance. Launch discipline as previously documented:
`env-clean` (no `ELECTRON_RUN_AS_NODE`, no ambient `PORACODE_*`), `--use-mock-keychain`

- `PORACODE_USE_MOCK_KEYCHAIN=1`, isolated `PORACODE_BASE_DIR` per session, fixed CDP /
  remote-access ports (9231–9236 / 49411–49416), isolated `PORACODE_PERF_OUTPUT_DIR`
  (interval 1000 ms); the real Electron tree is killed with
  `pkill -f "<arm> --use-mock-keychain"` after each matrix.

```
G4_ARM=<arm> node tmp/v5-g4-matrix-<arm>/harness/run-matrix.mjs   # G4_SESSIONS=6 G4_STEADY_MS=240000
node tmp/v5-g4-matrix-<arm>/harness/analyze-g4.mjs
```

Boot proof per session (the prior lane's "DevTools listening is NOT proof" trap):
readiness required a CDP target of `type === "page"` (real renderer main world), then
`refreshRemoteAccessPairing` reaching `status === "ready"` (backend host + remote access
server composed in the main process), then the authenticated bearer token exchange and a
full 1069-thread wire walk, then 8/8 producers verified streaming from scrollback. All
12 sessions cleared every gate.

Host load context (contamination note): Apple Silicon host, loadavg 3.5–7.8 during the
BEFORE matrix (2026-09-19 17:11–17:39 local) and 3.2–10.3 during the AFTER matrix
(17:39–18:07). AFTER `run-05` overlapped a burst (loadavg sample 10.33) — visible as its
slightly higher per-session numbers, not in the pooled verdict (excluding it would only
improve AFTER).

## Results — pooled steady event-loop p99 (ms, quantile-merged windows)

| role         | BEFORE windows | BEFORE p99 | AFTER windows | AFTER p99 | delta | within 10%? |
| ------------ | -------------: | ---------: | ------------: | --------: | ----: | ----------- |
| supervisor   |           1446 |       1.59 |          1446 |      1.56 | −2.0% | yes         |
| desktop-main |           1452 |       1.33 |          1451 |      1.23 | −7.6% | yes         |
| backend      |           1451 |       1.43 |          1451 |      1.44 | +0.1% | yes         |

Pooled steady p50/p95 for reference — BEFORE: supervisor 0.02/1.28, desktop-main
1.08/1.29, backend 0.02/1.27; AFTER: supervisor 0.02/1.19, desktop-main 1.07/1.19,
backend 0.89/1.17. Worst pooled steady windows: BEFORE max 51.5 ms (desktop-main, one
1 s window; window p99s ≤ 2.1 ms except backend 7.0 ms), AFTER max 38.6 ms (desktop-main
in the run-05 load burst; window p99s ≤ 4.3 ms except backend 5.9 ms). Every pooled p99
is ~5–6% of the 25 ms budget.

Startup-phase pooled p99 (not the acceptance surface, recorded for completeness):
supervisor 1.60 → 1.46, desktop-main 1.38 → 1.27, backend 1.46 → 1.42 ms.

## Results — per session

Steady p99 (ms) per role; `boot→CDP` = spawn to a real CDP page target; every session
walked all 1069 fixture threads and completed 48/48 steady refreshes with the identical
50,771-byte snapshot payload.

| session | BEFORE sv/dm/be    | boot→CDP | AFTER sv/dm/be     | boot→CDP |
| ------- | ------------------ | -------: | ------------------ | -------: |
| run-01  | 1.60 / 1.34 / 1.48 |   573 ms | 1.53 / 1.22 / 1.26 |   833 ms |
| run-02  | 1.60 / 1.34 / 1.46 |   778 ms | 1.50 / 1.22 / 1.40 |   801 ms |
| run-03  | 1.60 / 1.33 / 1.38 |   547 ms | 1.46 / 1.22 / 1.41 |   812 ms |
| run-04  | 1.49 / 1.22 / 1.40 |   550 ms | 1.48 / 1.22 / 1.24 |   554 ms |
| run-05  | 1.48 / 1.22 / 1.34 |   790 ms | 1.61 / 1.26 / 1.53 |   618 ms |
| run-06  | 1.55 / 1.24 / 1.43 |   591 ms | 1.48 / 1.24 / 1.26 |   779 ms |

Raw evidence: `tmp/v5-g4-matrix-before/runs/*/` and `tmp/v5-g4-matrix-after/runs/*/`
(perf NDJSON, timeline.json, wire-walk, steady-refreshes, producer-check, app console),
pooled reports in each lane's `analysis.json`, full runner logs in each lane's
`logs/matrix.log`. (The AFTER lane also contains `runs/_pre-lane-diagnostics/` — the
prior blocked-state smoke attempts, kept but excluded from analysis; they carry no
`steadyStart` so the analyzer would skip them anyway.)

## BEFORE-arm patch list (measurement-neutral, boot-path only, scratch copy only)

The BEFORE SHA predates `a470a9768`, so its scratch copy could not boot (defects 2–3
below). The HEAD fix was mirrored into `tmp/v5-g4-arm-before/` verbatim, adapted only to
that tree's call sites. The edits execute before any loop work starts; the measured
surfaces (backend host child wiring, supervisor, renderer) are untouched.

1. `src/main/backend/desktopBackendInitialize.ts` — stop re-deriving the fence with
   `resolveDesktopHostRootPaths(input.baseDir)`; take a required `dataFencePath: string`
   input and pass it through (same doc comment as HEAD).
2. `src/main/desktopAppReady.ts` (the only caller) — read the fence from the admission
   lease: `const ownerFencePath = desktopApp.desktopOwnerLease?.paths.dataFencePath;`
   with a loud guard (`"The desktop host owner lease is required before the backend
forks."`), passed as `dataFencePath: ownerFencePath`.
3. `src/main/main.ts` fresh path — `prepareOwnedHostRoot(desktopApp.desktopOwnerLease, {
allowNonCustodialNamespace: true })` (the option existed at this SHA via `1841aa84b`;
   the fresh call site just didn't use it).

Rebuild used the arm's existing filtered config (`NODE_ENV=production pnpm exec tsdown
--config tsdown.arm.config.ts`, server entry removed — see defect 1), after re-running
the pinned `pnpm install --frozen-lockfile` (the arm's `node_modules` had been pruned;
`scripts/ensure-native-deps.mjs --electron-native` re-validated Electron/node-pty/
better-sqlite3 before the build). 15/15 entries built; renderer dist reused untouched.
One reproducibility trap, previously documented, re-confirmed: the FULL tsdown config's
main entry runs `clean: true` before the server entry fails at this SHA, which wipes
`dist/main` — never run the full config on this arm.

## Defect history (kept as context — both defects are fixed at HEAD)

### Defect 1 — BEFORE arm cannot build its server entry (known, worked around)

`NODE_ENV=production pnpm exec tsdown` at `d6b1a7452` fails at the `server` entry:
`Error: SSH runtime dependency is missing from package.json: electron` from
`src/build/runtimeDeclarationPlugin.ts` (the graph reaches `composeHostServices` →
`../browser`/`../computer-use` → `electron`, a devDependency). Fixed in `d3891e4c3`.
Both arms were built with an untracked filtered config (`tsdown.arm.config.ts`, in each
arm root) that removes only the `server` entry; all desktop entries build (main /
backendHost / supervisor / preload + renderer). The entry is not part of the measured
desktop path.

### Defect 2 — BEFORE arm `d6b1a7452`: fresh-namespace launch refused

Launching the BEFORE arm with a fresh empty `PORACODE_BASE_DIR` (no database) died in the
module-load admission block: `main.ts` called `prepareOwnedHostRoot(lease)` — the STRICT
form, without the `allowNonCustodialNamespace` option that `1841aa84b` added for exactly
this shape and that the promotion path uses. The namespace is nonempty by construction
(the boot itself writes `secret-key.safe`, `remote-access-identity.json`,
`chrome-bridge.json`, `worktrees/`, `userData/` before admission), so the gate classified
it as custodial:

```
HostImportRequiredError: Existing profile <R> requires an explicit offline backup import
before the owned host can use <R>.host-v1.
```

### Defect 3 — BOTH arms, deterministic: promoted root fed back through the namespace resolver

Reproduced with instrumented diagnostic copies of each arm (untracked `tmp/` scratch).
Over the fixture profile (a namespace WITH `state.sqlite`, i.e. custodial state):

1. The managed launch classified the namespace as promotable and succeeded (promotion
   journal `phase: "completed"`, activation receipt verified, `R.host-v1/state.sqlite`
   live).
2. Admission published `desktopApp.poracodePaths = preparePoracodeDataRoot(lease.paths.dataRoot)`,
   i.e. `poracodePaths.baseDir = R.host-v1`.
3. The backend-host payload builder RE-APPLIED the namespace→root mapping to it
   (`desktopBackendInitialize.ts`, `resolveDesktopHostRootPaths(input.baseDir)`), which
   refuses a literal `.host-v1` input by design (nesting guard):

```
Error: PORACODE_BASE_DIR selects the original profile namespace, not an owned .host-v1
root. Use the namespace recorded in host-root.json to avoid nesting data roots.
```

4. `handleStartupFailure` ran; with `PORACODE_CDP_PORT` set it exited `app.exit(1)`.
   Every subsequent launch re-entered the same path — no launch order recovered.

Silence amplifier (why harnesses saw "nothing happened"): production bundles set tsdown
`minify.compress.dropConsole`, compiling away `handleStartupFailure`'s `console.error`;
`app.exit(1)` also discards pending async pipe writes. A doomed launch prints exactly one
line — Chromium's `DevTools listening on ws://127.0.0.1:<port>/…` — and CDP answering
`/json/version` proves only that Chromium's DevTools agent started, never that the app
admitted. Readiness must be a real page target + main-process service liveness (both now
enforced by the harness).

Fix ownership resolved: `buildDesktopBackendInitialize` now carries the admission lease's
`dataFencePath` explicitly and the fresh path passes `allowNonCustodialNamespace`
(HEAD `a470a9768`), mirroring the point fixes proposed by the blocked lane and the
invariant in `docs/HOST_OWNERSHIP.md` (the resolver must not be re-applied to an already
literal owned root).

## What was additionally measured at HEAD — the two opt-in perf suites (both PASS)

Exact commands (run in the pristine `tmp/v5-g4-arm-after/` tree at `5e722ce83`,
2026-09-19 ~16:43–16:46 local, loadavg ~4–8, Poracode Nightly + a concurrent `find` scan
active on the host):

```
PORACODE_PERF_LOG=1 pnpm exec vitest run --configLoader runner --config vitest.perf.config.ts src/renderer/state/remote/remoteProtocol.perf.test.ts --disableConsoleIntercept
PORACODE_PERF_LOG=1 pnpm exec vitest run --configLoader runner --config vitest.perf.config.ts src/supervisor/runtime/cliHookEventChain.perf.test.ts --disableConsoleIntercept
```

Verbatim lines (first run, then three repeats each for variance):

```
[perf/browser]  threads=6 frames=6006 wallMs=11.2 avgMs=0.0019     (repeats: 11.1 / 11.3 / 10.8, avgMs 0.0018–0.0019)
[perf/cli-hook] threads=6 events/thread=40 total=240 wallMs=97.6 avgMs=2.315 p50Ms=2.150 p95Ms=5.132
                (repeats: 90.3 avg 2.155 p50 2.042 p95 4.372 | 91.3 avg 2.190 p50 2.055 p95 3.516 | 88.1 avg 2.108 p50 2.136 p95 3.334)
```

Baseline-lane reference (2026-09-18 ~22:2x, tree ≈ `d75f8a80a`):
`[perf/browser] wallMs=11.4 avgMs=0.0019`; `[perf/cli-hook] wallMs=92.2 avgMs=2.188
p50Ms=1.967 p95Ms=3.447`. Reading: `remoteProtocol` (WS frame parse → runtime validation
→ batched store reduction, the synthetic proxy for the renderer transport leg that 2.5
rewired) is unchanged — median 11.2 ms vs 11.4 ms wall, identical avgMs.
`cliHookEventChain` medians are statistically indistinguishable from the baseline
single-shot. These suites are synthetic in-process: they complement, not substitute,
the live matrix above.

## Coverage statement

- The host-loop pooled steady p99 (supervisor / desktop-main / backend, 25 ms budget,
  10% master-comparison allowance) is now MEASURED at both points on the same fixture,
  same protocol and same host: 1.56–1.59 ms supervisor, 1.23–1.33 ms desktop-main,
  1.43–1.44 ms backend, all deltas within the allowance. The Batch-3 reference numbers
  (2026-09-16, older tree: supervisor 1.5 / desktop-main 1.2 / backend 1.4 ms) agree
  with the BEFORE arm and remain consistent with it.
- The renderer process itself has no event-loop role and is not sampled by the harness
  (`ProcessRole = "desktop-main" | "backend" | "supervisor" | "server" | "relay"`); the
  renderer transport leg that 2.5 replaced is represented live by the loopback server
  now hosted inside the measured host roles, plus the synthetic `remoteProtocol` proxy
  (green, above).
- The loopback unification adds no measurable host-loop cost at this fixture: the AFTER
  arm runs the 2.5 server path inside desktop-main/backend and the pooled p99 for both
  roles is unchanged or slightly better than BEFORE.

## Scope note

This lane changed exactly one tracked file (this record). Arm snapshots, the BEFORE-arm
boot patch, harness copies and logs live under gitignored `tmp/` (`tmp/v5-g4-arm-before/`
— patched, see patch list; `tmp/v5-g4-arm-after/` at `1867b98b3`; `tmp/v5-g4-matrix-before/`,
`tmp/v5-g4-matrix-after/` — runs, logs, analysis). No tracked source, test or config file
was touched. Unrelated observation for the owning lane: `9b330af0c` accidentally committed
the prior lane's scratch symlink `v5g4diag-after-pristine-dist` (→ `/tmp/...`) at the repo
root; harmless (dangling, unreferenced by the app) but worth deleting in a follow-up.
