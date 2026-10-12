# Port-forward origin isolation

Status: required for v2 production readiness; design review and implementation
remain active. The current proxy is not isolated. This document is not an
acceptance exception or a claim that the runtime is fixed.

## Confirmed failures

Real iOS Safari opened two synthetic applications through one production host.
After entering B, the still-open Page A sent HTTP requests to B while its
existing WebSocket remained connected to A. Reconnecting the socket sent it to
B as well. The shared `lc_forward` cookie changes the target for every tab.
The relay also uses a shared `lc_relay` routing cookie across hosts.

Forwarded JavaScript can access browser storage on the host origin. A locally
served PWA can occupy that origin too. The browser token vault's encryption does
not create an isolation boundary between scripts on the same origin. The live
probe used only a synthetic canary; it did not inspect credentials.

Evidence: `tmp/v2-production-review/port-isolation/REPORT.md` and
`tmp/v2-production-review/safari-composer/port-origin-isolation.md`.

Server integration tests also reproduced forwarding after revocation. The
active HTTP and WebSocket cases now pass with forward lifetime cancellation.
A further test stops a forward, replaces its upstream listener, then opens a
new forward to the same port: the shared idle HTTP connection reached the old
draining service. A private pool owned by each forward fixes that reproduction;
all five server integration cases pass with the final idle-retention options.
The combined six server suites pass all 174 tests; touched lint and formatting
checks pass. This fixes revocation, not browser-origin isolation. See
`tmp/v2-production-review/port-isolation/idle-reuse-before.log` and
`tmp/v2-production-review/port-isolation/revocation-final-options.log`.

## Required invariants

1. A forward has an origin distinct from the PWA/API and from other forwards.
   HTTP requests, root-relative assets, redirects and WebSocket reconnects
   resolve to the same authenticated host and forward throughout its lifetime.
2. Entering another forward cannot change an existing tab's routing, browser
   storage, session authority or open sockets. This includes two forwards on
   one host and forwards on different hosts behind one relay.
3. Forwarded content cannot access PWA credentials, caches or service workers.
   Proxy session cookies and internal routing credentials never reach an
   upstream application. A caller-supplied public header cannot assert trusted
   origin or relay routing context.
4. Stopping a forward revokes its entries, sessions and connections. An old
   origin cannot silently begin serving another target after restart or reuse.
5. Ordinary development applications retain storage, root-relative HTTP,
   navigation, forms and HMR/WebSocket behavior. Tests must exercise actual
   browser-origin behavior as well as server routing.
6. The secure route must work through supported direct and HTTPS/relay
   deployments. Missing DNS/TLS/proxy configuration must be explicit; the
   implementation must not silently fall back to shared-origin content.

## Design under review

Use forward-specific origins bound to an authenticated host and forward.
HTTPS/relay deployments likely need a configured isolated wildcard domain and
TLS routing. Its registration and trusted dispatch metadata must be reviewed
with the host transport, not inferred from arbitrary visitor headers.

An existing relative `enterPath` could remain a compatibility entry point if it
redirects to the isolated origin and mints its session there. Native clients
currently validate that relative path before opening a browser; examine all
redirect, URL-validation and revocation behavior before retaining that contract.
Audit and version any new host/relay handshake, capability, configuration or
deployed routing boundary. Old hosts/relays must not produce a false claim of
isolation merely because an optional field parses.

The existing direct TCP listeners use separate ports. Those separate browser
origins can prevent storage/HTTP target mixing, but cookies are scoped by host,
not port; raw listeners also differ from authenticated HTTP proxy sessions.
Choosing a raw URL only in one client is not the complete security fix.

Changing cookie names or paths cannot disambiguate arbitrary prefixless
requests from multiple tabs on a shared origin. An opaque CSP sandbox prevents
storage access but removes capabilities ordinary development apps need. Neither
approach is accepted as full remediation.

## Verification before sign-off

- Two applications on one host and two hosts behind one relay: alternate tabs,
  fetch root-relative resources, reload, reconnect sockets, stop one forward,
  restart the host/relay, and verify target identity and independent recovery.
