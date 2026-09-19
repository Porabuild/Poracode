# V5 — Client/Server Architecture Assessment and Hardening Plan

Assessed at `poracode/v2` @ `d15aa76ff` (PR #725 head), 2026-09-18. Four independent audit lanes
(host/client boundary, transport/protocol, client parity, trust surface) plus one adversarial
verification pass over every Critical claim. Lane reports: `tmp/arch-audit/*.md` (scratch; the
confirmed facts are recorded here per the evidence-durability rule in `V4_MERGE_GATES.md` §1h.D).

## 1. Verdict

The V2 program delivered the hard part: one authoritative host process (`BackendHostCore`) with a
lease, data fence, HMAC host control, fail-closed attach decision, journaled operations, generated
wire contracts that are CI-gated across TS/Swift/Kotlin, and a soak-tested standalone server. The
ownership and persistence layers are genuinely well built.

The claim **"Electron is just another client, on par with web and mobile, and the standalone server
is a first-class host"** is not yet true in code. Three gaps break it:

1. **Two data lineages.** Desktop-managed host owns `<root>`; standalone owns `<root>.host-v1`.
   Attaching Electron to a server for an existing desktop profile shows a different workspace, and
   promotion is a manual staged import + `activate`, not an upgrade path.
2. **Desktop-only host features.** SSH environments, Chrome bridge, browser panel, and computer-use
   MCP ingress are composed only in `desktopAppReady.ts`. A standalone server cannot offer them, and
   attached Electron advertises two of them as available and then fails.
3. **Six request/reply stacks, four event paths, two reducers, seven auth schemes.** Attach mode
   proves the renderer runs fully on loopback HTTP+WS, which makes the ~2 500-line
   `backendHostProtocol` + `BackendRendererStream` path a second implementation of the same thing.

Separately, the remote trust surface is **not production-shaped**: plaintext `0.0.0.0` default, no
TLS option, every paired client gets every scope, MCP env secrets served remotely, SVG served from
the client origin without hardening, unauthenticated LAN port forwards. These are Gate 6 items and
several are cheap.

**Merge posture:** none of this blocks merging v2 into master (master has no standalone host at
all). Three items are cheap enough and user-visible enough to land on the PR first (§4, batch 0).
`V4_MERGE_GATES.md` §1l should be amended so Gate 2 "DONE" names the data-root split explicitly.

## 2. Confirmed findings

Severity is post-verification. "Lane" points to the scratch report section.

### 2.1 Host/client boundary

| ID  | Sev      | Finding                                                                                                                                                                                                                                              | Evidence                                                                                                                                                             |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | Critical | Desktop and standalone hosts resolve different data roots and each refuses the other's. No automatic desktop→standalone promotion.                                                                                                                   | `src/backend/ownership/hostRootPaths.ts:82,88,110,117`; `src/main/main.ts:158`; `stageHostImport.ts:34`; `src/server/cli.ts:178,270`; `docs/HOST_OWNERSHIP.md:20-35` |
| H2  | Critical | Attached Electron declares `nativeSsh` and `nativeBrowserWebContents` true; attach mode constructs neither manager and the attach allowlist serves neither. SSH settings and Browser panel render, then throw.                                       | `src/renderer/clientRuntime.ts:45-52`; `src/shared/ipc/attachProcedureAllowlist.ts:15-24`; `src/main/standaloneAttachMode.ts:17,39`; `BrowserPanel.tsx:48,124,247`   |
| H3  | Major    | SSH manager, Chrome bridge, browser panel, computer-use ingress are constructed only in desktop startup; standalone server composes none. SSH and Chrome bridge and computer-use ingress have no Electron dependency; browser panel and overlays do. | `src/main/desktopAppReady.ts:309,652,668,721`; `src/server/*.ts` (no composition)                                                                                    |
| H4  | Major    | Six parallel request/reply transports and four event-stream paths with independent versioning, grants, credit, and recovery. The loopback stream path is redundant with the remote HTTP+WS path already used by attached Electron.                   | `src/backend/BackendRendererStream.ts`; `backendHostProtocol`; `electronBackendTransport.ts:138`; §4 of host lane report                                             |
| H5  | Major    | Startup refusals are console-only; the app quits silently when the owner is `starting`, while the sibling single-instance case shows a dialog.                                                                                                       | `src/main/main.ts:198-199` vs `:221-228`                                                                                                                             |
| H6  | Major    | No capability negotiation from host to client. Desktop-only features degrade as 503 or silent `false`; `hostMode: "helper"` is the only signal.                                                                                                      | `src/server/headlessRemoteComposition.ts:289-301`                                                                                                                    |
| H7  | Major    | Server operability: no config file or host/port CLI flags, no log file/rotation/levels, no metrics, `prepare-server-native.mjs` stages only `better-sqlite3`; node-pty Linux prebuild plan unimplemented; SIGTERM drain has no deadline.             | `scripts/prepare-server-native.mjs`; `src/server/cli.ts:113`; `cliRuntime.ts:36-39`                                                                                  |
| H8  | Minor    | `desktopAppReady.ts` is one ~870-line function (`startDesktopApp`) with six clean seams; `setKeybindings` duplicated verbatim.                                                                                                                       | `src/main/desktopAppReady.ts:185-1054`; `localHandlers.ts:232-249` vs `standaloneAttachIpc.ts:110-129`                                                               |

### 2.2 Transport and protocol

| ID  | Sev   | Finding                                                                                                                                                                                                                                                               | Evidence                                                                                                                                     |
| --- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Major | Remote WS path: engine-dropped frames (overflow/reset) are swallowed, no overflow listener is registered (unlike the desktop transport), and the next frame's `Math.max` cursor advance moves reconnect past the gap. No client-side expected-seq check. Silent loss. | `src/renderer/state/remoteServers/eventSocketSession.ts:264,548-549,727-732,743,749-756`; `electronBackendTransport.ts:100` (contrast)       |
| T2  | Major | Client engine is a process-wide singleton with one generation; loopback socket close calls `reset()`, rejecting remote decodes and Zustand persist reads in flight. Not fatal, but hydration silently reports state as absent.                                        | `src/renderer/state/remote/engine/clientEngineHost.ts:34-39,53,78-86,226-233`; `electronBackendTransport.ts:495,515`; `dbStorage.ts:490-502` |
| T3  | Major | Two reducers over one event union (desktop `app.tsx` vs remote `sync.ts`), still diverging on selector-cache invalidation and reset/resume ordering.                                                                                                                  | `src/renderer/app.tsx:295-400`; `src/renderer/state/remote/sync.ts:632-798`                                                                  |
| T4  | Major | Manifest↔router drift gate is a regex over the router's source text against a 1 345-line if-chain; routes can be added without appearing in the contract. `manifest.json` is hand-maintained outside `generated/`; docs already drifted (63 vs 65 routes).            | `conformance.test.ts:375-389`; `src/main/remote/server/httpRouter.ts`                                                                        |
| T5  | Major | Renderer bypasses `clientRuntime`: 27 raw `window.poracode*` reads, ~15 of them host-kind checks that are wrong for attached Electron; shared code imports browser-flavor internals directly.                                                                         | `sidebarOverlayStore.ts:14`; `sync.ts:32`; `eventSocketSession.ts:15`; `RemoteBrowserMirror.tsx:13`                                          |
| T6  | Major | Unversioned boundaries: `src/shared/ipc/**` across the attach boundary, generic `app_state` rows, engine worker protocol (mismatch dropped, not rejected). Supervisor procedure map has no version.                                                                   | `src/shared/ipc/**`; `dbStorage.ts`; `engine/`                                                                                               |
| T7  | Major | Relay is a full MITM by design: no E2E encryption, no channel binding; relay compromise = session takeover at token scope. Acknowledged only in two inline comments.                                                                                                  | `src/server/relay/relayProtocol.ts:16-19`                                                                                                    |

### 2.3 Trust surface (Gate 6)

| ID  | Sev      | Finding                                                                                                                                                  | Evidence                                                                                                |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| S1  | Critical | Default bind `0.0.0.0`, plaintext `node:http` everywhere, no TLS path in listener or relay. First pairing on LAN is MITM-able for a 30-day token.        | `src/main/remote/config.ts:6,16`; `RemoteAccessServer.ts:1,587`; `relayServer.ts:2,269`                 |
| S2  | Critical | Every pairing grants every scope; per-route scope checks never deny. No viewer/operator split, no project scoping.                                       | `auth.ts:149,180`; `RemoteAccessServer.ts:855,1159,1173`; `protocol.ts:46`; `remoteServersStore.ts:586` |
| S3  | Major    | MCP server definitions including stdio `env` are returned unredacted on two routes; probe results are redacted, these are not.                           | `httpRouter.ts:798,1029`; `protocol.ts:522`; `contracts/mcpServer.ts:263,453`                           |
| S4  | Major    | SVG and client-supplied mime served from the client's own origin without CSP/nosniff/disposition. Authenticated route, but stored XSS reaches the vault. | `localImageFile.ts:21,64-69`; `httpRouter.ts:376-390,670-678`; `secureStorage.ts:166-216`               |
| S5  | Major    | Raw port forwards bind the remote host (default `0.0.0.0`) with no per-connection auth; any port except the server's own is forwardable.                 | `RemotePortForwardGateway.ts:29-34,255,390-409`                                                         |
| S6  | Major    | 30-day non-rotating tokens; device metadata caller-supplied and unverified. Bearer accepted as `?access_token=` on image routes.                         | `auth.ts:24,196`; `httpRouter.ts:672,688`                                                               |
| S7  | Major    | No audit log anywhere in remote or server code; no `Host`-header check on the remote server (the MCP ingress does it correctly for the same posture).    | `src/main/mcp/StreamableHttpMcpIngress.ts:207-248` (precedent)                                          |
| S8  | Minor    | Pairing rate limiter trusts `X-Forwarded-For` from loopback. Unauthenticated health endpoint discloses version.                                          | `security.ts:51`; `httpRouter.ts:363-369`                                                               |
| S9  | Minor    | No written threat model (`SECURITY.md` absent).                                                                                                          | repo root, `docs/`, `.agents/docs/`                                                                     |

### 2.4 Client parity

| ID  | Sev   | Finding                                                                                                                                                                     | Evidence                                                          |
| --- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| P1  | Major | Native mobile terminal is a read-only transcript plus a line-buffered command field, not an interactive PTY. The parity ledger's binary "implemented" hides this.           | `ios/.../TerminalTextSurface.swift`; `TerminalCommandField.swift` |
| P2  | Major | Pairing state machines, terminal cursor reconciliation, background-task reduce, and follow-up queue are hand-triplicated in TS/Swift/Kotlin; only parity tapes catch drift. | lane report §5                                                    |
| P3  | Major | Native journey tests: 1 iOS XCUITest, 9 Android instrumentation tests, against ~166k native LOC.                                                                            | `ios/`, `android/` test targets                                   |
| P4  | Minor | `native-parity.json` measures wire coverage, not UI reachability; docs frame it as parity. No LAN discovery for pairing. Cert-trust UX absent (moot until TLS exists).      | `protocol/remote/v3/native-parity.json`; `docs/RELEASE_MOBILE.md` |

**Verified sound:** ownership lease/fence/attach decision; `doctor` and `backup`; ingress admission
control with reserved control slots; loopback renderer-stream grant binding; secrets-at-rest custody
(0600, `O_NOFOLLOW`, uid/mode checks); PWA service-worker caching; push notifications on PWA, iOS,
Android; relay HTTP-streaming capability negotiation; generated-binding CI gates; the five spot-checked
native feature claims (worktrees, git panel, MCP incl. OAuth, schedules, permissions).

## 3. Target architecture

```
                 contract registry (src/shared/remote/contract/)
                 procedures + routes + scopes + schemas — ONE table
                              │ generate, CI byte-compared
        ┌─────────────────────┼─────────────────────────────┐
   manifest.json      native bundles (swift/kotlin)      TS route table
                                                  httpRouter DISPATCHES from it
                              │
                 ONE wire envelope { v, op, args } per hop
                              │
                 HostTransport interface (one version constant per hop)
                 ├ PreloadIpcTransport      bootstrap + native shell services only
                 ├ LoopbackHttpWsTransport  desktop-managed host (replaces host protocol + renderer stream)
                 └ RemoteHttpWsTransport    browser / PWA / mobile / attached Electron
                              │
                 ClientRuntime — capabilities negotiated from the HOST, never inferred from host kind
                              │
                 ONE SupervisorEvent reducer
                 + injected recovery strategy (local snapshot | HTTP snapshot)
                 + injected persistence hooks (electron | browser)
```

Host side: one `HostComposition` that both `desktopAppReady` and the standalone CLI call, taking
a `NativeShellServices` parameter for the parts that genuinely need Electron (window management,
tray, `WebContentsView` browser panel, overlays). Everything else (SSH, Chrome bridge, computer-use
ingress, schedules, MCP) composes in the host and is therefore identical on desktop and server.

## 4. Plan

Batches are disjoint in file ownership so lanes can run in parallel. Each item names its
acceptance. Every batch ends with typecheck, lint, focused tests, and a one-line row in this doc's
§5 log.

### Batch 0 — land on PR #725 before merge (small, user-visible)

| #   | Item                                                                                                                                                                                       | Acceptance                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 0.1 | H2: set `nativeSsh` and `nativeBrowserWebContents` false in `ATTACHED_ELECTRON_CAPABILITIES`; SSH/Browser surfaces show the existing "unavailable on this host" state instead of throwing. | Attached-Electron test asserting both flags false; `BrowserPanel` and `RemoteServersSettings` render the unavailable state. |
| 0.2 | S3: redact `env` values on both MCP read routes using the existing probe redaction.                                                                                                        | Route test: response has keys with redacted values, never raw values.                                                       |
| 0.3 | H5: replace the silent `app.quit()` at `main.ts:221-228` with the same dialog path used at `:198-199`, adding a Retry action.                                                              | Test covering the `starting`-owner refusal shows a dialog message key.                                                      |
| 0.4 | Gates doc: amend §1l Gate 2 row to state "desktop and standalone data roots differ; existing-profile promotion is manual (`activate`)".                                                    | Doc row present; no other text changed.                                                                                     |

### Batch 1 — one host composition (H1, H3, H6, H8)

| #   | Item                                                                                                                                                                                                                | Acceptance                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Extract `composeHostServices(core, nativeShell?)` from `startDesktopApp`; move SSH manager, Chrome bridge, computer-use ingress, schedule wiring into it. Browser panel stays behind `nativeShell`.                 | `src/server` calls the same function; a standalone server passes the SSH and Chrome-bridge e2e cases; `desktopAppReady.ts` under 400 lines.              |
| 1.2 | Host-declared capabilities: add `capabilities` to the describe response (ssh, browserPanel, chromeBridge, computerUse, nativeSecrets, portForward). Renderer `clientRuntime` derives from it, never from host kind. | Contract version bump with old-reader rejection test; renderer tests for helper, desktop-managed, attached, browser flavors.                             |
| 1.3 | Data-root unification: desktop-managed host adopts `<root>.host-v1` with an automatic, journaled, resumable promotion of the plain root on first launch; keep `activate` as the manual override.                    | Pre-upgrade regression test: seeded plain-root profile launches once, all threads visible, lease held on the new root; rollback via `backup` documented. |
| 1.4 | Split `startDesktopApp` along the six seams named in the host lane report; dedupe `setKeybindings`.                                                                                                                 | No function over 200 lines in `src/main/desktopApp*.ts`.                                                                                                 |

### Batch 2 — one client transport (H4, T1, T2, T3, T5, T6)

| #   | Item                                                                                                                                                                                                                | Acceptance                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | T1: remote socket registers an overflow listener; a dropped frame marks the session `resync-required` and reconnects from the last _applied_ seq; cursor advances only after apply. Add expected-seq gap detection. | Test: inject overflow mid-stream, assert no thread item is missing after reconnect; test: seq gap triggers resync.                                                        |
| 2.2 | T2: engine host becomes per-consumer (or per-generation-scoped) so a loopback close cannot reject remote or persist work.                                                                                           | Test: reset one consumer while another has in-flight work; the other resolves.                                                                                            |
| 2.3 | T3: single `SupervisorEvent` reducer with injected recovery and persistence hooks; delete the `app.tsx` copy.                                                                                                       | Both existing reducer test suites pass against the one module; divergence cases (selector cache, reset ordering) are explicit tests.                                      |
| 2.4 | T5: `clientRuntime` becomes the only reader of `window.poracode*`; lint rule (oxlint `no-restricted-globals` or a custom check) bans raw reads outside `src/renderer/clientRuntime*`.                               | Zero raw reads outside the allowlisted files; attached-Electron gets the right sidebar/browser behavior.                                                                  |
| 2.5 | H4: desktop-managed renderer talks to the host over loopback HTTP+WS (the attach path) instead of `backendHostProtocol` + `BackendRendererStream`. Preload IPC stays for bootstrap and native shell services only.  | Large-reply (32 MiB) and multi-window fallback tests pass on the unified path; then delete the stream path and its version constants. Measure host-loop p99 before/after. |
| 2.6 | T6: version `src/shared/ipc` procedure map and the engine worker protocol; mismatch is a typed rejection, not a drop.                                                                                               | Versioning inventory in `.agents/docs/versioning.md` updated; old-reader tests for both.                                                                                  |

### Batch 3 — contract single source of truth (T4)

| #   | Item                                                                                                                                                             | Acceptance                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 3.1 | `httpRouter` dispatches from a generated route table; the regex conformance test is deleted because it becomes structurally impossible to add an unlisted route. | Any route not in the registry fails typecheck; manifest moves under `generated/`; docs counts generated. |
| 3.2 | Scopes live in the registry per route; the renderer and native bundles receive them from generation.                                                             | Native parity check includes scope per route.                                                            |

### Batch 4 — Gate 6 trust surface (S1–S9, T7)

| #    | Item                                                                                                                                                                                                                                     | Acceptance                                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 4.1  | S1 decision: default bind `127.0.0.1`. Named modes `loopback` / `tailnet` / `lan`; `lan` refuses to start without TLS material unless an explicit acknowledgement flag is set. `doctor` reports exposure.                                | Config test for each mode; existing desktop, relay, `tailscale serve`, SSH-tunnel flows unchanged.            |
| 4.2  | TLS option for direct connections: cert/key paths in config, self-signed generation in `poracode-server init`, fingerprint shown in the pairing QR and pinned by clients on first pair.                                                  | Pair over `https` with a self-signed cert from web and one native client; fingerprint mismatch refuses.       |
| 4.3  | S2: pairing requests carry scopes; default `operator`; add `viewer` preset (read-only routes only). Renderer stops requesting all scopes.                                                                                                | Route tests: viewer token denied on every mutating route.                                                     |
| 4.4  | S4: image routes set `Content-Security-Policy: sandbox`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` with fixed filename; SVG served as `attachment` or rasterized.                                                 | Response header test; the web client still renders images.                                                    |
| 4.5  | S5: port forwards bind the same host as the remote server and require the bearer or a per-forward ticket; discovery list and forward gate share one allowlist.                                                                           | Unauthenticated connect to a forwarded port is refused.                                                       |
| 4.6  | S6: refresh tokens with 24 h access-token lifetime; server-side revocation list; drop `?access_token=` in favor of the existing `imageTicket`.                                                                                           | Old token rejected after revoke; no bearer in any URL in tests.                                               |
| 4.7  | S7: `Host` header allowlist on the remote server (reuse the MCP ingress implementation); structured audit log for pair, exchange, revoke, thread create/send/stop, file read/write, forward open.                                        | Audit line per event in tests; log rotation from 4.9.                                                         |
| 4.8  | T7: document relay trust honestly in `REMOTE_ARCHITECTURE.md`; add channel binding (token bound to relay session key) so a captured bearer cannot be replayed off-relay. Full E2E is a later decision.                                   | Replay test fails off-relay.                                                                                  |
| 4.9  | H7 operability: config file + CLI flags, leveled logs with rotation, `/healthz` and a metrics endpoint gated to loopback, SIGTERM drain deadline that releases the lease, `uncaughtException` handlers, node-pty Linux prebuild staging. | Out-of-checkout install qualification runs in CI on Linux; kill -TERM releases the lease within the deadline. |
| 4.10 | S9: `SECURITY.md` with the five-attacker threat model (compromised client, stolen token, LAN peer, compromised relay, malicious website).                                                                                                | Document exists; each Gate 6 item links to the attacker it addresses.                                         |

### Batch 5 — client parity (P1–P4)

| #   | Item                                                                                                                                                   | Acceptance                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 5.1 | P1: interactive PTY on native mobile (raw key passthrough, Ctrl sequences, resize), or mark terminal presentation as `partial` in the ledger and docs. | Either a typed keystroke reaches the PTY in a device test, or the ledger says `partial`. |
| 5.2 | P2: generate pairing and terminal-cursor state machines from one spec (same pipeline as the wire contract), starting with pairing.                     | Swift and Kotlin pairing code is generated; parity tapes remain as regression.           |
| 5.3 | P3: one journey test per native platform per ledger feature family (pair, thread send/steer/stop, permission prompt, terminal, git).                   | Native CI runs them at the RC SHA.                                                       |
| 5.4 | P4: split the ledger into `wire` and `ui` columns; add mDNS discovery once TLS exists.                                                                 | Ledger schema change with CI check.                                                      |

### Ordering and dependencies

- Batch 0 is independent and small; ship on the PR.
- Batch 1.2 (host-declared capabilities) precedes 2.4 and 5.4.
- Batch 1.3 (data-root unification) precedes any public server release; it is the item that makes
  "existing desktop user installs the server" work.
- Batch 2.5 (transport collapse) is the largest and riskiest; run it last in batch 2 with the Gate 4
  host-loop measurement repeated before and after.
- Batch 4.1 and 4.3 are cheap and should go first in Gate 6; 4.2 (TLS) is the prerequisite for any
  LAN mode and for 5.4 discovery.
- Batch 3 can run any time after batch 0.

## 5. Decisions needed

| Decision                                   | Recommendation                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Network default (Gate 6 C1, still PENDING) | Loopback default with `tailnet` / `lan` modes; `lan` requires TLS or an acknowledgement flag. Rationale in §2.3 S1.  |
| Data-root unification direction            | Desktop adopts `.host-v1` with automatic promotion (1.3), rather than the server adopting the plain root.            |
| Transport collapse                         | Approve 2.5 as a V5 goal; it removes ~2 500 lines and two version constants but is the riskiest single change.       |
| Mobile terminal                            | Decide between building interactive PTY (5.1) and labeling it `partial`; do not leave the ledger saying implemented. |
| Relay E2E                                  | Channel binding now (4.8); full E2E encryption is a separate product decision.                                       |

## 6. Execution log

| Date       | Batch | Item           | Commit      | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | ----- | -------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-18 | 0     | 0.1–0.4        | `8fd09c931` | Attached-Electron caps corrected (+test); project-settings MCP read redacted with write-side marker restore (+route and command tests); startup failure dialog with Retry via shared message catalog (+test, 12 locales); Gate 2 row amended. Typecheck/lint green; 144 focused tests pass.                                                                                                                                                                                                                                                                         |
| 2026-09-18 | 1     | 1.1, 1.2, 1.4  | `5dee23153` | `composeHostServices(core, nativeShell?)` extracted; standalone server composes SSH + Chrome bridge + computer-use (composition test); `HostDescription.capabilities` added with HOST_CONTROL_PROTOCOL_VERSION 1→2 and old-reader rejection tests both directions; renderer derives capabilities from host-declared data (all four flavors tested). `desktopAppReady.ts` 1054→215 lines across six seam modules; `setKeybindings` deduped into `keybindingsApply.ts` (+rollback test). Schedule wiring documented as already-identical in `BackendDurableServices`. |
| 2026-09-18 | 3     | 3.1, 3.2       | `054c6a82a` | Contract registry is the single route/procedure/scope table; `httpRouter` dispatches from the generated table (drift fails typecheck — proven both directions); regex drift test deleted; manifest generated under `generated/` (byte-stable, two hand-copy drifts corrected); scopes enforced centrally per route; native bundles + parity ledger carry per-route scope.                                                                                                                                                                                           |
| 2026-09-18 | 4     | 4.1, 4.5       | `b3447038b` | Default bind 127.0.0.1 with named `loopback`/`tailnet`/`lan` modes (`PORACODE_REMOTE_BIND_MODE`; `lan` refuses without `PORACODE_ALLOW_PLAINTEXT_LAN=1`); doctor reports exposure. Port forwards bind the server's host, share one forwardable-port allowlist (discovery + gate), and require a per-forward connect ticket (or validator-authorized bearer) as the first LF-terminated line; router mints the ticket on `POST /api/ports/forward`, schema + generated bindings + renderer raw-copy updated.                                                         |
| 2026-09-18 | 1     | 1.3            | `a8aa96ddb` | Desktop adopts `<root>.host-v1` with automatic, journaled, resumable promotion of the plain root on first launch (promoteDesktopRoot.ts; both crash windows tested); `activate` stays the manual override; ambiguity refuses loudly; rollback documented in HOST_OWNERSHIP.md; attach mapping classified by owner-record kind. Pre-upgrade regression test green; ownership suites 247/247.                                                                                                                                                                         |
| 2026-09-18 | 2     | 2.1, 2.2, 2.6  | `8383af66d` | Remote WS session registers overflow listener, resyncs on drop/gap, watermark advances only after apply (tests: no loss after mid-stream overflow; seq gap triggers resync). Process-wide engine singleton replaced by three per-consumer engines (reset isolation tested). ipc procedure map + engine worker protocol versioned with typed mismatch rejections both directions.                                                                                                                                                                                    |
| 2026-09-18 | 4     | 4.3, 4.4, 4.7  | `fcb206e8e` | Pairing scopes requested via operator (default) / viewer presets — viewer denied on all 24 mutating routes, admitted on all 20 read routes (registry-enumerated matrix). Image responses hardened (CSP sandbox, nosniff, fixed filename, SVG attachment). Host-header allowlist gate + structured JSONL audit log (pair/exchange/revoke/thread ops/file ops/forward open) wired into both composition roots.                                                                                                                                                        |
| 2026-09-18 | 2     | 2.3, 2.4       | `cb3553265` | One SupervisorEvent reducer with injected recovery (local snapshot \| HTTP snapshot) and flavor hooks; app.tsx copy deleted; divergences closed as explicit tests. clientRuntime is the sole `window.poracode*` reader (12 files migrated; crash screen allowlisted with justification); oxlint rule bans raw reads outside the permanent allowlist.                                                                                                                                                                                                                |
| 2026-09-18 | 4     | 4.2, 4.6       | `fd2f0fef2` | TLS for direct connections (env-configured material, self-signed generation + `init-tls` command, fingerprint in pairing QR, client pinning, TLS satisfies the lan gate); 24h access + rotating 30d refresh tokens with a persisted revocation list; `?access_token=` removed; /healthz + loopback-gated /metrics added through the registry (67 routes).                                                                                                                                                                                                           |
| 2026-09-18 | 4     | 4.8, 4.9, 4.10 | `9ff39078a` | Relay-issued tokens are AES-GCM channel-bound (off-relay replay fails); server operability: config file + CLI flags, leveled rotating logs, bounded SIGTERM drain that releases the lease, fatal handlers, node-pty Linux staging; SECURITY.md five-attacker threat model with per-item mitigation matrix.                                                                                                                                                                                                                                                          |
| 2026-09-18 | 5     | 5.1, 5.3, 5.4  | `d74429e51` | Interactive native terminals on iOS + Android (raw key encoders with Ctrl chords, resize; never partially claimed); per-family Android JVM journey tests + iOS AppTests coverage; parity ledger format 2 with wire/ui columns and CI enforcement.                                                                                                                                                                                                                                                                                                                   |
