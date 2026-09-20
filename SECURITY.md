# Poracode remote-access threat model

Scope: the Poracode remote surface — the standalone server / desktop-managed
host listener, its paired clients (desktop, PWA/browser, iOS, Android), the
port-forward gateway, and the self-hostable relay. Findings and item ids refer
to `docs/V5_CLIENT_SERVER_HARDENING_PLAN.md` (Gate 6); architecture background
lives in `docs/REMOTE_ARCHITECTURE.md` and `docs/STANDALONE_SERVER.md`.

Report vulnerabilities responsibly: see the contact section at the end.

## The five attackers

1. **Compromised client** — a paired device (or its browser profile) is fully
   controlled by an attacker: its stored tokens, its UI, and its network
   position are all hostile. Mitigations assume the token is already lost;
   they bound what the token can do and how far its loss propagates.
2. **Stolen token** — an attacker obtained a bearer/session credential without
   compromising a whole client: a copied file, a leaked log line, a shared
   screenshot of a QR, a token scraped out of a proxy.
3. **LAN peer** — any device on the same network as the host that can send it
   packets: a neighbor on café Wi-Fi, a compromised smart TV, an office peer.
4. **Compromised relay** — the operator of (or an attacker who has taken over)
   the self-hostable relay a host dials out through. This position terminates
   TLS for all visitor traffic; see the acknowledged-MITM statement in
   `docs/REMOTE_ARCHITECTURE.md` ("Relay trust and channel binding").
5. **Malicious website** — a page the user visits in the same browser (PWA
   session running) or a hostile page driving the host's browser-forward child
   origins; it may send requests, but cannot read cross-origin responses or
   hold non-cookie credentials.

## Mitigation matrix (Gate 6 items S1–S9 + T7)

Status vocabulary: **shipped** = landed on `poracode/v2` (commit referenced in
the plan's execution log §6); **in progress** = being landed in the current V5
batch; **pending** = a known, tracked gap.

| Item | Finding                                                      | Attackers addressed                         | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                | Status                        |
| ---- | ------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 4.1  | S1 plaintext `0.0.0.0` default                               | 3 (LAN peer)                                | Loopback-only default bind; named modes `loopback`/`tailnet`/`lan`; `lan` (all interfaces) refuses to start over plaintext without `PORACODE_ALLOW_PLAINTEXT_LAN=1`; `doctor` reports the exposure.                                                                                                                                                                                                                       | shipped (`b3447038b`)         |
| 4.2  | S1 no TLS path                                               | 2, 3                                        | Listener TLS material via `PORACODE_REMOTE_TLS_CERT`/`PORACODE_REMOTE_TLS_KEY` (both-or-nothing, loud failure); TLS-backed wide binds no longer need the plaintext acknowledgement; fingerprint surfaced for first-pair pinning.                                                                                                                                                                                          | in progress (Gate 6 TLS lane) |
| 4.3  | S2 every pairing grants every scope                          | 1, 2                                        | Pairing requests carry a scope preset (default `operator`, read-only `viewer`); the pairing credential is the scope ceiling and the exchange can only narrow; per-route scopes enforced centrally from the contract registry (viewer denied on all mutating routes).                                                                                                                                                      | shipped (`fcb206e8e`)         |
| 4.4  | S4 served-image hardening                                    | 5                                           | Image routes set `Content-Security-Policy: sandbox`, `X-Content-Type-Options: nosniff`, fixed filename `Content-Disposition: inline`; SVG served as `attachment`. Hostile stored markup cannot execute from the client origin.                                                                                                                                                                                            | shipped (`fcb206e8e`)         |
| 4.5  | S5 unauthenticated port forwards                             | 3, 5                                        | Forwards bind the server's own host (no wildcard default), one forwardable-port allowlist shared by discovery and the gate, and a per-forward connect ticket (or validator-authorized bearer) as the first line; unauthenticated connects are refused.                                                                                                                                                                    | shipped (`b3447038b`)         |
| 4.6  | S6 30-day non-rotating tokens; `?access_token=`              | 1, 2                                        | Refresh tokens with short-lived access tokens, server-side revocation, and removal of query-string bearers (image routes already prefer one-time `lc_img_` tickets).                                                                                                                                                                                                                                                      | pending                       |
| 4.7  | S7 no audit log; no Host-header gate                         | 2, 3, 5                                     | Structured JSONL audit log (pair/exchange/revoke, thread create/send/stop, file read/write, forward open) wired into both composition roots; Host-header allowlist gate (MCP-ingress precedent) in front of the dispatcher.                                                                                                                                                                                               | shipped (`fcb206e8e`)         |
| 4.8  | T7 relay is a full MITM by design                            | 2 (off-relay replay), 4 (accepted, bounded) | Channel binding: tokens minted through the relay are relay-bound credentials (`lcb1_…`); the raw token never crosses the relay and the direct path rejects the bound form, so a captured relay-issued bearer cannot be replayed off-relay. Relay compromise remains session takeover at token scope — acknowledged MITM, honestly documented; full E2E is a separate product decision. See `docs/REMOTE_ARCHITECTURE.md`. | shipped (this batch)          |
| 4.9  | H7 operability (supports incident response)                  | 2, 3, 4                                     | JSON config file + `--host/--port/--config` CLI flags; leveled JSONL log file under the host root with size rotation (`PORACODE_LOG_LEVEL`); bounded SIGTERM drain that frees the owner lease; `uncaughtException`/`unhandledRejection` handlers; node-pty Linux prebuild staging. `/healthz` (fixed literal body, no disclosure) and loopback-gated `/metrics` landed through the route registry.                        | shipped (this batch)          |
| 4.10 | S9 no written threat model                                   | —                                           | This document.                                                                                                                                                                                                                                                                                                                                                                                                            | shipped (this batch)          |
| —    | S8 rate limiter trusted `X-Forwarded-For`; health disclosure | 3, 5                                        | The relay mints an opaque per-visitor `clientId` (HMAC of the socket address under a per-relay salt) that cannot be spoofed by visitor headers; the unauthenticated `/healthz` body is a fixed literal and `/metrics` is loopback-gated, so neither discloses host details.                                                                                                                                               | shipped                       |

## What each attacker can still do

- **Compromised client / stolen token** — everything its scopes allow until
  revocation (`revokeAccessSession`, audited). Revocation is immediate and
  server-side; token lifetimes shrink to hours once 4.6 lands.
- **LAN peer** — nothing on the default loopback bind. Against a deliberately
  acknowledged `lan` bind over plaintext, a passive peer can read traffic and
  capture credentials (that is what the acknowledgement admits); an active peer
  with no credential still faces the scope system, the forward ticket gate,
  and the Host-header gate.
- **Compromised relay** — session takeover at token scope for sessions that
  use the relay. Channel binding keeps what it captures from being useful
  anywhere else, but it cannot stop the relay itself.
- **Malicious website** — no cross-origin reads (authenticated JSON routes do
  not emit permissive CORS), no cookies carrying host credentials, hardened
  image responses, ticket-gated port forwards, and the Host-header gate
  rejecting forged-host requests.

## Reporting

See `docs/REMOTE_ARCHITECTURE.md` and `docs/STANDALONE_SERVER.md` for the
security-relevant architecture. Security issues: open a private security
advisory via the project's GitHub Security tab rather than a public issue.
