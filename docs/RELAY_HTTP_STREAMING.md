# Relay HTTP streaming (protocol v3, additive)

Status: implemented 2026-09-12 (M2 order 3). Landed in the relay lane of the
V3 iteration; tests in `src/server/relay/relayHttpStreaming.test.ts`.

## Why

Before streaming, every relayed HTTP response was fully buffered on **both**
hops — the host read the entire origin body before sending one base64 `res`
frame, and the relay answered the visitor only after that frame arrived —
under a single whole-request deadline (`requestTimeoutMs`, default 60 s). Two
consequences: long-running responses (SSE-style endpoints, slow origins, large
downloads on constrained links) either exceeded the deadline or paid full
end-to-end latency before the visitor saw byte one, and a slow visitor could
not be isolated until the whole body was already in flight.

## Negotiated frames

Streaming is **capability-gated, additive within protocol v3** — no version
bump, per the compatibility discipline in `src/shared/remote/relayProtocol.ts`:

- The relay advertises `httpStreaming: true` in its `registered` reply. Older
  hosts strip the unknown field (their zod object schema is non-strict) and
  keep answering with the buffered single-`res` frame.
- A host that sees the capability answers a `req` with the streaming sequence
  instead of `res`:

| Frame       | Direction    | Meaning                                                                                                                                                               |
| ----------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `res-open`  | host → relay | Origin status + headers (+ `setCookies`) are ready; body slices follow. Sent exactly once per request.                                                                |
| `res-chunk` | host → relay | One base64 body slice, ≤ `RELAY_RES_CHUNK_BYTES` (256 KiB raw), pre-measured against the control frame limit before sending (the P1-7 discipline, applied per chunk). |
| `res-end`   | host → relay | Body finished. `error` set ⇒ the body failed **after** headers were already delivered.                                                                                |

Ordering is the control socket's own: frames from one host arrive in send
order, so slices reassemble in order by construction.

**Buffered fallback** is not a degraded mode — it is the unchanged v3 path:
an older relay never advertises `httpStreaming` (so it never receives these
frames), and an older host never sends them. `relayHttpStreaming.test.ts`
pins both pairings (the mixed-version compatibility suites pin the rest).

## Deadlines: idle-based while streaming

- **Before `res-open`** (headers not yet received): the whole-request
  deadline applies exactly as before — fire ⇒ pending entry dropped,
  visitor gets the deliberate 502 verdict ("Relay request timed out."),
  host gets `req-cancel`.
- **After `res-open`**: the deadline becomes an **idle deadline** — every
  `res-chunk` re-arms it (relay side in `rearmStreamingIdle`, host side by
  re-arming the local abort timer per sent slice). A slow-but-progressing
  response is never retired mid-stream; a stalled one unwinds within the same
  `requestTimeoutMs` on both hops. Pinned by "a progressing stream outlives
  the whole-request deadline" and "a stalled stream is retired by the idle
  deadline" in the streaming suite.

## Cancellation

- Visitor disconnects mid-stream: the relay's per-stream `close` watcher
  (guarded by `writableEnded`, so normal completion does not count) drops the
  pending entry and sends `req-cancel`; the host aborts its upstream fetch,
  and the origin sees its socket close. The request-path listener is detached
  when the response becomes streaming-owned, so exactly one watcher owns the
  exchange at any time.
- Relay idle deadline fires mid-stream: same unwind — response destroyed,
  entry dropped, `req-cancel` out, host aborts.
- Host's local idle deadline: aborts the origin fetch; the resulting error
  travels as `res-end { error }` once headers were sent (`req-error` before).

## Errors before vs. after headers

- **Before headers** (`req-error`, or the buffered-path verdicts): the visitor
  receives a real HTTP error — 502 with one of the deliberate transport
  verdict bodies, or 413 for over-limit frames.
- **After headers**: no status code can honestly describe a mid-body failure;
  the visitor connection is **reset** (`res.destroy()`), never answered with
  a fabricated status and never a clean `end`.

## Header and origin policy

The header rules are identical to the buffered path and applied at the same
places: the host strips `set-cookie` from the generic record (sent separately
via `setCookies`), and drops `content-encoding`/`content-length` (the body is
read decoded; framing is stale). The relay additionally strips
`content-length`/`transfer-encoding` from `res-open` headers — the streamed
body's framing belongs to the relay⇄visitor hop. Relay routing cookies are
stripped from requests as before; forward-origin dispatch and per-visitor
`clientId` admission (P1-8) apply unchanged to streaming requests.

## Bounded queues and slow-consumer backpressure

- **Host hop** (origin → control socket): the host reads the upstream body
  only as fast as the control socket accepts it — before each slice it waits
  (bounded, 20 ms polls up to 10 s) while the control socket's outbound
  buffer exceeds the soft-buffer bound; the per-slice pre-measure keeps any
  single frame inside the control limit, and a dead socket fails the send
  outright.
- **Relay hop** (control socket → visitor): the visitor response's own
  writable buffer is the queue. If it exceeds
  `RELAY_STREAM_MAX_BUFFERED_BYTES` (1 MiB) — a visitor that stopped reading —
  the response is destroyed and the host work canceled (slow-consumer
  isolation, mirroring the WS4 channel policy): one stalled visitor never
  buffers without bound and never harms the shared control link. The unwind
  path (destroy → req-cancel → control link healthy for the next visitor) is
  pinned end-to-end; the writable-length comparison itself is not
  end-to-end-pinnable on loopback (kernel auto-tuning absorbs any test-sized
  firehose before Node-side backpressure engages), so the bound is verified
  by review of the one-line comparison.

## Resource limits

Per-request: body total ≤ `maxBodyBytes` (host-enforced, aborted mid-stream
with `res-end { error }`), per-slice ≤ 256 KiB raw pre-measured, idle deadline
≤ `requestTimeoutMs` re-armed per chunk. Per-relay: the P1-8 admission caps
(16 pending per clientId, 256 global) count streaming requests for their
entire lifetime. The relay holds no body bytes of its own beyond the visitor
socket's writable buffer.

## Constrained-link testing (the 32 kbps class)

The streaming suite drives the constrained-link failure modes on real loopback
sockets: a slow-but-progressing origin (75 ms slices against a 250 ms deadline)
for the idle-reset rule, a stalled origin for retirement, a stopped-reading
visitor (firehose origin, > 1 MiB in flight) for isolation, and a gated
progressive-delivery proof (the origin only finishes after the visitor
observed the first slice — impossible for a buffered pipeline). The full
network-shaping matrix (rtt1500ms-32kbps profile) remains with the calibrated
native-E2E harness (`tests/native-e2e/constrainedNetwork.test.ts`), which now
exercises streaming end-to-end because the relay/host pair negotiates it by
default.
