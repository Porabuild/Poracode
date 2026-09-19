# Gate-4 transport-collapse before/after evidence (2026-09-19)

Compact record per the §1h evidence-durability rule (tmp/ is not durable; this file is).
Lane: Gate-4 host-loop BEFORE/AFTER matrix for V5 plan item 2.5 (transport collapse —
renderer-stream leg deletion + desktop-internal loopback unification). Harness copies,
arm snapshots and raw logs live under gitignored `tmp/` and are reproducible from the
commands below.

## VERDICT: the Gate-4 host-loop p99 matrix is NOT OBTAINABLE at either measurement point —

## the desktop cannot complete a managed launch over the documented harness profile shape

The planned protocol (6 sessions × 240 s steady, s1s2 fixture, 8 producer PTYs,
`/api/snapshot?threadLimit=100` every 5 s, pooled steady p99 vs the 25 ms budget and the
10% master-comparison allowance) never reaches a running desktop on either arm. The
measurement debt is therefore still open, but its root cause is now a precisely localized
boot defect, not an unknown. No pooled p99 numbers are reported because none exist; the
two opt-in renderer/supervisor synthetic perf suites were re-run at HEAD instead (green,
below).

Measurement points (byte-verified snapshots, `git archive` extraction + full blob-hash
and symlink-target sweep against `git ls-tree -r`):

- **BEFORE**: `d6b1a7452` (post-boot-hotfixes `1841aa84b`+`d6b1a7452`, PRE-transport-collapse;
  the transport-collapse lane started editing shared files at `200e2c7c4`). Arm copy
  `tmp/v5-g4-arm-before/` — 6197 regular files + 27 symlinks byte-identical.
- **AFTER**: `5e722ce83` (HEAD, "complete the 2.5 unification"). Arm copy
  `tmp/v5-g4-arm-after/` — 6190 regular files + 27 symlinks byte-identical.

## Defect 1 — BEFORE arm cannot build its server entry (known, worked around)

`NODE_ENV=production pnpm exec tsdown` at `d6b1a7452` fails at the `server` entry:
`Error: SSH runtime dependency is missing from package.json: electron` from
`src/build/runtimeDeclarationPlugin.ts` (the graph reaches `composeHostServices` →
`../browser`/`../computer-use` → `electron`, a devDependency). Fixed only later in
`d3891e4c3`. The BEFORE arm was built with an untracked filtered config
(`tmp/v5-g4-arm-before/tsdown.arm.config.ts`) that removes only the `server` entry; all
desktop entries build (main/backendHost/supervisor/preload + renderer). Caution for
anyone reproducing: running the FULL config on such an arm executes the main entry's
`clean: true` before the server entry fails — it wipes `dist/main/main.cjs`, after which
Electron shows its own silent "missing app" modal. (This cost this lane a debug cycle.)

## Defect 2 — BEFORE arm `d6b1a7452`: fresh-namespace launch refused

Launching the BEFORE arm with a fresh empty `PORACODE_BASE_DIR` (no database) dies in the
module-load admission block: `main.ts:188` calls `prepareOwnedHostRoot(lease)` — the
STRICT form, without the `allowNonCustodialNamespace` option that `1841aa84b` added for
exactly this shape and that the promotion path uses (`promoteDesktopRoot.ts:725`). The
namespace is nonempty by construction (the boot itself writes `secret-key.safe`,
`remote-access-identity.json`, `chrome-bridge.json`, `worktrees/`, `userData/` before
admission), so the gate classifies it as custodial:

```
HostImportRequiredError: Existing profile <R> requires an explicit offline backup import
before the owned host can use <R>.host-v1.
```

## Defect 3 — BOTH arms, deterministic: promoted root is fed back through the namespace

## resolver, and the launch dies silently

Reproduced with an instrumented diagnostic copy of each arm (untracked `tmp/` scratch
only; the measurement arms stay pristine). Over the documented fixture profile
(`tmp/v4-g4-b3/template/`: 1 project, 1069 threads, remote access enabled — a namespace
WITH `state.sqlite`, i.e. custodial state), the sequence is identical at `d6b1a7452` and
at HEAD `5e722ce83`:

1. The managed launch classifies the namespace as promotable and **succeeds**: the
   promotion journal records `phase: "completed"`, the activation receipt verifies
   (75 files, `databaseSchemaVersion: 46`, sha256-anchored), `R.host-v1/state.sqlite`
   is live. (`host-operations.json` / `host-activation.json` in the run artifacts.)
2. Admission publishes `desktopApp.poracodePaths = preparePoracodeDataRoot(lease.paths.dataRoot)`
   (`promoteDesktopRoot.ts:727` / `main.ts:191`), i.e. `poracodePaths.baseDir = R.host-v1`.
3. `startDesktopApp` seam 3 builds the backend-host payload with that base dir, and
   `buildDesktopBackendInitialize` RE-APPLIES the namespace→root mapping to it
   (`desktopBackendInitialize.ts:30`, `resolveDesktopHostRootPaths(input.baseDir)`),
   which refuses a literal `.host-v1` input by design:

```
Error: PORACODE_BASE_DIR selects the original profile namespace, not an owned .host-v1
root. Use the namespace recorded in host-root.json to avoid nesting data roots.
    at resolveHostRootPaths …
    at buildDesktopBackendInitialize …
    at startDesktopApp (the app.whenReady().then(startDesktopApp).catch handler)
```

