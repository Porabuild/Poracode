# ADR: Server-Owned Execution Environments (C1)

Status: decision record for implementation. This change adds no code and claims no verified behavior.
Audited revision: `36e1649f017aeccebc202bb9d5c9c6ab0f797709` (`poracode/v2`).
Sources: [production plan](V2_SERVER_ARCHITECTURE_PRODUCTION_PLAN.md) §3.3, §5 C1, §7 stage 4; `tmp/v2-production/research-environments.md`.
Companion: `tmp/v2-production/c1-authorization-design.md` (client seam evidence, header/ticket matrix, refresh/revocation flows, skew analysis).
Plan acceptance unchanged: §5 C1 and §8 gates stand; this ADR only makes the decisions implementable.

Decisions at a glance: (1) three concepts stay distinct; (2) `environmentId` is host-minted with CAS revisions; (3) credentials stay host-local and client tokens stay in the vault; (4) the parent proxy is the only default path, with the child bearer in `Authorization` and a separate parent header, and two WS tickets; (5) existing protocol-v12 scopes are reused, never appended; (6) the descriptor capability is emitted only when every route is usable; (7) upgrades are explicit and stop-then-start; (8) legacy migration is explicit and never uploads keys.

## 1. Concepts

| Concept                    | Owner                             | Identity                        | Closing a client     |
| -------------------------- | --------------------------------- | ------------------------------- | -------------------- |
| Paired server              | that server                       | its own `desktopId` and session | disconnects only     |
| Host-owned SSH environment | the selected server (parent host) | host-minted `environmentId`     | no effect            |
| Device-local SSH tunnel    | the device                        | device-local connection id      | may stop that tunnel |

Connecting to a paired or existing server never replaces or upgrades it. Creating/provisioning a new host-owned environment explicitly authorizes its first installation. Preserve the existing device-local first-install experience, while refusing implicit replacement of an already-running owner (C2; plan §9).

## 2. Identity, store, runtime state

- `environmentId` is a host-minted UUIDv4, stable across restarts; never derived from target or label.
- Store: `environments.json` in the host's owned data root, `formatVersion: 1`, atomic writes, one writer per composition. The owner is the process that owns the remote server (desktop backend child or standalone composition); Electron main never writes it.
- Durable record: `{ environmentId, revision, label, target, port?, credentialRef?, trust, runtime, childIdentity, legacyConnectionIds?, desired, createdAt, updatedAt }`. Observed connection state, operation generation, pending promises, and transient errors stay in the runtime controller; startup never trusts a persisted `connected` flag. Public errors are bounded typed codes, not raw SSH errors or private paths.
- CAS: every mutation carries `expectedRevision`; mismatch returns 409 with no partial write.
- `childIdentity.desktopId` is recorded after the first verified connect. The child's data dir is keyed by `environmentId`, not by the legacy connection id, so parent restart restores child identity/history.
- `desired: enabled|disabled` is host-owned; `state` is observed (`disconnected|connecting|connected|error|credential-missing|owner-unverified|identity-changed`). Closing any client changes neither.
- Read projections include the configured SSH target port so authorized clients can display and edit the target accurately. They never include `identityFile` paths, local tunnel ports/endpoints, or tokens. `trust.state` is `unknown|observed|pinned`.
- Renderer store v1 → v2 adds `transport: { kind: "environment", parentDesktopId, environmentId, childDesktopId }`. `direct`/`ssh` records stay byte-compatible; migration is explicit, never automatic.

## 3. Credential custody

