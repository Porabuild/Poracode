# Native protocol policy — canonical invariants across TS / Swift / Kotlin

The desktop TypeScript implementation under `src/shared/remote/` (plus the
schemas it exports) is the canonical remote-protocol reference. The native
clients mirror it: iOS in `ios/App/App/Protocol/` + `Transport/`, Android in
`android/app/src/main/kotlin/com/poracode/app/protocol/` + `transport/`. This
document names the invariants that are fixture-pinned across all three, the
machine-readable sources of truth, and the differences that are legitimate.
Anything not listed here as a legitimate difference is a parity bug: fix the
native side or, if the reference is wrong, change the reference first.

## Machine-pinned policy surfaces

| Surface                                                                | Source of truth                                                                                                                                                                                                                                             | Consumed by                                                                                                                                                     |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protocol version, wire format, compatibility policy                    | `generated/manifest.json` — generated from the contract registry (`src/shared/remote/contract/`); carries `protocolVersion`, `versionPolicy`, `unknownAdvertisedScopes: filter`, `endpointPathPolicy: append-to-preserved-base-path`, per-route `scopes`, … | `native-protocol-version.test.ts`, generated bindings (`generated/native/`), `GeneratedRemoteV3*ContractTest` (Android), `GeneratedRemoteV3ContractTests` (iOS) |
| Environment descriptor: auth policy, bootstrap/session methods, scopes | `fixtures/environment.json` asserting `remoteEnvironmentDescriptorSchema` output — `auth.policy: "remote-reachable"`, `auth.bootstrapMethods: ["one-time-token"]`, `auth.sessionMethods: ["bearer-access-token"]`, the seven standard scopes                | TS snapshot builder (`buildShellSnapshot`'s `descriptor()`), Android environment projection tests, iOS scope narrowing                                          |
| Canonical HTTP + WS endpoint semantics                                 | Contract registry (`src/shared/remote/contract/`) — `httpRouter.ts` dispatches from it; the generated procedure contract is derived from the same registry                                                                                                  | Generated bindings on both natives                                                                                                                              |
| Pairing-URL grammar (parse, normalize, cleartext gate)                 | `fixtures/pairing-url-cases.json`                                                                                                                                                                                                                           | `src/shared/remote/pairingUrl.test.ts`, `PairingUrlTest.sharedPairingUrlConformanceFixtures`, `PairingURLTests.testSharedPairingURLConformanceFixtures`         |
| Replay/event envelope and state events                                 | `fixtures/replayable-state-events.json`, `fixtures/replay-git-state-parity-tape.json`                                                                                                                                                                       | Conformance + native contract tests                                                                                                                             |

## Scope policy

Scopes are an exact enum in TS (`remoteAccessScopeSchema`):
`session:read`, `session:operate`, `terminal:read`, `terminal:operate`,
`requests:resolve`, `projects:manage`, `ports:forward`.

- A server advertising scopes an older client does not know is filtered, never
  rejected (`unknownAdvertisedScopes: filter`; `isKnownRemoteAccessScope`).
  A session with zero known scopes is refused: iOS surfaces
  `PairingError.noMatchingScopes`; Android mirrors the narrowing in its
  environment projection.
- A client requesting unknown scopes is rejected by the server
  (`unknownClientRequestedScopes: reject`).
- New scopes are additive protocol changes: extend the TS schema first, ship
  the native narrowing update in the same change, and bump/justify the version
  per `.agents/docs/versioning.md`.

## Pairing-URL canonical rules

`src/shared/remote/pairingUrl.ts` defines the grammar; the fixture pins it:

1. The credential rides in the `#token=…` fragment so it never reaches a
   hosted pairing app's server logs. The desktop endpoint rides in `?host=…`
   when the link points at the hosted pairing app.
2. Duplicate query/fragment parameters resolve to the FIRST occurrence
   (`URLSearchParams.get`, `URLComponents.queryItems.first(where:)`,
   Android first-wins map). A repeated parameter must never override an
   earlier value — that would let a suffix rewrite the desktop endpoint.
3. Endpoint normalization follows `?host=` first, rewrites the Vite dev port
   (3100 → 49152), strips the `pair|app|desktop|mobile.html|index.html`
   suffix, preserves relay base paths (`/s/<id>`), and drops credentials.
4. The cleartext gate allows `http:` only off-loopback; loopback hosts
   (`localhost`, `127.0.0.1`, `::1`, `[::1]`, `*.localhost`) are exempt
   because browsers treat them as secure contexts.
5. A URL without a usable token parses to null/unusable everywhere; garbage,
   relative, and scheme-less inputs never throw across the boundary — they
   return null (parse) or a typed invalid-URL error (normalize).

## Legitimate platform differences (and where they are pinned)

These are asserted nowhere in the shared fixture on purpose; each is pinned by
platform-only tests and must keep its rationale:

1. **Query-token fallback on http(s) links (natives only).** iOS and Android
   accept `token=` in the query when the fragment is absent; the desktop
   requires the fragment. Mobile deep-link plumbing can drop fragments; desktop
   links are always host-built. (`PairingUrlTest.parseTokenFromQueryAsFallback`,
   iOS query-token tests.)
2. **`poracode://` custom-scheme links (mobile only).** A mobile-only deep-link
   surface; desktop `parsePairingUrlParts` returns null. Routing rules
   (endpoint only from the decoded `host=` http(s) parameter) live in native
   tests (`PairingIntentDecisionsTest`, iOS candidate tests).
3. **Loopback scope (Android stricter, two layers).** In the shared URL
   classifier (`isLoopbackHostname`, the one the fixture pins), Android adds
   the whole 127.0.0.0/8 range; on a phone, a 127.x address is the phone
   itself. Separately, Android's transport cleartext gate
   (`CleartextPolicy`/`LocalNetworkAccess` via `isPrivateOrLoopbackHostname`)
   only dials private/loopback addresses and knows the emulator alias
   `10.0.2.2` — the desktop/iOS reference has no transport-layer equivalent.
4. **normalizeEndpoint scheme strictness.** Android rejects a non-http(s)
   outer scheme outright; iOS follows `?host=` before the outer-scheme check
   (custom-scheme deep links depend on that ordering) — both require the
   resolved endpoint to be http/https. The desktop normalizer accepts any
   parsable scheme because it is a paste-box normalizer, not a security gate.
5. **`+` decoding.** Desktop/Android decode `+` as a space in query/fragment
   values; iOS `URLComponents` leaves it literal. Pairing credentials are
   base64url, so no canonical claim exists — do not put `+` in asserted
   fixture values.

## Change discipline

- Wire changes are additive within protocol v3 and ride the compatibility
  matrix required by `docs/V3_ITERATION_PLAN.md` (old/new host × client ×
  relay, negotiation or explicit rejection, generated bindings, previous-
  version regression coverage).
- A parity-relevant change to `pairingUrl.ts` must update
  `fixtures/pairing-url-cases.json` and run all three consumer suites
  (`pnpm exec vitest run src/shared/remote/pairingUrl.test.ts`,
  `:app:testDebugUnitTest --tests "*PairingUrl*"`, iOS AppTests) in the same
  commit.
- The parity ledger (`native-parity.json`) governs feature adoption evidence;
  this document governs behavior the ledger cannot express.