- Synthetic browser-storage and service-worker isolation probes. Inspect only
  test data; no real credential extraction is required.
- Cookie handling, forged routing context, disallowed origins, reserved API
  paths, entry replay/expiry, revocation and old-origin reuse regressions.
- Web, iOS and Android start/open/copy/reopen behavior against updated and older
  compatible hosts. Verify HTTPS redirects and configured-domain failures.
- Deployment validation for actual wildcard DNS/TLS and proxy behavior; local
  Host-header tests alone are not evidence that production routing is ready.

Independent GLM 5.3 Flash High host and relay reviews are complete. Coordinator
validation is recorded in
`tmp/v2-production-review/port-isolation/coordinator-design-decisions.md`.
Implementation and deployment verification remain open.

## Relay compatibility during implementation

The relay framing version is now 2. Host and relay must be upgraded together;
version 1 registration is rejected. The remote application wire protocol remains
version 9 at this stage, and its generated contract drift check still passes.

Relay requests carry an explicit forward UUID and external origin derived from
the registered hostname owner. The adapter validates that context before adding
its private local-dispatch headers. Those headers must never reach an upstream
application. The shared `lc_relay` routing cookie and `bindVisitor` response flag
have been removed; normal API requests require their `/s/<host>` prefix.

Focused framing, adapter and routing tests pass. The five real-host relay entry
scenarios are being migrated to the new exchange flow, and production composition
still needs to select the registered relay origin correctly. These intermediate
checks do not establish complete browser isolation or deployment readiness.

## Coordinator validation of the relay review

The relay review confirms the routing and storage failures and the need for
forward-specific hostnames. Its suggested legacy switching confirmation page
does not meet the storage-isolation invariant, so it is not accepted as full
remediation. The source also copies upstream cookies and service-worker scope
headers; those paths require explicit protection.

The existing raw TCP forwarding capability must remain supported. Replacing
its listener with HTTP-only transport, as proposed in the host review, would
drop an existing tested capability. A separate authenticated browser mode or
listener needs an intentional compatibility design. Separate proxy-cookie names
on different ports also leave ordinary application-cookie collisions unresolved.

Two design details need stronger guards than a bare forward-ID registry:

- An authenticated host must not claim or reuse another host's forward origin,
  including after disconnect or revocation. Derive origin identity from both
  host and forward identity and enforce ownership throughout registration and
  recovery; knowing a public forward UUID must not grant hostname ownership.
- Sibling hostnames do not by themselves protect cookie integrity. A sibling
  can set a parent-domain cookie. Protect proxy credentials with HTTPS
  host-bound cookie semantics and filter reserved routing cookies from upstream
  responses. Direct HTTP support needs an explicit security analysis.

The origin identity must also survive logical relay server-ID reuse safely.
A relay can eventually release an abandoned server-ID binding; hashing only
that public ID and a public forward UUID would let its next owner derive the
old hostname. Bind derivation to the authenticated host's persistent key as
well, with a bounded single DNS label suitable for wildcard TLS. The relay must
derive and validate the label rather than accepting a caller-selected hostname.

On an isolated forward origin, paths such as `/api/*` and `/ws` belong to the
forwarded application. They must never reach Poracode's own handlers, but should
not be blanket-blocked: doing that would preserve the current incompatibility
with ordinary development apps. Keep the browser entry exchange narrowly
reserved and dispatch all other traffic directly to the bound forward.

These constraints follow the cookie standard's separate warnings about port
and sibling-domain isolation ([RFC 6265, sections 8.5–8.6](https://www.rfc-editor.org/rfc/rfc6265.html#section-8.5)).
Service-worker registration requires a secure context and can broaden its scope
when the script response supplies `Service-Worker-Allowed`; forwarding those
headers can therefore expand an upstream script's control over a shared origin
([MDN register()](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register)).
For deployments using Let's Encrypt, wildcard issuance requires DNS validation;
HTTP-01 cannot issue wildcard certificates
([challenge documentation](https://letsencrypt.org/docs/challenge-types/)).