- v1 delegates SSH authentication to the host user's OpenSSH (agent/keys), as today. No password auth, no key bytes on the wire, no host-generated keys, no implicit key upload.
- A client may send only an identity _reference_ the host resolves locally. The path is validated (exists, regular file, host-readable) and never echoed; an invalid reference marks `credential-missing` and blocks connect. Device-local `identityFile` paths stay on the device.
- The environment registry stores references and pins only — never tokens or raw secrets.
- The client vault holds both grants for an environment: the parent host grant (existing paired-server record) and the child grant keyed by `(parentDesktopId, environmentId)`. Refresh updates the vault; the host registry is never a token store.
- Legacy migration is an explicit per-connection "Move to this server" action. The host adopts `$BASE/hosts/<legacyConnectionId>/data` through `legacyConnectionIds`; two legacy ids are never merged; a path the host cannot see marks `credential-missing`, never copies bytes.

## 4. Host-key trust

- `trust.state: unknown | observed | pinned`.
- An existing trusted OpenSSH known-hosts entry may establish trust. Otherwise probe and present the fingerprint for explicit operator confirmation before provisioning or remote credential-authenticated operations. Record that accepted fingerprint and enforce it on subsequent connects; an unconfirmed probe is not authorization to install or execute.
- `pinned` uses a per-environment known-hosts file with `StrictHostKeyChecking=yes`. A mismatch fails closed (`hostkey-mismatch`) and cannot be cleared by connect — only by an explicit manage-permission re-trust.
- A later connect whose observed key differs from the recorded `observedFingerprint` also fails closed (TOFU violation) and requires manage re-trust.
- Trust changes require all management scopes in §6 and are audited.

## 5. Transport: two independent authorities

The parent proxy is the only default path. Clients never dial the child's loopback tunnel and never receive its port. Implementation reuses the existing loopback proxy mechanics (`portForwardProxy` HTTP/WS forwarding, Host rewrite, hop-by-hop/cookie stripping, bounded streaming, cancellation) through a shared helper — not a second proxy stack.

Data-plane prefix: `/api/environments/{environmentId}/proxy/` + the child path verbatim.

