# Batch-3 boundary evidence (2026-09-16)

Compact record per the §1h evidence-durability rule (tmp/ is not durable; this file is).
Scratch artifacts of the day lived under tmp/ and may already be gone after the second
wipe (both `tmp/` and `.tmp/` were externally cleaned during this boundary — the Batch-2
G4 raw evidence and the shared measurement harness were lost; the Batch-3 G4 lane
reconstructed its method from the documented definitions).

## Broad battery (final clean run)

9/9 effective green at the final tree: typecheck, lint (both modes), fmt:check,
protocol:remote:v3:check, prepare:server-native, build, build:web, full vitest
**14,213 passed / 119 skipped / 1 failed**, native:e2e **184 passed / 1 env-skip**.
The single vitest failure was `src/supervisor/runtime/cliHookEventChain.perf.test.ts`
(avg 36.97 ms vs a 30 ms loose-latency ceiling) — a file on the foreign (non-batch)
work surface, outside the freeze; standalone rerun passed (machine-load flake under
full-suite contention). An earlier battery run's native:e2e shard failures were
contamination from the critic concurrently running the same lab suites (standalone
reruns green), plus one Kotlin-compile `gradlew ETIMEDOUT` under load (standalone
green). No freeze-scope failure at any point.

## Consolidated critic (FIX-FIRST → all items landed)

Verdict FIX-FIRST: C1 freeze integrity (a foreign muse/supervisor surface appeared in
the checkout mid-review, ~40 files; the milestone stages strictly from the freeze list
and never touches it; six of its files were later reverted by its owner — naturally
excluded); I1 P2 holder-PID parse misfixed (`^(\S+)-(\d+)$` strict + tolerant fallback;
AWS-shape tests added; 18/18); I2 versioning.md counts (65 routes / 224 keys) + a
one-time-image-ticket boundary row incl. the `access_token` query-param deprecation;
N1 adopted (modal `dialog.showErrorBox` on the single-instance refusal — visible for
Finder launches). Security pass: no Critical findings (ticket flow 256-bit/hashed/
one-time/path-bound/TTL/capped, fail-closed consume; admission reservations can never
zero bulk; P3 latch cannot persist in session-only mode; no remaining token prints).
All four recorded deviations RATIFIED (bare-replace loud-reject; sync-settle
"ambiguous"; P2 notification skip superseded by N1's error box; files/image scope).
N2 (forwarded-child demotion unit test), N3-N5 recorded for later batches.

## Live drills (coordinator-executed)

**Desktop attach drill — ALL 5 LEGS PASSED** (script `tmp/b3-lane1/desktop-attach-drill.sh`,
run 20260916-201024): (1) managed desktop seeded a real profile and released its lease on
SIGTERM; (2) the desktop-owner pairing refusal held live (issue-pairing fails closed while
describe answers — the recorded evidence for `DESKTOP_OWNER_ATTACH_ADMISSION = "refuse"`);
(3) the quit profile staged via the production `stageHostImport` (77 files, sha256-anchored
receipt) and activated via the production CLI (`--sign-in-again`); (4) the standalone owner
served, drained on SIGTERM, and re-paired after restart without re-import; (5) a desktop
launch against the standalone-owned namespace **attached — owner pid unchanged (45883),
server answering throughout**. This is the §1h B4/E1 acceptance: an existing desktop
profile migrates into the standalone authority and the desktop attaches instead of
starting a second authority. (Drill-script fixes en route, all drill-side:
`unset ELECTRON_RUN_AS_NODE` — Electron-host shells export it and break real Electron
boots; receipt-grep spacing; `serve` is the no-argument CLI default.)

**Origin isolation probe** (`tmp/b3-lane3/safari-two-host-probe.mjs`): automated node
legs PASS — tabs pinned to their own child origins after alternating entry, A's session
cookie refused on B's origin (403), root-relative `/api/*` reaches the forwarded app;
plus the suite-level two-host relay probe (`forwardOriginTwoHostProbe.test.ts`, 2/2,
stable ×3, real server + relay + per-origin cookie jars). The manual real-Safari leg is
scripted with its wildcard-DNS/TLS prerequisites and remains a user-environment
residual, not a code gap.

**Gate-4 Batch-3 acceptance — PASS** (measured on a byte-verified copy of the
uncommitted tree: rsync + `cmp`, then install/build in isolation; 6 sessions × 240 s
steady; `--use-mock-keychain` both discipline envs; 8 verified producer streams per
session; zero keychain-dialog episodes):

| role         | pooled p99 (steady) | worst window | budget | verdict |
| ------------ | ------------------: | -----------: | -----: | ------- |
| supervisor   |              1.5 ms |       3.6 ms |  25 ms | PASS    |
| desktop-main |              1.2 ms |       5.0 ms |  25 ms | PASS    |
| backend      |              1.4 ms |       4.2 ms |  25 ms | PASS    |

Hazard-#3 wire bound: `/api/snapshot?threadLimit=100` = 47 853 B decoded (2 781 B gzip)
at the 1069-thread fixture; full cursor walk = 11 responses, max page 47 853 B / 2 620 B
gzip — ≤ 64 KiB with 27% headroom, identical across all 6 sessions. Startup windows
(separate surface per prior convention): pooled p99 2.1–2.5 ms; one disclosed ~1.8 s
supervisor single-callback stall during early boot in one session.

## Foreign work surface

A concurrent non-batch surface (`src/supervisor/**`, muse/crossagent files,
`docs/MUSE_WINDOWS_NATIVE_PLAN.md`, plus six settings/acp renderer files) appeared in
the checkout during the boundary. It was never touched, never staged, and is excluded
from the milestone commit by construction (staging = freeze-list ∩ current-dirty).