4. `handleStartupFailure` runs; with `PORACODE_CDP_PORT` set (harness discipline) it
   exits `app.exit(1)`.

This violates the invariant documented in `docs/HOST_OWNERSHIP.md` ("Passing an actual
`.host-v1` root back as the namespace is refused to prevent accidental nesting";
"`resolvePoracodePaths` remains a literal root helper … must not apply the mapping
again"). Every subsequent launch over the same namespace re-enters the "ready" path,
republishes the same `baseDir`, and dies the same way — so there is no launch order that
recovers. A second launch over an already-promoted namespace was tested explicitly.

**Silence amplifier (why every harness sees "nothing happened"):** production desktop
bundles set tsdown `minify.compress.dropConsole`, which compiles away
`handleStartupFailure`'s `console.error` disclosure; `app.exit(1)` also discards pending
async pipe writes. Observed console output for a doomed launch is exactly one line —
Chromium's `DevTools listening on ws://127.0.0.1:<port>/…` — which prints before app
admission and is NOT evidence of a healthy boot. CDP answering `/json/version` is
likewise only proof that Chromium's DevTools agent started; a harness polling CDP as its
readiness signal will see the server appear and the process vanish without any error.

Repro (instrumented copies; trace lines are appended to `/tmp/v5g4diag-after-trace.log`):

```
# instrumented AFTER copy (resolver-input + failure-stack trace), built at 5e722ce83
G4_ARM=/tmp/v5g4diag-after node /tmp/v5g4diag-after/../../work/Poracode/tmp/v5-g4-matrix-after/harness/run-session.mjs --session t --steadyMs 20000
# trace for a fixture launch shows, in order: 4× resolveHostRootPaths(<namespace>),
# then resolveHostRootPaths(<namespace>.host-v1), then STARTUP FAILURE with the
# nesting-refusal stack — three consecutive runs, identical.
```

Point fixes for the owning lane (not applied here — outside this lane's ownership):
`buildDesktopBackendInitialize` must not re-apply the mapping to an already-literal data
root (compute `dataFencePath` from the namespace once at admission and pass it through),
or admission must publish the canonical namespace as `poracodePaths.baseDir` and let only
the mapping produce the data root. The BEFORE arm additionally needs the
`allowNonCustodialNamespace` option at the `main.ts` "fresh" call site.

## What WAS measured at HEAD — the two opt-in perf suites (both PASS)

Exact commands (re-run verbatim from the baseline lane record; run in the pristine
`tmp/v5-g4-arm-after/` tree at `5e722ce83`, 2026-09-19 ~16:43–16:46 local, loadavg ~4–8,
Poracode Nightly + a concurrent `find` scan active on the host):

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
p50Ms=1.967 p95Ms=3.447`.

Reading: `remoteProtocol` (WS frame parse → runtime validation → batched store reduction,
the synthetic proxy for the renderer transport leg that 2.5 rewired) is unchanged —
median 11.2 ms vs 11.4 ms wall, identical avgMs. `cliHookEventChain` medians are
statistically indistinguishable from the baseline single-shot (wall 90.8 vs 92.2 ms,
avg 2.19 vs 2.188 ms); the p95 column is noise-dominated at this scale (single-shot
spread 3.33–5.13 ms across four runs, straddling the baseline 3.447). Both suites pass
their internal budgets at HEAD. These are synthetic in-process suites: no real sockets,
no loopback server, no host event-loop role — they do NOT substitute for the Gate-4
matrix.

## Coverage statement / what is still owed

- The host-loop pooled p99 (supervisor / desktop-main / backend, steady, 25 ms budget)
  remains UNMEASURED at both points; the 10% master-comparison allowance is therefore
  unevaluated. The Batch-3 reference numbers (2026-09-16, older tree: supervisor 1.5 /
  desktop-main 1.2 / backend 1.4 ms pooled steady p99) remain the only host-loop
  figures and are NOT comparable procedure-for-procedure across the boot-layout change.
- The renderer transport leg that 2.5 replaced has no live measurement; the synthetic
  proxy above is green at HEAD.
- After the point fixes above, the matrix is fully rigged to run:
  `G4_ARM=<arm> G4_SESSIONS=6 G4_STEADY_MS=240000 node harness/run-matrix.mjs` then
  `node harness/analyze-g4.mjs`, per arm, sequentially, with harness copies at
  `tmp/v5-g4-matrix-before/harness/` and `tmp/v5-g4-matrix-after/harness/` (LANE/ARM
  patched copies of `tmp/v5-g4-baseline/harness/*.mjs`; ports 9231–9236 / 49411–49416
  and 9241+ / 49421+ discipline; `--use-mock-keychain` both envs; kill the real Electron
  tree, not the `.bin/electron` shim).

## Scope note

This lane changed exactly one tracked file (this record). Arm snapshots, instrumented
diagnostic copies, harness copies and logs live under gitignored `tmp/`
(`tmp/v5-g4-arm-before/`, `tmp/v5-g4-arm-after/`, `tmp/v5-g4-matrix-before/`,
`tmp/v5-g4-matrix-after/`, `/tmp/v5g4*` diagnostics). No tracked source, test or config
file was touched.