- **HTTP.** `Authorization: Bearer <child access token>` stays exactly what clients send today; it belongs to the child and is forwarded unchanged. The parent credential travels in `x-poracode-environment-authorization: Bearer <parent access token>`, is validated by the parent against the parent session with the environment-use permission, and is stripped before the child dial. Child responses return unchanged except: child `Set-Cookie` is dropped on this prefix, the child descriptor's `endpoints.*` are rewritten to the parent proxy prefix, and no loopback URL or port is exposed.
- **WebSocket.** The client mints the child ticket exactly as today (through the proxy) and separately mints a parent environment-bound single-use upgrade ticket via `POST /api/environments/{environmentId}/websocket-ticket`. The upgrade URL is `.../proxy/ws?ticket=<child>&parentTicket=<parent>`; the parent consumes `parentTicket` (one use, 30 s, bound to parent session + `environmentId`), strips it, and dials the child `/ws?ticket=<child>`. `parentTicket` is a query parameter because browsers cannot set WS headers; native clients build the same URL.
- **No flattening.** Child scopes come only from the child's own token exchange; the parent never re-scopes, replaces, or caches the child bearer. Parent and child sessions stay independently revocable.
- **Identity/SSRF guard.** The proxy resolves its target only from the host registry by `environmentId`; client-supplied hosts, ports, and URLs are ignored. Before any client credential crosses, the tunnel's child identity must match the recorded `childIdentity.desktopId`; a mismatch closes the tunnel with `identity-changed` and forwards nothing. Path traversal (`..`, encoded separators, absolute URLs) is rejected. Parent-only headers (`x-poracode-environment-*`, `x-poracode-forward-*`) never reach the child. A reserved environment header on a non-proxy path is rejected.
- **Refresh/revocation.** Parent-first: before a proxied request the client ensures a live parent token (parent's own `/oauth/token`, not proxied); a child 401 refreshes the child grant through the proxied `/oauth/token` with the parent header. Refresh is single-flight per authority and never recurses. A dead parent grant yields `needs-repair`, never a fallback dial. Parent session revocation closes its proxy sockets; child revocation closes the child leg and the parent tears down the client leg. Native clients have no refresh grant today, so they surface `needs-repair` on 401; native refresh is a declared follow-up, not silently emulated.
- **Relay traversal.** When the parent is reached through the existing relay, environment requests are ordinary authenticated parent API traffic and need no new relay route. One bounded relay change is required: the host-side relay adapter must unwrap a relay-bound parent credential in `x-poracode-environment-authorization` on the loopback hop, exactly as it already unwraps `Authorization` (`relayHostRequest.ts:36-78`). The child `Authorization` is never relay-bound (the child issues it directly) and passes through. Without this, a relay-paired parent token reaches the parent still bound and fails authentication.
- **Client seam facts (observed).** All three clients already preserve a path-prefixed endpoint when joining child paths (TS `clientTypes.ts:157-165`; Swift `RemoteAPIClient.swift:416-432`; Kotlin `RemoteApiClient.kt:413-426`), send the child bearer in `Authorization`, mint the child ticket through `POST /api/auth/websocket-ticket`, and accept extra HTTP headers; TS has single-flight refresh, iOS and Android have no refresh grant. The design adds one HTTP header and one WS query parameter, so no client needs a new transport. Full evidence: companion design note §1.
- **Management surface.** The data plane is the prefix above and is intercepted before registry matching (the registry cannot express a wildcard suffix). Management routes are ordinary registry routes:

| Route                                                | Method | Parent scopes                                      |
| ---------------------------------------------------- | ------ | -------------------------------------------------- |
| `/api/environments`                                  | GET    | `session:read`                                     |
| `/api/environments`                                  | POST   | all management scopes (§6)                         |
| `/api/environments/{environmentId}`                  | GET    | `session:read`                                     |
| `/api/environments/{environmentId}`                  | POST   | all management scopes (CAS update; trust included) |
| `/api/environments/{environmentId}/delete`           | POST   | all management scopes                              |
| `/api/environments/{environmentId}/connect`          | POST   | `session:operate` + `ports:forward`                |
| `/api/environments/{environmentId}/disconnect`       | POST   | `session:operate` + `ports:forward`                |
| `/api/environments/{environmentId}/pairing`          | POST   | `session:operate` + `ports:forward`                |
| `/api/environments/{environmentId}/upgrade`          | POST   | all management scopes                              |
| `/api/environments/{environmentId}/websocket-ticket` | POST   | `session:operate` + `ports:forward`                |
| `/api/environments/{environmentId}/trust-probe`      | POST   | all management scopes                              |
| `/api/environments/{environmentId}/trust-accept`     | POST   | all management scopes (CAS `expectedRevision`)     |
| `/api/environments/{environmentId}/adopt-legacy`     | POST   | all management scopes (CAS `expectedRevision`)     |

Route ids are the dispatcher handler keys: `environment-list`, `environment-create`,
`environment-get`, `environment-update`, `environment-delete`,
`environment-connect`, `environment-disconnect`, `environment-pairing`,
`environment-upgrade`, `environment-websocket-ticket`,
`environment-trust-probe`, `environment-trust-accept`,
`environment-adopt-legacy`. The three explicit trust/migration paths are
additive to the runtime's exposed operations: the host-key probe is a
manage-scoped POST (it opens a network dial but performs no install, exec, or
store write), acceptance is a CAS mutation, and legacy adoption is a CAS
migration. Exact paths, header dispositions, and ticket rules: companion design
note §2–§4.

## 6. Permissions and scopes

Reuse the documented protocol-v12 scopes. Do not extend `remoteAccessScopeSchema` or `REMOTE_OPERATOR_SCOPES`: an appended scope would enter the operator preset and break new-client→old-host pairing, and old strict decoders on session lists would fail.

| Action                                               | Parent scopes required                                  | Rationale                                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| list/get environments                                | `session:read`                                          | read-only projection                                                                                                        |
| connect/use/proxy/pairing/WS ticket                  | `session:operate` + `ports:forward`                     | opening a loopback network path and operating a remote target is the documented `ports:forward` class                       |
| create/provision/update/delete/trust/migrate/upgrade | `projects:manage` + `session:operate` + `ports:forward` | changes credential destinations and may trigger remote execution; project management alone must not authorize those effects |

- Viewer behavior: a viewer (`session:read`+`terminal:read`) may list but gets 403 on use and manage. A parent operator does **not** imply a child operator — child scopes come from the child's pairing grant/exchange and are enforced by the child on every request.
- No silent widening: reusing scopes adds no grant, and requiring combinations narrows. `REMOTE_OPERATOR_SCOPES` and `REMOTE_VIEWER_SCOPES` are unchanged.
- A future dedicated scope must be a capability-negotiated, separately advertised vocabulary requested only when advertised, with skew tests on all four clients; it must never be appended to the standard enum.

## 7. Capability and compatibility

- Additive descriptor capability `capabilities.sshEnvironments = { versions: [1] }` (new constant `REMOTE_SSH_ENVIRONMENTS_VERSION`), emitted **only** when the environment gateway is composed and every environment route is usable. Absent means clients hide the feature; a half-wired route is never advertised.
- Do not add fields to `hostServiceCapabilitiesSchema` (strict; old strict readers fail `describe`). Redefine `ssh` to mean "this host serves server-owned environment routes"; until C1 lands the desktop advertises `false` (today's `true` describes a device-local capability).
- Remote protocol stays v12. New routes are additive and capability-gated; regenerate `protocol/remote/v3` bindings/manifest/goldens and the native parity ledger. Skew is tested both ways: an old client pairs/connects unchanged against a new host (capability stripped), and a new client against an old host never calls the routes.

## 8. Lifecycle and explicit upgrades

- The host reconnects `desired: enabled` environments on startup with bounded concurrency and backoff, independent of clients.
- `connect` verifies compatibility first (protocol version, runtime hash, appVersion) and returns a typed result; it never replaces or kills an existing owner. First installation belongs to an explicit provision/create operation and uses the same safe bootstrap implementation.
- **Upgrade order is stop-then-start for the same data root.** The research proposal "start new owner, verify, then stop old owner" is rejected: one SQLite owner and one data fence per root, so two owners on the same root is split-brain. Explicit sequence: acquire the per-environment lock → verify owner identity → authenticated drain/stop the old owner → wait for exit and port closure → point at the content-addressed runtime → start the new owner → verify identity/generation → repoint. The child data dir is untouched.
- Upgrade is a separate manage-permission operation with operator confirmation. A client's bundled runtime hash is never authorization to replace a live server (C2).

## 9. Client surfaces, parity, i18n

- TS/Electron/PWA: environment records use a wrapper around `RemoteDesktopClient` that owns the parent and child token lifecycles; Settings gains list/create/connect/pair/trust/upgrade/migrate/delete with state and error surfaces. Every user-facing string is localized and all 12 catalogs are filled.
- iOS/Android: list/manage/connect/pair through the parent proxy with the same headers and tickets; models, generated-binding consumers, and the native parity ledger are updated.
- UI names the mode explicitly ("Host-owned environment" vs "Device-local SSH") so a user never mistakes where credentials and work live.

## 10. Versioned boundaries and fixtures

`environments.json` format 1 (CAS revision; corrupt/future refusal); renderer store v2 with a v1 migration fixture; environment descriptor capability v1; route manifest/goldens/native parity ledger; launch-script protocol versioned by the installed runtime hash (C2); parent WS tickets are in-memory only. Fixtures: route contracts, proxy HTTP/WS forwarding, identity-change refusal, restart identity, legacy adoption, permission matrix, skew pairs, hostkey pin matrix.

## 11. Executors (after the current C2/C3/B3/packaging lanes; non-overlapping)

| Lane                                 | Scope                                                                                                                                                                  | Depends on                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| C1.1 host store/contracts/capability | new `src/shared/environments.ts`, `src/host/environments/`, route contracts + handlers, gateway option, descriptor gate, compositions, codegen                         | C2 typed launch results; C3's ownership of the SSH manager in main |
| C1.2 parent proxy transport          | new `src/host/remote/environments/environmentProxy.ts` + shared loopback-forward helper, HTTP/WS prefix dispatch, parent ticket route, CORS header, descriptor rewrite | C1.1                                                               |
| C1.3 TS client/UI/migration/i18n     | `src/shared/remote/client*`, `src/renderer/state/remoteServers/*`, Settings UI, all 12 catalogs                                                                        | C1.2 contracts                                                     |
| C1.4 native clients/parity           | iOS/Android transports, models, UI, native parity ledger                                                                                                               | C1.1 codegen; parallel with C1.3                                   |
| C1.5 real gates                      | G-ENV-1 matrix, real-sshd lifecycle and stop-then-start upgrade, hostkey matrix, skew                                                                                  | all                                                                |

No lane edits `SshConnectionManager` internals (C3), ingress admission budgets (B3), or packaging scripts (D1–D3); C1 consumes those interfaces.

## 12. Acceptance (exact)

- `pnpm run protocol:remote:v3:generate && pnpm run protocol:remote:v3:check`
- `pnpm run typecheck && pnpm run lint`
- `pnpm exec vitest run src/backend/environments src/host/remote/environments protocol/remote/v3/native-parity.test.ts src/renderer/state/remoteServers` (environment suites inside each root)
- `pnpm i18n:extract` → 0 missing for every locale, plus the native test targets for environment screens.
- Real gates, not unit proof: G-ENV-1 cross-client/close-one/restart-identity/permission/nested-host; real-sshd environment lifecycle and stop-then-start upgrade; hostkey pin matrix; old/new skew pairs. Plan §5 C1 acceptance and §8 gates are unchanged.

## 13. Consequences

- Two authorities stay independent: a parent revocation can cut access to every environment without touching child sessions, and a child revocation can end one client's child access without affecting the parent or other clients. The cost is that clients hold and coordinate two grants, and every environment request pays one extra authenticated hop.
- The parent proxy is an availability dependency for environments: if the parent is down, environments are unreachable even though the child may be running. That is the accepted price of never exposing child loopback endpoints.
- Legacy device-local SSH remains a first-class mode; environments do not replace it, and migration is a per-connection user action with no automatic secret movement.
- Native clients ship the feature without token refresh; users may need to re-pair an environment after grant expiry until native refresh is implemented. This is documented, not hidden.

## 14. Rejected alternatives and decisive risks

| Rejected / risk                                                     | Decision / mitigation                                                                                      |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| "Clients support base paths, therefore the proxy works"             | Rejected: two bearer authorities, two WS tickets, and refresh/revocation are designed here, not assumed    |
| Start the new owner before stopping the old one                     | Rejected: single-owner data fence; stop-then-start only                                                    |
| Append a new scope to the enum                                      | Rejected: breaks the operator preset and old strict decoders; reuse now, capability-negotiated scope later |
| Parent bearer in `Authorization`, child in a custom header          | Rejected: would change every child call path and the child server; child bearer stays `Authorization`      |
| Child operator granted because the parent is an operator            | Rejected: child scopes only from the child grant; viewer matrix tested                                     |
| Exposing the tunnel endpoint or loopback URL as the client endpoint | Rejected: parent prefix only; child descriptor rewritten; no port in any client-visible field              |
| Forwarding credentials after a child identity change                | Fail closed (`identity-changed`), tunnel closed, nothing forwarded                                         |
| Parent token expiry deadlocking child refresh                       | Parent-first single-flight refresh; typed `needs-repair`; no loopback fallback                             |
| Advertising a capability whose route is unusable                    | One composition flag gates routes and descriptor; an absence test is required                              |
