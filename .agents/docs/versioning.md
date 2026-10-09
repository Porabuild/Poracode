# Versioned State & Protocols

ACP prompt consumption supports a provider-declared `per-call` mode alongside
its existing `cumulative` mode. The wire enum, usage event shape, SQLite tables,
remote protocol 12, and native readers already support both; no schema or
protocol bump is needed. New per-call prompt samples use opaque
`acp-prompt-v1:<scope>:<epoch>:<turn>` IDs. Existing cumulative baselines and
historical usage rows remain valid and are never rewritten; equal/decreasing
new per-call totals count fully and repeated sample IDs deduplicate. A real
SQLite pre-change-baseline regression covers that transition. Historical totals
produced by an incorrect earlier counter declaration cannot be reconstructed
from the derived delta rows alone. Prompt consumption can independently opt out
of context occupancy, leaving standard `usage_update` authoritative. Internal
notification hooks additionally carry optional live session/turn owners; these
are same-bundle callbacks, not serialized protocol fields. Content hashes
identify the changed producer and lifecycle behavior.
Crossagents plugin `1.9.0` adds optional `include_trace` to `get_status` and
single/batch `wait_for_agent`. The manifest also supplies the MCP server version.
Omitted/false keeps the previous response; compact reports, quiet/full/progress
reads and output cursors keep their existing meaning. Dispatch provenance is
copied into the existing memory-only resolved run plan; attempts reuse existing
outcomes and dispatch state. No database, settings, cache, remote-wire, helper or
compact-envelope version changes. Older stored settings and connected callers
remain valid; refresh the catalog/skill to discover the opt-in capability. Older
hosts do not advertise it. Trace expires under existing run retention and host
restart. Regression tests start with prior read shapes and cover privacy bounds,
saved/per-call policy sources, explicit empty chains, batch/cursor isolation,
workflow selection and winning-session continuation.

Codex resume requests use the existing optional `excludeTurns` protocol field
and a resume-only two-minute timeout. Saved transcripts and provider session IDs
remain valid; UI history is already persisted independently of this response.
Servers that explicitly reject `excludeTurns` retry the same thread with the
previous request shape. Ordinary RPC deadlines, IPC, caches, database schemas
and deployed helper formats stay unchanged, so no version bump is needed.
Regressions cover the old-server response, slow success, bounded timeout and
metadata-only resume for both reopening and context-window reloads.

Poracode keeps data and deployed artifacts across app upgrades. A change can work in a clean profile and still fail for existing users when an old cache, renderer store, helper, or plugin remains on disk. Treat every serialized or deployed boundary as an upgrade contract.

Reacquiring a runtime item-interest lease after a coverage gap rebuilds the
renderer transcript through its existing bounded history recovery and queue
arbitration. The cached hydration marker is window-local; persisted history,
wire contracts and cache formats remain valid. No boundary version changes.

Devin account/configuration profiles change derived auth, catalog and approval
semantics. Supervisor status-cache format 41 and renderer status-store version
37 intentionally invalidate the previous 40/36 rows. Usage cache format 9
invalidates version 8: cached quota now belongs to an opaque credential-source
fingerprint, and source changes retire cached and in-flight results. Regression
fixtures start from each previous version.

The optional session-action query/invoke names are additive. An older host
rejects the query by name; clients hide unsupported controls and only invoke
ids returned by the current session. Hop 16 and remote protocol 12 remain valid;
the procedure-map fingerprint and generated source/manifest hashes change
intentionally. Invocation is declared as a mutation in client-local transport
policy so a dispatched failure has an unknown outcome and is not retried.
That policy is excluded from published authorization/routing metadata.

`SessionRef.executionIdentity` is optional opaque provider-owned resume scope.
Existing native/default references remain valid. Previous published reference
schemas explicitly strip unknown fields, so they can read the new metadata;
profiles requiring scope validation refuse an unstamped resume instead of
attaching to another account. Current Swift/Kotlin bindings preserve the field,
including the iOS domain reference and Android's JSON projection. SQLite stores
complete reference JSON, so its schema and migration version stay unchanged.
Profile config and isolated account-root manifests introduce format 1; unknown
formats remain stored and unavailable. Per-launch hook/config files are private,
uniquely named and never reused across app versions. Content hashes identify the
changed runtime and renderer artifacts.

Agent-status readiness uses process-local publication ownership and detached
validated snapshots. Completed probes become readable before the complete sweep
finishes; superseded requests cannot publish events, overwrite accepted rows,
persist results or return their stale models. Initial registry setup preserves
the warm cache, while subsequent adapter input changes invalidate it. Complete
valid cache baselines keep their existing meaning; cold partial views report
`fromCache: false`, and partial sweeps are never written. Existing status rows,
capability derivation and serialized response shapes remain valid. Supervisor
status-cache format 40 and renderer status-store version 36 stay unchanged;
no IPC, remote protocol, helper or database migration is needed. New bundle
content hashes identify the changed lifecycle. Regressions start from the
existing cache shape and cover overlapping full/scoped/WSL requests,
invalidation, early native reads and caller/adapter mutation isolation.

Codex app-server request retirement changes only the connection-private pending
request index. Exact provider-resolved IDs and recorded thread ownership release
payloads before callbacks; an absent ownership mapping during startup is valid,
while a conflicting replacement owner is refused. Client answers require a held
request belonging to that channel; canonical string IDs still translate to the
original typed wire ID. Ordinary post-answer resolved notifications and valid
legacy replies keep their existing shapes. Persisted state, caches, IPC, protocol
types and deployed helper formats do not change, so no version bump or migration
is needed. Content-hashed supervisor/server bundles identify the new lifecycle
behavior; older complete artifacts remain valid with their prior behavior.
Before/after regressions cover startup, numeric zero, reentrancy, replacement,
sibling isolation, repeated retirement and late replies after transport closure.

Browser initial chat hydration can read a validated, owner-matched cached snapshot before host-derived reads. It retains the cached runtime cursor, image payloads, completed-turn window, context and latest goal through the existing hydration installer; host snapshots and resets remain authoritative. Provisional cached tasks retain their last-known status until a host update can reconcile them. Older valid rows without optional projection metadata use the exact owner-encoded view key and normalize metadata only in memory. Provisional notices seed only an absent notice entry and cannot replace current notice, gap or recovery state. Cache access has a five-second bound; a blocked or abandoned upgrade cannot hold hydration indefinitely, commit a late migration, or leak a late-opened connection. The row shape, version-2 database and `updatedAt` index remain unchanged. Valid version-1 rows still upgrade in place and hydrate; no wire, IPC, database-schema or cache-format bump is needed. Compatibility tests cover that old row, a held-open version-1 connection, late success, timeout, foreign/malformed snapshots and current/cancelled hydration ownership.

The optional LegendList `onContentSizeCommit` capability is a same-bundle
React/web layout notification, emitted after its DOM sizer commits the rendered
row-stack size. ESM/CJS React and React Native web mirrors plus all declaration
mirrors carry the option; native ESM/CJS consume it without forwarding or
invocation. The package remains pinned to 3.3.3 and the pnpm patch hash/lock
identity changes intentionally. Old callers without the option retain their
measurement, retirement and anchoring behavior. Persisted row hints, canonical
streams, database schema and wire/helper versions remain valid and unchanged.
Regression tests compare synchronous model publication with actual committed
DOM sizing, callback replacement and both measurement orders. The application
uses this commit signal in place of the early `totalSize` model subscription.

LegendList destruction also cancels and clears its queued anchor-recalculation
frame in all six JavaScript runtime mirrors. This is volatile same-bundle
ownership cleanup: mounted anchoring, public options, saved row hints and all
persisted/wire versions remain valid. The pinned 3.3.3 package's pnpm patch hash
and lock identity change intentionally. Actual-library regressions compare the
previous patched runtime's prefix/prepend unmount failures with cancellation
in the new runtime, while preserving mounted reader compensation.

Timeline measurement hints remain renderer-document-local and disposable. The
state-owned cache and component compatibility exports share one singleton with
the same key/index/size shape, layout signature and aggregate admission bounds.
Definitive thread/project/catalog retirement forgets hints; uncertain catalog
absence and ordinary pane close preserve them. A late detach cannot capture a
missing owner. No persisted or wire version changes; lifecycle and remount
regressions cover the existing cache contract.

The HeroUI stylesheet registry mirrors the pinned 3.2.4 import order and layers,
omitting the unused date/calendar family. Package upgrades require a registry
audit, and newly used widgets must register their style closure before rendering.
Compiled asset content hashes invalidate changed CSS; no serialized app state
changes. Ordered compiled-rule comparisons verify retained declarations and
layers, rather than assuming equivalent source imports produce equivalent CSS.

Local HTTP delivery of a relative renderer build adds the optional head marker
`poracode-build-asset-base=/` and roots only existing allowlisted script/link
asset URLs. `localClientHtml.ts` and `buildAssetBase.ts` mirror the marker; older
renderers ignore it and newer readers preserve Vite's base when it is absent,
invalid, hosted explicitly or delivered by file. Navigation links retain the
document base. Recognition is bounded to a complete valid UTF-8 head within
64 KiB; other documents keep the legacy bytes. HEAD and ranges describe the
transformed representation. Generated fallback workers adopt the existing
revalidation policy without changing their script/cache/message shapes. Old
whole graphs and stored state remain valid, so protocol/cache versions stay
unchanged. This does not make an already cached old document or an uncached
retired lazy asset available after replacement.

The chat block splitter omits Marked's unused queued inline pass while keeping
Streamdown's block grouping and the rendered remark/rehype pipeline. This is
volatile per-call computation with no retained cache or serialized shape.
`streamdown-marked` intentionally aliases exact Marked 17.0.6, separate from the
unrelated Marked 14 consumer; the pinned Streamdown 2.6.0 implementation is the
differential oracle. Upgrades of either boundary require block-array and actual
renderer parity checks. Larger heads keep the stock splitter. Content hashes
identify the changed bundle; saved canonical Markdown, database and wire
versions remain valid and unchanged.

Plain-text unary strong runs use private renderer format 1 to avoid recursive
Markdown and Fiber traversal while restoring every original formatting span.
The per-VFile relay uses a fresh source-absent marker, is consumed once after
raw HTML normalization, and erases its transport/count array before sanitize.
Flat run metadata preserves a marker/index/count binding through stock sanitize.
A scalar per-file receipt checks the post-sanitize component dispatch; receipt
and run bindings are erased before rendering. Authored tags and attributes are
not allowlisted.
Ordinary strong keeps Streamdown's stock component, and raw HTML/property
overrides stay on the existing path. The dedicated DOM owner disposes its
descendants bottom-up before replacement or unmount. The path autolinker uses
iterative DFS with the previous callback/mutation/error order. These are
volatile same-bundle computations, with no new retained cache, canonical or
wire shape. Database, history/cache and public/helper versions stay unchanged;
new bundle hashes identify the implementation. Upgrades of pinned Streamdown
2.6.0 must rerun exact span/sanitize/relay and full-render/lifecycle parity.

Deferred feature prewarming keeps its task cursor and active-run owner only in memory. Browser runs pause optional imports while offline and resume through the online event; cancellation releases listeners and an older import completion cannot release a newer owner. Local packaged imports retain their offline behavior. This changes neither persisted state nor cache records, IPC, public protocols or helper payloads. Content-hashed renderer builds identify the changed scheduling code; an older complete build remains valid with its original behavior.

ACP ranged text reads now scan UTF-8 incrementally and close the file after the requested lines. The existing unrestricted read and slicing contract remains unchanged, including CRLF normalization only for ranged reads, Unicode/invalid-byte decoding, trailing empty lines, path authority, missing-skill fallback and filesystem errors. This is per-request I/O with no retained cache or serialized state; ACP request/response shapes, capabilities and wire versions remain valid. New supervisor/server bundle hashes identify the implementation. Differential text/error/close checks and real child filesystem/dependent-workflow tests cover the boundary.

Payload-projection composition uses the same deterministic pure-leaf generator in tsdown, Vite, source-test Node loaders and synthetic CLI bundles. Node loaders emit file URL imports; Vite watches directories outside its imported-file bookkeeping and invalidates the module when projection leaves appear or disappear. The generator is tooling only: packaged readers retain their static projection array, provider ownership and payload-origin contracts. No persisted/cache/wire or independently deployed helper shape changes; previous complete artifacts remain valid. Source-fork, CLI lifecycle, Vite discovery and previous-generator differential checks cover these execution paths.

### Session references from failed starts

A configuration error after native session creation now retains that attempt's
exact `SessionRef` on the existing `thread-state` recovery update. The provider's
opaque execution binding is preserved before the unpublished handle is disposed;
private, thread-scoped error custody keeps concurrent attempts separate. Resume
availability still respects the adapter's declared support. No failed prompt is
repeated automatically. Renderer launch rejection preserves a host-confirmed
reference instead of clearing its recovery flag.

This uses already-versioned reference/state fields and their existing native
mirrors; no wire, database, status-cache or persisted error shape changes. Existing
unreferenced failed rows remain failed: migration must not guess an ID from native
session lists. Regression coverage verifies capture before disposal, original
error identity, reused error objects across owners, and renderer rejection order.

### Live session control inventories

Declared select-to-Fast bindings are private supervisor behavior, not serialized
configuration or a wire field. They retain the existing `ThreadConfig.fast`
boolean and `fast` inventory role, with exact native IDs preserved. Old stored
Fast choices retain their intent; ACP now applies them to the advertised speed
select instead of folding them into a model ID. CLI variant folding is unchanged.
Missing or changed carriers reject explicit enables before the prompt. Inventory
is session-owned and volatile, so no persisted inventory or detection cache is
reinterpreted. No protocol/store version change is required for this binding.
Regression coverage includes saved choices, unchanged model identity, missing
and retired selectors, strict CLI pair rejection, and exact native value echoes.

`Thread.sessionConfigOptions`, the matching `thread-state` field, and internal
`ThreadRuntimeSnapshot.agentKind`/`sessionConfigOptions` are additive, optional
runtime metadata. The normalized descriptor preserves exact native select IDs
and values; host-resolved roles identify existing composer controls. Absence
supports an older host, `null` retires the inventory, and `[]` records an observed
empty inventory. Model-scoped ladders apply only to the native current model;
pending picks of another model use that model's detection capabilities.

These choices belong to a live session incarnation, not the durable thread.
SQLite has no new column. Remote pulls project the current owner-fenced runtime
inventory instead of persisting it. Browser app-store and offline transcript
cache writes omit it; reads normalize any previously cached copy away while
retaining user config, transcript, cursors and context. Native catalogs retain
it only in memory. Provider switches and exits retire it.

Protocol 12 and internal IPC/hop 16 remain valid: old readers ignore the new
optional fields, new readers accept the pre-upgrade shape, and no existing
method or field changes meaning. All generated Swift/Kotlin/schema mirrors and
the native parity ledger must be regenerated together. App-store v5 and offline
DB v2 remain valid because the existing stored catalog/transcript format stays
readable; only non-authoritative live metadata is stripped on hydration. This
must be covered by old-shape decode, contaminated-cache read, retirement,
foreign-owner and pending-refresh race regressions. It is not a general rule
that optional fields never require a version bump.
Chrome sidebar extension 0.2.0 added independently negotiated bootstrap protocol 1;
extension 0.2.1 bumps it to 2 (see the hello handshake below).
The worker's `SIDEBAR_PROTOCOL_VERSION` mirrors
`CHROME_SIDEBAR_PROTOCOL_VERSION` in `src/shared/chromeSidebarProtocol.ts`;
changes to this boundary must update both. Existing CDP hello and command frames
retain their meaning. Old or unknown sidebar versions never receive credentials
and continue to relay CDP. The sidebar uses existing single-use local pairing,
OAuth, remote transport, renderer stores, and canonical history formats, so their
versions remain unchanged. Extension assets are installed as one complete MV3
package with content-hashed renderer chunks. Compatibility tests cover legacy
hello, unknown versions, strict direct-loopback origins, authenticated reads,
and rejection of reused credentials. The same-bundle browser bridge adds an
optional `hostSettingsWriteThrough` preference policy (default true); independent
sidebar clients declare false. This changes no wire or stored shape and keeps
ordinary browser clients' sync behavior. Regression tests cover both policies,
local view persistence, GUI-only selection, and a GUI server launch that neither
writes the desktop view nor focuses its renderer projection. Host-forwarded
starts default to the existing `focus: false` field alongside
`launchRuntime: false`; old clients already understand the non-focusing field,
so this is an existing wire value, not a new schema. Older command shapes remain
accepted; an explicit focus intent keeps its prior meaning, while normal client
selection stays local. Tests exercise the HTTP
forward and the desktop reducer with the prior focus contract.

Sidebar credentials require proof of extension identity. A per-user Chrome
native messaging host (`com.poracode.chrome_bridge`, host protocol 1, artifact
version `CHROME_NATIVE_HOST_ARTIFACT_VERSION` 1 in
`src/host/browser/external/chromeNativeHost.ts`) is generated and re-registered
on every production start (packaged desktop, non-dev CLI);
`chromeNativeHostEnabled` keeps unpacked dev, worktree and smoke runs from
rewriting the shared launcher unless `PORACODE_CHROME_NATIVE_HOST=1` opts them in
(`0` opts any run out). Its script, launcher, manifest and bridge entries live in
`~/.poracode-chrome-bridge`; entries are `{version, port, token, pid}`, removed
on shutdown, ignored once their pid is dead or owned by another OS user
(`EPERM`), and deleted at the next registration when dead, whatever their
version. The launcher clears `NODE_OPTIONS` and escapes `%` on Windows. The
entry shape is the cross-version contract: the script only reads entries whose
`version` equals its own artifact version, so a future artifact bump must keep
reading v1 entries or bump with a migration; a v1 launcher never sees newer
entries. The worker mirrors the host name and protocol version.

The hello handshake proves the token both ways without sending it. The worker
sends a fresh 32-byte `nonce` and `clientProof` = HMAC-SHA256(token,
client-domain, dialed port, nonce); the bridge verifies it in constant time
against its own listener port and answers a proven hello with `serverProof` =
HMAC-SHA256(token, server-domain, port, nonce, ack version, authenticated).
Domains and field order live in `src/shared/chromeSidebarProtocol.ts` and are
mirrored in `chrome-extension/background.js` (asserted by
`scripts/chrome-extension-worker.test.mjs`). The worker requests credentials
and serves any tab or CDP request only after verifying `serverProof`; an
unproven ack is advisory (it may trigger the bounded native retry) and an app
without an ack gets no browser control from this worker. Extension 0.2.0
(sidebar protocol 1, raw `hello.bridgeToken`) is already loaded in real
browsers, so the handshake change is a version bump, not an in-place edit:
sidebar protocol 1 → 2 (`CHROME_SIDEBAR_PROTOCOL_VERSION` and the worker
mirror) and manifest 0.2.0 → 0.2.1 with a dated CHANGELOG security entry. The
bridge negotiates only protocol 2 and ignores `bridgeToken`, so a 0.2.0 worker
gets `sidebarBootstrapVersion: null`, `authenticated: false`, no `serverProof`
and no reply to version-1 `sidebarBootstrap` requests; it keeps the
origin-pinned CDP relay like 0.1 (pre-upgrade regression in
`ChromeBridgeServer.sidebar.test.ts`). Native host protocol 1 and artifact 1
are unchanged because their request, response and entry shapes are unchanged.
The manual/debug `?token=` query stays host-side only and the worker no longer
reads a stored token. The 0.1 relay (no proof, no ack handling) keeps working by
pinned origin. The bridge mints only for proof-authenticated pinned
origins, replies `null` to unauthenticated, over-queue or over-rate requests,
and uncapped issuance is gone. Port choice is worker-local: only the native
host's authenticated list picks a port (the dialed port's own entry, else the
newest), never an ack; an unknown port is closed before any frame and each
secret is redialed at most once. `getManagedLoopbackBootstrap` gains an additive
same-bundle `browserExtension` flag. It refuses before issuing when the
endpoint is not plain-http loopback, and uses a 60-second pairing TTL. Pinned
extension IDs (`CHROME_SIDEBAR_EXTENSION_IDS`) gate the WebSocket upgrade, CORS
and `allowed_origins` together; `PORACODE_CHROME_EXTENSION_IDS` adds development
IDs. Changing the manifest `key` or adding the Web Store ID must update that
constant, and the next start rewrites every registered manifest. Older artifact
versions are rewritten on start and stale entries are ignored. Tests cover forged,
other-extension, no-proof, wrong-secret, tampered, wrong-port and raw-token
hellos and displacement; worker impostor acks (bare, tampered, relayed,
reflected, wrong-nonce, stale-secret); real stdio framing, ordering, pruning and
`NODE_OPTIONS`; a real worker ↔ native host ↔ bridge handshake
(`chromeBridgeHandshake.test.ts`); and, in an untracked isolated e2e, Chrome
enforcing `allowed_origins` against the Electron-as-Node launcher.

Chrome sidebar bootstrap protocol 2 (protocol 1 in 0.2.0) includes an additive `helloAck` reporting the host sidebar version and connection authentication. The new worker waits for this acknowledgement before requesting credentials; an older host without it yields a localized upgrade hint rather than an endless generic connection error. Existing relay workers ignore the unsolicited acknowledgement, and old or unknown sidebar versions receive no credentials. Native host protocol and generated artifact version remain 1. A current host with a temporarily unavailable native helper stays distinguishable from an old host; bounded retries (sidebar or host request, at most every 10 s, never for a secret that already failed) redial the port the native host knows (this one first) with a fresh in-memory token. Worker/host constant mirrors, legacy and mismatched acknowledgements, delayed helper availability, retry bounds and token non-persistence are covered by regressions. Store release preflight verifies that the manifest public key produces the configured store identity before any tag is pushed.

## Required check for every change

Bounded older-history pages apply the same existing image-reference projection as the history tail and snapshots. Canonical image bytes, item order, continuation positions, refusal budgets and authenticated resolution remain unchanged. This repairs response composition without adding fields or changing the established image-reference contract; persisted schemas and protocol versions remain valid. Serialized response hashes and build identities identify the corrected output. The regression checks tail/page parity, bounded response size, preserved canonical bytes and image resolution.

The source editor loads the installed Monaco runtime and its matching workers
from the content-hashed renderer asset graph, through a lazy source-editor
boundary. It replaces the wrapper's independently versioned CDN default.
Persisted file text, editor buffers, database and wire formats remain valid;
no schema/protocol bump is needed. Renderer build hashes invalidate old worker
graphs through the existing service-worker build identity. Qualify nested
routes and editor worker requests against the complete selected build.

Monaco is pinned to `0.56.0` with the lockfile-hashed
`patches/monaco-editor@0.56.0.patch`. The shared CSS/HTML/JSON completion
adapter discards cancelled or disposed-model requests before worker acquisition,
before dispatch, and before consuming a late result. ESM, development and
minified runtime copies carry the same guard. Live completion mappings and
genuine errors retain their existing behavior; models are not retained to hide
the disposal race. Dependency upgrades must requalify these three copies and
the actual-adapter lifecycle tests. This is a runtime fix within the existing
content-hashed graph, not a persisted-state or wire-format change.

Before finishing work that changes data produced or consumed across process restarts, app versions, processes, machines, or independently updated components:

1. Identify every writer, reader, persisted copy, mirrored cache, and deployed copy of the changed shape or behavior.
2. Decide explicitly whether old data/artifacts are still valid. Do not assume optional TypeScript fields make derived data semantically current.
3. If old data is valid, keep the version and add backward-compatible parsing where needed.
4. If old data can be migrated without loss, bump the version and add an ordered migration.
5. If it is derived or disposable, bump the version and invalidate it so it is recomputed.
6. If it crosses a wire or deployed-component boundary, update compatibility ranges and every producer/consumer together. Preserve older versions when practical.
7. Add a regression test starting from the previous released version/shape. A clean-profile test is not enough.
8. Search for duplicated or mirrored versions before stopping:

   ```sh
   rg -n --hidden --glob '!node_modules' --glob '!dist' --glob '!out' \
     '(SCHEMA_VERSION|CACHE_VERSION|PROTOCOL_VERSION|STORE_VERSION|MANIFEST_VERSION|BRIDGE_VERSION|version: [0-9]+|schemaVersion)'
   ```

Version bumps are required by compatibility, not by every code edit. Record the reason beside the version or migration so the next agent can make the same decision correctly.

Canonical producer admission is a separate private IPC boundary:
`src/shared/canonicalAdmissionProtocol.ts` owns `CANONICAL_ADMISSION_VERSION = 2`.
Host support is capability-gated by `canonicalAdmissionVersions`; released
flow-control1 peers keep their original window/custody ACK semantics. Private
quote/delivery/release messages are intercepted before public supervisor-event
publication. Admission2 is not yet advertised by the supervisor: sender/source
backpressure and unchanged large-image qualification are required before
activation. No database, public remote wire or procedure-map version changes
are needed for this separately negotiated host-only stage. Pre-admission2
capability shapes and replacement-owner fencing are covered by the protocol
and `SupervisorClient.admission` regression suites.

ACP inbound framing now has a per-frame raw-byte limit of 8 MiB + 64 KiB
(`sessionInboundStream.ts`). The JSON-RPC wire shape remains unchanged;
previous valid notifications, replies, startup noise, and parse-error replies
are covered against the released filter/SDK path. Fragment assembly uses fixed
16 KiB blocks. This limit does not bound aggregate decoded objects, outstanding
SDK handlers, or provider-process memory, and does not activate source
backpressure or canonical admission2.

The pinned ACP SDK 1.4.0 patch adds the optional public dispatch observer and
readonly `ClientSideConnection.dispatchObserverVersion = 1`. Two-argument
callers retain released behavior; regression tests compare the pristine SDK.
Any future source gate requiring settlement must check this marker before
activation: an old SDK silently ignores the extra argument. The SDK is bundled
by the shared tsdown dependency policy into desktop, standalone server, and SSH
supervisor artifacts, because npm-staged externals do not apply pnpm patches.
Old deployed helpers remain flow1 peers with no source capability advertised;
no database, remote wire, or procedure-map bump is required at this stage.

Managed desktop image resolution is a renderer custody change. Host-held image
references already reach the desktop over its HTTP/WS loopback data plane;
canonical SQLite payloads and the reference/ticket wire shape stay unchanged.
Chat and galleries must use the same authenticated routing activation client
and bounded image cache, with explicit readiness and no global resolver or
inline restoration. Native inline history remains valid. Client-host hop 16,
host transport 2, and remote protocol 12 therefore stay unchanged.

The image session and gallery authority identity are volatile same-bundle
state, never persisted clients, credentials, or blob URLs. Loss, replacement,
and backend reset retire old cache work and invalidate ready galleries. A
supervisor-only reset does not guarantee a socket replacement: fence old work
and renew image custody on the still-live authenticated activation when present.
Browser, attached, direct/SSH, and environment-child owners keep their separate
resolution and credential lifecycles; malformed remote ownership must not fall
back to the managed root. Regression checks must include unchanged inline/ref
payloads, ready/pending replacement, and reset without a reconnect.

Markdown image parsing now retains sanitized canonical paths; the live image
consumer resolves them through its current pane authority and existing keyed
readiness. Processor caches no longer capture a client or materialize its
display URL. This is volatile renderer state: canonical Markdown, image
endpoints, tickets, cache limits and persisted formats remain unchanged. New
bundle content hashes invalidate the old parser implementation; no protocol,
database or cache version bump is required. Owner loss must stay pending rather
than select another host. Regression checks cover unchanged text, shared
processors, late old-owner results, card identity and loaded-resource identity.

Host image previews are optional, volatile derived metadata. Their ready cache
retains at most 512 entries and 1 MiB of UTF-8 keys/previews; queued and active
work together retain at most 32 jobs and 8 MiB of encoded sources/keys. Generator
replacement and reset invalidate queued work and late results by generation;
active work keeps its charge until settlement. These are logical retention
limits, not decoded-pixel, native-memory, or process-RSS limits. Rejected preview
work leaves canonical image bytes and reference endpoints available. No persisted
cache, wire shape, or helper capability changes, so no version bump is required.

Single-item database reads now optionally accept `includeStreams: false` for
payload/metadata consumers, including image endpoints. The same-bundle option
selects no stored stream text and assembles no appended stream tails. Existing
two-argument callers retain full reads, and committed-only/fenced consistency
remains unchanged. Previous stored rows and streams remain valid and untouched;
projection and subsequent full-read regression tests cover them. SQLite schema
52, client-host hop 16, host transport 2, and remote protocol 12 stay unchanged.

Crossagent result reads assemble combined fallback transcripts only when the
requested projection needs them. Ordinary current output, nonzero cursors,
quiet reads and full current-attempt reads keep their existing output/cursor
semantics without an unused history copy. No transcript, retention lifetime,
compact report, serialized result or helper capability changes; boundary
versions stay unchanged. Previous-reader parity covers all five history/read
modes, and process-backed ingress tests separately exercise child retirement,
session continuation, workflow ordering, report blocking and forwarded requests.

Delegated attempts now retain a separate resource-custody generation across
bounded caller joins. Pending acquisition/cleanup continues after a deadline;
only confirmed disposal or exit releases its captured lease. Late confirmation
wakes the parent scheduler and prunes eligible records, while failed workflow
write locks still require the existing explicit successful cancellation. Shared
disposal custody distinguishes rejection from fulfillment independently of the
error payload, including `undefined` rejection. These are same-process lifecycle
changes: execution-slot identity, serialized run results and wire/helper shapes
stay unchanged. Phase-gated regressions and an owned SIGTERM-resistant one-shot
process verify unconfirmed capacity retention and eventual exit release.

Pipe one-shot stderr retains a bounded diagnostic suffix plus a batching window:
2,000 visible UTF-16 units, fewer than 32,768 pending decoded units, and at most
32,768 retained fragments. This preserves the previous 2,000-unit final trimmed
diagnostic and leaves stdout/PTY combined output intact. Non-status forwarded
items retain ancestry without payload references that their completion event
never uses. No canonical transcript, result or persisted shape changes; logical
retention bounds are not process/private-memory limits.

Renderer workflow caches remain volatile. After the last detail subscriber,
reconstructible chats are removed; inactive warm summaries have 32-entry and
1 MiB estimated-charge limits. Active views keep their evidence, and details
refetch on remount. Source/poller identity fences late replies. Timestamp-free
running snapshots now use the existing three-hour registration-age fallback;
reported fresh activity keeps the previous liveness rules. Optional timestamp
and full-chat wire shapes stay valid, so no schema or protocol bump is needed.

The v2 review remediation advances the SQLite registry to 51, the in-process
host transport interface to 2 (request routing no longer implies event custody),
and the deployed WSL bridge to 2.18.0 (filesystem-resolved project containment).
Previous-version migration/refusal/replacement tests cover each boundary. Remote
payload schemas and persisted settings remain compatible; their versions stay unchanged.

## Persisted data and caches

| Boundary                                      | Version location                                                                                                                                                                                                                                                                                                                                                                                                                                  | What must trigger a review                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLite application database                   | `src/host/db/migrations.ts` (`DATABASE_MIGRATIONS`, `LATEST_SCHEMA_VERSION`, currently 56)                                                                                                                                                                                                                                                                                                                                                        | Any table, column, index, constraint, stored JSON meaning, or data repair. Append a migration; never rewrite published history. Migrations 49–51 are forward-only: 49 adds history notice/episode semantics; 50 rejoins divergent schema-42 lineages; 51 fences unresolved legacy relative rollback plans as ambiguous before they can be retried. Existing wire phase values remain compatible.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Runtime durable canonical-gap evidence        | `src/host/db/migrations.ts` (migrations 48 and 49, `forward-only`), `src/host/db/runtimeDurableGap.ts`, `src/host/db/runtimeHistoryNotice.ts` (`runtime_persistence_epoch`, `thread_runtime_gaps.episode_id`, `thread_runtime_epoch_touches`, `thread_runtime_gap_notices`)                                                                                                                                                                       | Boot epoch/arm protocol, touch-before-accept ordering, contamination reasons, episode identity, acknowledgement/notice semantics, and close/rebase clearing rules. A pre-49 database fails validate mode until migrated once. Test validate-before refusal, validate-after success, existing-gap UUID backfill, reopen preservation, and delete/reuse invalidation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Runtime history-gap acknowledgement token     | `src/shared/runtimeHistoryNotice.ts` (`gap2:` generation)                                                                                                                                                                                                                                                                                                                                                                                         | Tokens are opaque and version-prefixed. Reject unknown or malformed tokens. An identity-format revision mints a new prefix; do not reinterpret existing tokens or use timestamps as unique episode identity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Supervisor agent-status cache                 | `src/supervisor/runtime/agentStatusService.ts` (`STATUS_CACHE_VERSION`)                                                                                                                                                                                                                                                                                                                                                                           | Any `AgentStatus`, capability, auth, runtime-routing, detection, or derived provider result that can make a cached status stale.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Renderer agent-status cache                   | `src/renderer/state/agentStatusesStore.ts` (Zustand `version`)                                                                                                                                                                                                                                                                                                                                                                                    | The same changes as the supervisor status cache. This is a second persisted copy; audit and usually bump both together.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Provider usage cache                          | `src/supervisor/runtime/usageService.ts` (`USAGE_CACHE_VERSION`)                                                                                                                                                                                                                                                                                                                                                                                  | Snapshot shape or changed semantics of a cached usage result.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Claude fast-mode cache                        | `src/supervisor/agents/claude/fastModeCacheCore.ts` (`CACHE_VERSION`)                                                                                                                                                                                                                                                                                                                                                                             | Account keying or availability semantics/shape.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ACP registry icon index                       | `src/supervisor/agents/acpRegistryIcons.ts` (`ICON_INDEX_VERSION`)                                                                                                                                                                                                                                                                                                                                                                                | Index shape, filename derivation, normalization, or cache-validity rules.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Durable package-install pins                  | `src/supervisor/runtime/packageInstallPin.ts` (`PACKAGE_INSTALL_PIN_FILE_VERSION`), path in `src/shared/poracodePaths.ts` (`packageInstallPinsPath`), per-provider slot claim under `src/supervisor/agents/<provider>/` (Cursor: `sdkInstallPin.ts`)                                                                                                                                                                                              | Record shape, slot-keying, or the rule for when a recorded root is trusted versus re-derived. A mismatch is discarded, never migrated: every pin is recoverable by one successful discovery pass, so losing the memory must cost a probe and never an installation. Write only when a slot's meaning changes; readers must keep treating an unreadable or unknown-generation file as "nothing recorded".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ACP registry extracted-artifact layout        | `src/supervisor/agents/acpRegistryInstallDir.ts` (`ACP_REGISTRY_INSTALL_LAYOUT_VERSION`)                                                                                                                                                                                                                                                                                                                                                          | Anything that makes an already-extracted `acp-registry/<id>/<version>/bin` install invalid (mode bits, file placement). Teach `repairAcpRegistryInstallLayouts` the previous generation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Managed skill manifest                        | `src/supervisor/skills/SkillsService.ts` (`SkillManifest.version` and `.poracode-skill.json` parsing/writes)                                                                                                                                                                                                                                                                                                                                      | Manifest fields, projection/copy semantics, hashing, or ownership rules.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Keybindings file                              | `src/shared/keybindings.ts` (`keybindingsFileSchema.version`) and `src/main/keybindingsFile.ts`                                                                                                                                                                                                                                                                                                                                                   | File shape, command identity, or default-binding migrations. Keep renderer writers in `src/renderer/commands/keybindingStore.ts` aligned.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Legacy Lightcode import marker                | `src/host/legacyDataMigration.ts` (`MIGRATION_VERSION`, marker/request filenames)                                                                                                                                                                                                                                                                                                                                                                 | Import scope or behavior that must run again for already-migrated users.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Experiment persisted store                    | `src/shared/contracts/experiment.ts` (`EXPERIMENT_STORE_VERSION`)                                                                                                                                                                                                                                                                                                                                                                                 | Experiment schema/meaning. Keep `src/renderer/state/experimentStore.ts` (memory-only projection), the host authority writer (`src/host/db/experimentStore.ts`/`src/host/db/experimentIntents.ts`), and remote experiment ownership aligned. The legacy renderer→main `dbPersistExperimentState` mirror (which wrote this key from `src/host/db/sync.ts`) was removed at hop 16 — the host authority is the only store writer and `EXPERIMENT_STORE_VERSION` stays 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Main renderer app store                       | `src/renderer/state/appStore.ts` (Zustand `version`)                                                                                                                                                                                                                                                                                                                                                                                              | Persisted projects, threads, view, or group-layout shape/semantics. Keep `src/renderer/state/dbStorage.ts` fallback reconstruction aligned.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Other renderer stores                         | `src/renderer/state/threadTodoDockStore.ts`, `sidebarUiStore.ts`, and `workspaceStore.ts` (Zustand `version`)                                                                                                                                                                                                                                                                                                                                     | Any field included by `partialize`, its meaning, defaults, or storage location. Add a `migrate` function when retaining data.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Panel persist slice                           | `src/renderer/state/panelPersist.ts` (`PANEL_PERSIST_VERSION`), key `poracode-panel`                                                                                                                                                                                                                                                                                                                                                              | Persist shape or meaning of git-review context, browser drawer width, right-panel thread lock, rail offset, or thread list sort/layout. v1 one-time-locks unversioned 1.8.x slices that stored the old unlocked default; later unlocks stay.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Remote-server renderer store                  | `src/renderer/state/remoteServersStore.ts` (Zustand persist `version: 2`)                                                                                                                                                                                                                                                                                                                                                                         | Durable server identity, token, projected projects, or `partialize` shape. v2 makes `connectionId` the per-connection key; v1 documents migrate by `connectionId = desktopId` (byte-identical records), and `migrateRemoteServersPersistedState` passes any version ≥2 through by reference so unknown future fields survive. Managed-parent integration adds the additive `managedHostDesktopId` discriminator to environment transports at the SAME version 2: no accepted field changes meaning, an older reader looks up `findServer(undefined)` and fails closed (no parent, no addressable grant), and a downgrade round trip preserves every field. Both/neither/empty discriminator variants are refused before any dial.                                                                                                                                                                                                                                                                             |
| Renderer refresh-token subjects (vault roots) | `src/renderer/state/remoteServers/refreshTokens.ts` (`RefreshSubject` kinds; `refreshSubjectVaultKey`) with the shared record in `tokenVault.ts` (database `lightcode-mobile-vault`, store `entries`)                                                                                                                                                                                                                                             | Credential-grade custody roots: `connection` → `refresh.<connectionId>` (v1 bytes unchanged); remote-environment grant → `environmentRefresh.<parentConnectionId>.<environmentId>`; managed-environment grant → `managedEnvironment.<hostDesktopId>.<environmentId>`. Both environment roots sit outside `refresh.`, so no arbitrary direct id can address them and an older reader's `refresh.` delete/sweep cannot purge them. The pre-correction `refresh.environment.<parent>.<envId>` slot is migrated only when unambiguous (never when a direct record addresses the same slot); the legacy slot is deleted only after a strict successful write of the new root. Ownership fencing + per-slot write serialization keep delayed rotations from resurrecting a removed grant or overwriting a newly paired one. Tests: `refreshTokens.test.ts` (roots, strict write failure, ambiguous/unambiguous migration, old-reader sweep), `managedParentSessions.test.ts`, `desktopLoopbackUnification.test.ts`. |
| iOS native multi-host catalog                 | `ios/App/App/Models/HostRecord.swift` (`HostRegistryDocument.formatVersion`), `Storage/HostRegistryStore.swift` (`directoryName`, `fileName`), `Storage/HostVault.swift` (`service`, `accountPrefix`, `journalAccount`), `Storage/HostTransactionJournal.swift` (`currentVersion`), and `Storage/LegacyHostImport.swift` (`Receipt.currentVersion`, `Tombstone.currentVersion`)                                                                   | Registry schema, host identity/LRU semantics, Keychain service or account derivation, token encoding, journal record/stage/recovery semantics, or legacy-source fingerprint/import rules. Registry format 2 is stored at Application Support `Poracode/hosts/registry.json`; secrets and journal v3 use the dedicated `com.lightcodeapp.mobile.remote.hosts` Keychain service. Journal v1 and v2 are explicitly migrated during decode. Review registry, vault, journal, import receipts/tombstones, recovery, and upgrade tests as one boundary.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| iOS project sync preferences                  | `ios/App/App/Storage/ProjectSyncPreferences.swift` (`documentVersion`, stable `storageKey`)                                                                                                                                                                                                                                                                                                                                                       | Per-device project exclusion shape or host/project identity semantics. The versioned document is stored in `UserDefaults`; preserve unknown future documents and cover the absent pre-feature state in upgrade tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| iOS AI content language preference            | `ios/App/App/Features/Settings/UI/AIContentLanguagePreference.swift` (`storageKey`)                                                                                                                                                                                                                                                                                                                                                               | The key suffix versions the device-local scalar vocabulary used to prefill commit-message and PR-summary generation requests. Adding, removing, or reinterpreting values requires a new key plus an explicit migration; unknown installed values resolve to `match-app`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| iOS chat text-size preference                 | `ios/App/App/AppTheme.swift` (`PoracodeChatTextSize.storageKey`)                                                                                                                                                                                                                                                                                                                                                                                  | The versioned device-local scalar mirrors the compact PWA's 8...20 range but maps it to native Dynamic Type-aware body, command, and metadata baselines. Changing the range, default, or mapping semantics requires a new key or an explicit migration with an upgrade regression test.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| iOS terminal text-size preferences            | `ios/App/App/Features/Terminal/TerminalTextSurface.swift` (`PoracodeTerminalTextSize.storageKey`, `projectStorageKey`)                                                                                                                                                                                                                                                                                                                            | Versioned device-local scalars independently drive agent-terminal and project-shell rendering plus PTY viewport geometry. The project key falls back to the legacy shared/agent value when absent so upgrades retain their prior size. Changing either role, range, default, fallback, scaling semantics, or cell metrics requires a new key or an explicit migration plus resize regression coverage.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Android native multi-host catalog             | `android/app/src/main/kotlin/com/poracode/app/model/HostModels.kt` (`HostRegistryDocument.FORMAT_VERSION`), `storage/HostRegistryStore.kt` (`DIRECTORY_NAME`, `FILE_NAME`), `storage/HostVault.kt` (`JOURNAL_ACCOUNT`, `account` and vault envelope), `storage/HostTransactionJournal.kt` (`VERSION`), `storage/LegacyHostImport.kt` (receipt/tombstone filenames and `VERSION`), and `security/AccessTokenCipher.kt` (`HOST_VAULT_ALIAS_PREFIX`) | Registry schema, host identity/LRU semantics, no-backup file locations, vault account/file/envelope or Keystore alias derivation, journal record/phase/recovery semantics, or legacy-source fingerprint/import rules. Registry format 2 is `hosts/registry.json`; vault envelopes, receipts, and tombstones are version 1; the journal is version 2 and explicitly accepts version 1 records. Review registry, encrypted vault files, per-account Keystore keys, journal, import artifacts, recovery, and upgrade tests as one boundary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Native push registration store                | `src/host/remote/push/PushRegistrationStore.ts` (`PUSH_REGISTRATIONS_FILE_FORMAT_VERSION`)                                                                                                                                                                                                                                                                                                                                                        | Registration identity/keying, token ownership, routing metadata, or native alert preferences. Format 2 reads both the unversioned legacy `{ registrations }` file and format 1, then writes device-owned sound/status filters on the next mutation; routed records remain keyed by normalized `clientConnectionId`. Unknown future formats are never overwritten. Keep the remote push-registration schema, native clients, and hosted gateway payload consumers aligned.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| iOS push unregister outbox                    | `ios/App/App/Features/Notifications/PushUnregisterOutbox.swift` (`Document.version`, `Document.legacyVersion`, `account`, `expiry`)                                                                                                                                                                                                                                                                                                               | Entry shape, parent-authority custody semantics, Keychain account/service derivation, or expiry policy. The document stays in the existing `push-unregister-outbox-v1` Keychain account (service `com.lightcodeapp.mobile.notifications`) and is now document version 2: a v1-only reader sees an unsupported version and preserves the raw document instead of re-encoding an entry without its parent authority (erasing custody) or dispatching it and deleting it as a "child" rejection. v1 documents are read and upgraded durably in place before any caller relies on v2 semantics; a failed migration write preserves the v1 source and fails closed, and unknown future or malformed documents are preserved, never overwritten. Direct entries and their createdAt/expiry semantics are unchanged, and an endpoint-bound capture written by the unreleased v1 candidate survives the upgrade. Tests: `PushStorageTests`.                                                                           |
| Settings documents and other JSON stores      | `src/shared/settings.ts`, `src/host/sharedSettingsFile.ts`, remote auth/identity/push stores, MCP OAuth, and usage secrets                                                                                                                                                                                                                                                                                                                        | These normalize or validate instead of carrying a version. Any incompatible change still requires an explicit migration, tolerant parser, or introduction of a version field plus legacy handling. `hostResourceAdmission` (resource admission PHASE1) is additive: no `$poracodeSettingsVersion` bump; old readers preserve the bytes and treat absence as the transitional unlimited default; a present invalid value is refused, never repaired to unlimited; the supervisor resolves the raw field through the same single settings cache, keeps the last known valid policy across transient read/parse failures, and fails closed (refuses new counted starts) only when no valid policy was ever observed.                                                                                                                                                                                                                                                                                             |

The prepared settings authority in `src/backend/settings/` introduces a flat
`$poracodeSettingsVersion: 1` marker. Absence is legacy generation 0; malformed
or future markers and corrupt known values are refused without rewriting the
file. Existing migrations run over validated values while retaining unknown
fields and ciphertext on disk. The first authority commit persists that
canonical document and adds the marker. Public snapshots omit unknown fields.

**Activation status (Gates 2–3 batch 1, lane 1B):** one `SettingsAuthority` per
composition is now the only settings writer for its process. The desktop
backend (`BackendSettingsService.createBackendSettingsAccess`) and the headless
composition (`src/server/headlessSettingsAuthority.ts`) both open the authority
against the leased root; `setSharedSettings`, the app-controls settings write,
the remote `POST /api/settings` patch, and the durable routing edits commit
through it as scoped compare-and-swap edits. Whole-snapshot compat writes are
diffed against the committed state with `mergeManagedSharedSettings` pinning,
so an old renderer or tool payload can no longer clobber another writer's
fields; a same-subject race loses after the bounded rebase
(`SETTINGS_WRITE_REBASE_ATTEMPTS`) instead of overwriting whole-document.
Desktop lease custody is a process-lifetime adapter until the
HostOwnerController unification (Gate 2.5); its credential-persistence guard is
therefore an explicit always-persistent assertion, while the headless
composition passes the real `assertCanPersistSecrets` capability, completing
the settings half of the HOST_OWNERSHIP.md writer obligation.

**Frozen-out writer, integrated at the correction pass:** the desktop remote
access controller was still patching `settings.json` directly
(`DesktopRemoteAccessController.ts` `writeSharedSettingsPatch` /
`writeRemoteAccessEnabledSetting`) when the batch freeze landed mid-batch, so
an authority commit and a remote-access toggle were last-writer-wins between
two writers instead of one custody chain. That interim state is closed: the
controller's remote `POST /api/settings` patch and the remote-access toggles
(`remoteAccessEnabled`, `remoteAccessTailscaleHttps`,
`remoteAccessAdvertisedUrl`) now commit through the composition's
`settingsWrites.commitCompatPatch` / `editSettingsField` scoped compare-and-swap
edits, so every desktop writer shares one authority chain.

**Supervisor-owned writers:** the supervisor process wrote whole normalized
documents straight to `settings.json` for ACP registry records (install,
update, auto-install, removal, auth env, auth acknowledgement, icon
localization, layout repair, alias-migration persist) and CLI hook verdicts
(`agentHookSupport`). That dropped the document marker and unknown fields, so
the authority's write admission (correctly) refused every later commit —
observed live as a second profile create failing with
`settings.dataNotPrepared`. Those writers now diff their read against their
next state into subject edits (`SettingsOwnerEdit`, per entry / per agent
setting) and send them as the
additive supervisor event `settings-edits-requested`; the backend commits them
through `SettingsCompatWriter.commitOwnerEdits` (fresh revisions, bounded
rebase, subject-scoped authorization) and answers with the additive supervisor
procedure `confirmSupervisorSettingsEdits` (procedure-map fingerprint moved,
hop unchanged). Registry writers diff the _stored_ view (secrets as on disk,
never the decrypted execution view), so an unchanged credential — including
one the supervisor cannot decrypt — crosses byte-for-byte and a metadata edit
needs no credential capability; only a deliberately replaced value is sealed,
and a deliberate removal is an absent key. Layout repair diffs against the
view it was derived from, so entries changed meanwhile are not edited. An
empty edit list is an admission probe sent before each first effect: downloads
and install-dir deletion, stopping an agent's live threads on removal, icon
downloads, and WSL layout repair — so an outside/future document is refused
before those effects. A probe is not a lock; the commit rechecks. No document
shape changed, so `$poracodeSettingsVersion` stays 2. Mixed pairs: a new
supervisor against an older backend gets no confirmation and fails the write
loudly after its timeout (no file write); an older supervisor still writes
directly, and the authority refuses only its later commits — not before its
own downloads or deletions. Supervisor and backend ship in one bundle; that
co-packaging, not a capability exchange, is what keeps the pair consistent.

**Device-local (client-only) preferences are declared out of the shared
authority on purpose:** keybindings (`src/shared/keybindings.ts` /
`src/main/keybindingsFile.ts`), login-item and OS-global-shortcut state
(Electron main, per device), and the reserved `R.client-v1` Electron device
root are per-device files that never ride `settings.json` or the settings
transaction protocol. They have no revisions, no authority, and no remote
sync contract; moving any of them into shared settings would be a new
versioned feature, not a default.

`src/shared/settingsTransactions.ts` defines transaction vocabulary version 1
and subject content revisions prefixed `s1:`. Revisions express content equality,
not event ordering; an authority UUID invalidates revisions across owner
lifetimes. A volatile commit sequence orders snapshots/deltas and advances with
the cache after rename. Entry replies include containing-field revisions without
copying those field values; whole-field changes refresh affected entry revisions.
Clients bind callbacks and one-use read tokens to a connection generation. A
sequence gap sets a required publication floor: a refresh must cover the highest
observed sequence before it can replace client state. Insufficient refreshes
explicitly request another read; authority changes require a new connection and
invalidate older callbacks. None of this metadata is persisted in settings.

The inactive authority has explicit initial ceilings of 128 pending transactions
(including the active write), 4 MiB of queued UTF-8 request bytes, and 1 MiB per
request. These are admission bounds, not measured throughput budgets. Oversized
or full-queue requests return an overload outcome; they do not join the queue or
implicitly repeat. Parse failures and every settlement path release capacity.
With activation these ceilings now bound the live desktop and headless write
paths, including compat translations of whole-snapshot writes.

Serialized commits sync a unique temporary file before rename, then
attempt directory sync. A directory-sync error reports separately from the
already committed result. Process-crash tests do not establish power-loss
durability or exactly-once request receipts.

The transaction vocabulary is served by two additive main-local procedures,
`settingsTransactionMutate` and `settingsTransactionSnapshot`
(`src/shared/ipc/procedures/settings.ts`), dispatched through the backend
service-call boundary to the composition's `SettingsCommandService` in both
compositions. They are additive within the current wire generations: an older
renderer never calls them and an older backend loud-rejects the unknown
procedure name. Remaining activation work keeps its recorded coordination
requirements: usage-secret custody (Gate 2.5) and the native release gates
remain open; the desktop remote-access writer above was the last settings
writer outside the authority and is integrated as of the correction pass.

## Wire protocols and deployed artifacts

| Boundary                                       | Version location                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Coupled producers/consumers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client/host hop                                | `src/shared/clientHostHop.ts` (`CLIENT_HOST_HOP_VERSION = 16`); aliases `PORACODE_CLIENT_RUNTIME_VERSION`, `IPC_PROCEDURE_MAP_VERSION`, `BACKEND_HOST_PROTOCOL_VERSION`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | V6 B.5 collapsed the three renderer→host stamps into one number. Previously published IPC map version 1 is an old reader (`PREVIOUS_IPC_PROCEDURE_MAP_VERSION`). Keep remote protocol, client-engine protocol, and host-control as separate hops. Old-reader test: `procedureMapVersion.test.ts`. Version 15 (V2 A2): the backend→main bulk supervisor-event relay, its `supervisor-event-gap` recovery kind, the `set-event-interests` request, and the `setRendererEventInterests` IPC sync are removed; main receives only the bounded `native-thread-activity` projection and live renderer content rides the loopback WS. A version-14 preload/backend child still speaks the removed vocabulary, so the gate rejects that pairing typed (`clientRuntime.ts` facade check, `backendHostProtocol.test.ts` and `BackendHostClient.test.ts` old-artifact mismatch tests). The same unreleased 15 boundary also removed the `projects-changed` native event (host correction): the backend→main→renderer full `Project[]` mirror relay is gone, project mutations publish the bounded `remote-projects-changed` loopback-WS membership event, main keeps only the `database-projection-changed` tray refresh, and the validator rejects a stale child still emitting the removed event. No hop-15 artifact was released with that event vocabulary, so that pass kept the boundary at 15. Version 16 (V2 experiment writer retirement) then removed the legacy `dbPersistExperimentState` IPC procedure — the renderer experiment store is a memory-only projection and the co-located host experiment authority (`capabilities.experiments` v1) owns persistence, so no renderer→host experiment persist remains. A published hop-15 peer still dispatches the removed name, so hop 15 is an old reader rejected typed (`PREVIOUS_CLIENT_HOST_HOP_VERSION`; pre-upgrade regression in `clientHostHop.test.ts`, facade version list in `clientRuntime.test.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Host transport interface                       | `src/renderer/hostTransport/types.ts` (`HOST_TRANSPORT_VERSION = 2`, `PREVIOUS_HOST_TRANSPORT_VERSION = 1`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | In-process TypeScript stamp for `HostTransport` implementations. Not a serialized wire hop (those stay on `CLIENT_HOST_HOP_VERSION`); bump when the request/subscribe contract changes. Old-reader tests both directions: `src/renderer/hostTransport/hostTransportVersion.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Server native overlay manifest                 | `native-overlay/overlay.json` (`formatVersion: 2`, V6 D.2). v2 carries a multi-target `targets[]` table (platform/arch/dir/staged sha256) for linux-x64/arm64, musl variants, and win32-x64/arm64; a Windows target's `stagedSha256` keys are nested `/`-separated names (`conpty/conpty.dll`) and readers normalize them, so no bump was needed (regressions: `scripts/server-native-overlay.test.mjs`); v1 readers still parse (single host-shaped target). Kept-in-sync twins: `src/server/serverNativeOverlay.ts:36-46,65-100` and `scripts/install-server-prefix.mjs:28-96` — both accept v1 and v2 and select by runtime arch/libc. Tests: `serverNativeOverlay.test.ts`, `assemble-server-tarball.test.ts:26-90`.                                                            |
| Host capability flags (wire)                   | `src/shared/hostControlProtocol.ts` `hostServiceCapabilitiesSchema` — V6 round-2: every capability flag is optional-with-default-false on the wire (was: 6 of 8 required). Additive in both directions: hosts that omit flags parse as `false` (fail-closed) on TS, iOS, and Android; hosts that emit all flags (today's canonical form) are unchanged for old readers. Mirrored decoders: generated `RoutehostU2DDescribeResponse` codecs (Swift/Kotlin) + the lenient `ConnectionProfile`/Android model defaults. The v2 CONTROL describe's 6-field tolerance note above is unchanged. Tests: omitted-flag describe completes pairing on both platforms (`RemoteAPIClientPathTests` omit case, `RemoteApiClientHostDescribeTest`), conformance + regenerated-manifest pins green. |
| CLI hook event protocol                        | `src/shared/contracts/agentEvent.ts` (`PROTOCOL_VERSION`, `MIN_PROTOCOL_VERSION`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `src/supervisor/agents/plugin/forward-runtime/poracode-hook-runtime.mjs`, the OpenCode forwarder, HookIngress, and the WSL bridge. Update the latest version for envelope/intent changes; raise the minimum only when deliberately dropping compatibility.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Supervisor flow control                        | `src/shared/ipc/events.ts` (`SUPERVISOR_EVENT_BACKPRESSURE_VERSION = 1`, `SupervisorFlowControl`, `SupervisorFlowControlCapabilities`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Parent↔supervisor control channel (same bundle, but dev orphans and stale children exist). Additive: the supervisor advertises `versions` once per boot as `{ kind: "supervisor-flow-control-capabilities" }`; the host sends `set-event-backpressure` only when the current child advertised version 1, because a released legacy supervisor would misread an unknown control as terminal-output pressure. The supervisor discriminates by `control` and ignores unknown values. B1 adds the additive optional `maxInFlightBytes`/`maxEnvelopeBytes` advertisement and the canonical credit/ack vocabulary (`supportsCanonicalCredit`, `canonicalFlowGeneration`, `canonicalCreditBytes`, `canonicalAckSeq`) under the same `versions:[1]`: an old supervisor ignores the fields, and the host grants a credit window only to a peer that advertised it, otherwise keeping the conservative in-flight constant. Tests: `SupervisorClient.test.ts` (both directions), `supervisorIpcSender.test.ts`, `runtimeEventBuffer.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Backend host database RPC                      | `src/shared/backendHostProtocol.ts` (`BACKEND_HOST_PROTOCOL_VERSION` = client/host hop 15, intentionally unchanged)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | B1 made `callDatabaseRpc` async: ordered-transcript reads and content mutations now cross the host's committed-prefix fence/mutation gate, so a reply arrives after the prefix commits or as a typed busy/degraded/contaminated refusal. Envelope shapes, procedure names, and the version gate are unchanged — only reply latency moves from synchronous to awaited — so no persisted or wire shape changed and the version intentionally stays 15; an old reader is unaffected. Tests: `databaseRpc` callers (backend `callDatabaseRpc` intercept, MCP `read_thread`, native-e2e truncate/checkpoint-revert routes).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Backend environment assets                     | `BackendHostInitializePayload.desktop.environmentAssets`, client/host hop 15 (unchanged)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | C1 adds optional asset paths used only by the backend-owned environment composition. An older sender omits the field and composes no environments; an older receiver ignores the optional field and never emits `sshEnvironments`. No token, persisted shape or existing envelope changes. Regression: `desktopBackendInitialize.test.ts` carries exact paths; `BackendEnvironments.test.ts` accepts the legacy omitted field and refuses declared assets without actual data custody.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Remote environment auth-authority marker       | `src/shared/environments.ts` (`ENVIRONMENT_AUTH_AUTHORITY_HEADER`, `ENVIRONMENT_AUTH_AUTHORITY_PARENT`) and the C1 parent proxy response path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Additive within C1's still-unreleased v1 environment capability (`capabilities.sshEnvironments.versions: [1]`, `snapshots.ts`): the parent sets the marker ONLY on its own authentication step's 401/403 pre-dial rejections; CORS/host 403s carry no marker. The entire reserved `x-poracode-environment-*` namespace is stripped from child HTTP and upgrade responses, so a child can never spoof it; CORS exposes the marker to browser clients and the relay hop forwards response headers unchanged. A parent without the marker is a supported degraded mode (clients fail closed, no probe). Regression: `environmentProxyCorrections.test.ts` (marker only on auth-step rejections; child-set marker stripped on HTTP and upgrade), `environmentProxy.test.ts` (CORS expose), `relayEnvironmentProxy.test.ts` (relay preserves response headers).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Desktop/attach IPC procedure map               | `src/shared/ipc/procedureMap.ts` (`IPC_PROCEDURE_MAP_VERSION`, `ipcProcedureMapFingerprint`, `assertIpcProcedureMapVersion`, `IpcProcedureMapVersionError`), fingerprint pin in `src/shared/ipc/procedureMapVersion.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Renderer bridge (`createInvokeBridge`), main handler maps (`registerHandlers`), the attach device-procedure allowlist, and the standalone owner's procedure dispatch. ANY map change (procedure added/removed, transport changed) must refresh the pinned fingerprint — that forces the compat review even when the version stays; bump the version only for changes an already-published peer cannot accept. V2 A2 removed `setRendererEventInterests` (the renderer registry is consumed locally by the managed loopback WS); the hop moved 14→15 and the pinned fingerprint was refreshed with the removal review recorded in `procedureMapVersion.test.ts`. A peer-declared version mismatch rejects typed (`IpcProcedureMapVersionError`); absent/malformed declarations count as legacy version 0 and also reject typed. **Runtime exchange point (wired in V5 2.5):** the preload advertises its bundle's `ipcProcedureMapVersion`, and the renderer asserts it in BOTH Electron runtime installers (`installElectronClientRuntime` for the managed bootstrap, `installAttachedElectronClientRuntime` for the attach bootstrap) before anything installs — so a mixed bundle/preload pair rejects typed at the renderer⇄main bootstrap boundary. The standalone-owner attach handshake needs no second exchange: the owner serves no IPC procedures to the renderer (its server-owned procedures ride the versioned remote wire; the renderer's device-procedure fallback is served by the SAME-build attach main). Resource admission PHASE1 adds the additive internal supervisor name `getResourceAdmissionStatus` (on-demand policy/usage diagnostics) and the additive supervisor reply fields `errorCode?`/`retryAfterMs?` on failed replies; `isSupervisorReply` keys only on `replyTo`, every peer loud-rejects unknown names, and the name is not in `REMOTE_PROCEDURE_SPECS`/any renderer call path, so `IPC_PROCEDURE_MAP_VERSION` stays 15 while the pinned fingerprint was refreshed with the review recorded in `procedureMapVersion.test.ts`. An old host ignores the extra reply fields (message-only degradation); an old supervisor omits them. Host correction adds the additive internal supervisor name `closeThreadConfirmed` (confirmed-retirement close used by host housekeeping purge; a rejection or missing procedure is treated as "not confirmed" and the row is retained), refreshing the pinned fingerprint again with the review recorded in `procedureMapVersion.test.ts`; no existing name/payload/transport changed, so the map version stayed 15. V2 experiment writer retirement removes `dbPersistExperimentState` (no live renderer caller remained; the host experiment authority owns experiment persistence), moving the hop 15→16 and refreshing the pinned fingerprint with the removal review recorded in `procedureMapVersion.test.ts`; the previously published map version 1 and hop 15 both remain old readers rejected typed. B7 adds the optional `gitProcesses` counters to the existing resource-admission diagnostic result. Older consumers ignore the extra object and newer consumers accept its absence, so the hop remains 16; no procedure name, transport, or required payload/result field changed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Client engine worker protocol                  | `src/renderer/state/remote/engine/protocol.ts` (`CLIENT_ENGINE_PROTOCOL_VERSION`, currently 2), `clientEngineWorker.ts`, `clientEngineHost.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Same-renderer-bundle Web Worker and host (shipped together, so no cross-build pairs exist in production; a stale cached chunk pair fails loud instead of half-working). Version 1 gained the typed `protocol-mismatch` answer additively: a worker refuses a foreign-version request with `{ type: "protocol-mismatch" }` instead of dropping it, and the host rejects every pending consumer with `ClientEngineProtocolMismatchError` and retires the worker to the sync fallback on any version-gated reply. Version 2 (V5 plan 2.5) removes the `decode-backend` work type together with the deleted renderer-stream transport; a stale cached chunk pair fences into the loud mismatch path rather than half-serving the deleted request. Engines are per-consumer since V5 2.2 and now number TWO (`getRemoteSocketEngine` / `getPersistJsonEngine`; the backend-stream engine left with the deleted stream): each has its own generation, pending set, overflow handlers, and worker, so resetting one consumer can never reject another's in-flight work. Bump the version for any message-shape change; old-reader rejection tests live in `clientEngineHost.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Remote desktop/helper API                      | `src/shared/remote/protocol.ts` (`PORACODE_REMOTE_PROTOCOL_VERSION`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Desktop server, headless server, renderer client, mobile/PWA client, snapshots, and SSH helper negotiation. V6 B.4 adds optional `space` (`ipc` \| `loopback`) on `event`, `desktop-event`, and `resync-required` frames; protocol stays 12. Old readers ignore the field; new readers default omitted `space` from the frame type. V2 A2 startup fix removes the project-less hydration procedure `dbGetThreadsPage` from the remote allowlist (it is local-shell: managed catalog hydration executes over preload IPC; host truth for remote clients is the thread-list registry route). The wire protocol intentionally stays 12: this is an advertised-capability reduction whose generic-passthrough dispatch had no database dispatcher and no remote consumer (browser/native clients page through the thread-list route), and the manifest, native parity ledger, and native-e2e operation map were regenerated and reviewed together. Host correction: the `x-poracode-command-id` header is now REQUIRED for the unreleased catalog-mutation kinds (`reorder`/`set-workspace`/`set-draft-config` on `/api/projects/command`; `reorder`/`set-workspace` on `/api/threads/{threadId}/command`) — a missing header is a 400 `command_id_required` before any effect; legacy kinds keep their historical optional header. Protocol stays 12 because no payload/response shape changed and no released client can send those capability-gated kinds; the SDK overloads (`projectCommand`/`sendThreadCommand`) make the explicit per-operation id a type-level requirement, and the `catalogMutations` v1 capability remains valid (it was never released; a client that gates on it must send the id). Bounded catalog-change notifications add the negotiated `capabilities.boundedCatalogChanges` v1 and the per-connection WS declaration `catalogChanges=bounded-v1`: a declared, `session:read` connection receives the additive signal form (`{type:"remote-projects-changed", mode:"signal"}`) and undeclared connections keep the byte-identical full list (per-socket `resync-required` when the full list is not deliverable or when replay crosses a signal). The protocol stays 12: this is an additive negotiated capability on an existing event discriminator, unknown capability keys and the optional `mode` marker are ignored by old readers, an old host never advertises it and never emits the signal form, and no existing payload shape changed. R1 procedure-ownership fix removes twelve main-local IPC procedure names (the raw DB delete/replace/read names, the unbounded `dbGetThreadRuntimeItems` transcript read, and the local-shell reveal/icon probes) from the remote allowlist, making the generic `/api/git/call` passthrough supervisor-typed at the type level (`RemoteProcedureSpecs` satisfies `SupervisorProcedureName`), at the contract registry (transport assertion), and at the server (fail-closed 403 `git_procedure_not_allowed`); the three genuinely needed thread-history reads (`dbGetLatestThreadGoalItem`/`dbGetThreadCompletedTurns`/`dbGetThreadContextUsage`) move to the bounded-history IPC adapter over the existing `/history` route plus the `ct1.` walk (a walk over its page budget refuses typed `completed_turns_budget_exhausted` instead of serving a partial tail as complete), and the experiment judge pages the bounded history-items route instead of the unbounded read. Protocol stays 12 by the recorded `dbGetThreadsPage` precedent: an advertised-capability reduction whose generic-passthrough dispatch had no database dispatcher, no payload/response shape change, and typed rejections for old clients; the manifest, native parity ledger, and native-e2e operation map were regenerated and reviewed together. |
| B4 bounded remote reads                        | `src/shared/remote/catalogReadContract.ts` (`CATALOG_READS_CAPABILITY = "bounded-v1"`), `src/shared/remote/historyReadContract.ts` (`ct1.` cursor), `src/shared/remote/contract/queryCodecs.ts`, `src/host/remote/server/legacyBulkReadAdmission.ts`, `protocol/remote/v3/generated/**`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Additive capability bundle under remote protocol 12: a `reads=bounded-v1` echo on `shell-snapshot`/`thread-list`/`project-list`/`thread-history`/`thread-history-items`/`thread-turns`; opaque cursors `tp1./tu2./tc2./pj1./ti1./pi1./ct1.` where a prefix or mode mismatch is a 400 protocol error, never a downgrade; new routes `project-list`, `catalog-membership`, `thread-turns`; optional `maxBytes` (wire UTF-8) and `maxDecodeBytes` (`2 × serialized.length`) plus `order`/`mode`/`summaries`/`projectLimit`/`completedTurnsLimit`. Absence of the `reads` echo in a response is the ONLY older-host downgrade signal; old hosts ignore the new optional params, and undeclared clients keep complete legacy responses under explicit 2-global/1-principal bulk admission. Adding another optional param/field stays inside this bundle; changing a cap meaning or an existing cursor payload requires a new capability token, and generated artifacts plus the native parity ledger regenerate together.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| B1 remote runtime-history notices              | `src/shared/runtimeHistoryNotice.ts` (`gap2:` token generation), `src/shared/remote/protocol/runtimeHistoryNotice.ts` (`REMOTE_RUNTIME_HISTORY_NOTICES_VERSION = 1`, `notices=v1`), `src/host/remote/runtimeHistoryGapComposition.ts`, `src/host/remote/server/{runtimeHistoryNoticeGate,noticeGate}.ts`, `protocol/remote/v3/generated/**`, `protocol/remote/v3/native-parity.json`                                                                                                                                                                                                                                                                                                                                                                                                | Additive recovery surface under remote protocol 12. The host advertises `capabilities.runtimeHistoryNotices.versions:[1]` ONLY when its composition wires the durable gap/notice store; routes `thread-runtime-gap` (`session:read`) and `thread-runtime-gap-acknowledge` (`session:operate`, `x-poracode-command-id`) require the explicit `notices=v1` declaration (absent/unknown = 400 protocol error, never a downgrade). `runtimeNotice` is an optional additive field on `remoteThreadSnapshotSchema` and `remoteRuntimeItemsPageSchema`; an undeclared reader of a notice thread is refused 409 `runtime_history_notice_unsupported`. The WS upgrade's per-connection `notices=v1` declaration gates canonical runtime batches for notice threads (emptied, never dropped, seq-contiguous); absent/unknown/malformed is incapable and fails closed. The declaration token is the compatibility boundary: changing its meaning, the `notices` semantics, or the gate direction requires a new token/version, and generated artifacts, the native parity ledger, and the native-e2e operation map regenerate together. Native ledger entries stay `planned` until real client/device evidence lands.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Remote binding-format IR                       | `src/shared/remote/contract/versions.ts` (`REMOTE_BINDING_FORMAT_VERSION = 2`, `REMOTE_GENERATOR_VERSION = 3`), `src/shared/remote/contract/{generate,hashes}.ts`, and `protocol/remote/v3/generated/{manifest.json,inventory.json,ir.json,json-schema.bundle.json}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Binding format 2 covers the normalized IR / JSON Schema 2020-12 envelope and binding semantics; generator 3 adds executable native root validation, portable transforms, and Zod-compatible default semantics while retaining the format-2 IR boundary. `sourceHash` and `manifestHash` are derived integrity values from the live authority and manifest, so regenerate them with `pnpm protocol:remote:v3:generate`, keep `pnpm protocol:remote:v3:check` green, and never hardcode their current values in this inventory. Audit the binding-format version for IR/schema/envelope or wire-encoding semantic changes and the generator version for generation-algorithm changes, even when the remote wire protocol version stays unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Remote native binding bundle                   | `src/shared/remote/contract/native/generate.ts` (`NATIVE_BINDINGS_MANIFEST_FORMAT_VERSION = 5` — format 2 added the pairing state machine, format 3 the terminal-cursor machine, format 4 the terminal hardware-key encoder, format 5 the background-task reduce and follow-up queue machines), `protocol/remote/v3/generated/native/native-bindings.json`, and the recursively generated `protocol/remote/v3/generated/native/{swift,kotlin}/` trees                                                                                                                                                                                                                                                                                                                               | Bundle format 1 inventories every generated Swift/Kotlin artifact; `native-bindings.json` `languages.*.files` is the authoritative recursive membership list, including each path, digest, byte count, and line count. Any native generator ABI/API change, semantic-validation behavior or metadata change, union/discriminator codec change, or optional/null/unknown-field representation change requires an intentional audit of both this bundle format and the upstream binding/generator versions. Regenerate rather than hand-editing; stale, missing, or extra tree members must fail `pnpm protocol:remote:v3:check`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Remote native parity ledger                    | `protocol/remote/v3/native-parity.json` (`formatVersion = 2`, `protocolVersion = 12`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Format 1 assigns every remote route, procedure, WebSocket message/event, and runtime event to one native implementation batch with per-platform disposition and evidence. Format 2 splits every feature claim into `wire` and `ui` columns (`{wire:{disposition,evidence}, ui:{disposition,evidence,note?}}`); a `partial` ui disposition REQUIRES a precise `note`. Format-1 ledgers migrate by the recorded rule: the format-1 claim becomes `wire` unchanged and `ui` mirrors it with the UI-surface subset of the evidence. Any ledger shape or disposition-semantics change requires a format-version audit. A protocol-version mismatch or any manifest inventory addition, removal, or rename invalidates the ledger and must fail until the complete ledger is reviewed and updated. The `remote/v3` directory name is the established contract-generation family, not the current wire protocol number.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Remote thread command variants                 | `src/shared/contracts/thread.ts` (`remoteThreadCommandSchema`), `src/host/remote/server/threadCommands.ts`, renderer command mirroring, and native `ThreadRemoteCommand` mirrors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | New discriminator variants are additive within a wire-protocol version only when all existing payloads retain their encoding and older hosts reject the unknown variant before mutation. Update host durability, renderer mirroring, generated Swift/Kotlin bindings, native manual encoders, and route goldens together. `clear-group` also dissolves a one-member remainder so every persisted/mirrored layer keeps the same grouping invariant.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Managed catalog mutation commands              | `src/shared/remote/protocol/resources.ts` and `src/shared/contracts/thread.ts` (additive `reorder` / `set-workspace` / `set-draft-config` kinds), `src/shared/catalogOrder.ts`, `src/host/db/catalogIntents.ts`, `capabilities.catalogMutations` (`REMOTE_CATALOG_MUTATIONS_VERSION = 1`, `src/shared/remote/protocol/core.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Additive command kinds on the existing project/thread command routes at protocol 12. Legacy kinds keep the complete response; the catalog kinds answer the bounded `{ok:true, project?}` union, and a host that predates them rejects the unknown discriminator before mutation instead of stripping a persistence key. Clients gate on the advertised capability. Regenerate Swift/Kotlin bindings and keep the native parity ledger's route-level dispositions unchanged (the new kinds are host-authority source evidence only until native transports implement them).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Native E2E coverage ledger                     | `tests/native-e2e/harness/versions.ts` (`NATIVE_E2E_LEDGER_FORMAT_VERSION = 2`, `NATIVE_E2E_OPERATION_MAP_VERSION = 1`), `tests/native-e2e/harness/{coverageLedger,operationMap}.ts`, and `tests/native-e2e/harness/operation-map.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Ledger format 2 versions the per-operation evidence, status, counts, and completion projections. The operation-map `manifestHash` is a derived boundary over the current protocol manifest identity/format, generated inventory `sourceHash`, and sorted route/procedure/WebSocket/replay/runtime operation keys; never hardcode its current value in this inventory. A ledger shape/meaning change requires a ledger-format audit; a manifest/inventory/key derivation or hash-algorithm change requires regenerating and reviewing the committed operation map and its consumers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Android push channel IDs                       | `website/src/lib/push/fcm.ts` (`STATUS_CHANNEL_ID = "poracode_status_v1"`, `ATTENTION_CHANNEL_ID = "poracode_attention_v1"`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | These IDs are durable Android OS-facing identifiers carried in FCM `channel_id`: silent status updates use `poracode_status_v1`, while attention notifications use `poracode_attention_v1`. The native Android app must create matching channels. Do not rename an ID or reuse it for different sound, importance, or user-visible semantics; introduce a new versioned ID and coordinate gateway and native creation/migration instead.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| iOS notification delivery preference           | `ios/App/App/Features/Notifications/NotificationPermissionController.swift` (`NotificationDeliveryPreference.storageKey`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | The device-local master switch defaults on for upgrades and unregisters the exact APNs routing identity from every paired host when disabled. Changing its meaning, default, or storage shape requires a new versioned key and an explicit migration; pending unregister entries must drain before a route can register again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| iOS notification alert preferences             | `ios/App/App/Features/Notifications/NotificationPermissionController.swift` (`NotificationAlertPreference.*StorageKey`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Sound, foreground presentation, and each alert-category filter are device-local, default on/always for upgrade compatibility, and sync to every paired host as optional native push-registration metadata. Changing defaults or meaning requires new versioned keys; background delivery filtering must remain host-enforced because iOS renders APNs alerts before launching the app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Android project sync preferences               | `android/app/src/main/kotlin/com/poracode/app/storage/ProjectSyncPreferences.kt` (`DOCUMENT_VERSION`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Device-local project exclusions are keyed by client connection and project ID, default to synced for upgrades, and filter Home utilities, quick compose, and project rows without mutating the host. Changing scope, default, document shape, or inclusion semantics requires a version migration; future-version documents must never be overwritten.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Android device settings                        | `android/app/src/main/kotlin/com/poracode/app/storage/DeviceSettingsPreferences.kt` (`DOCUMENT_VERSION`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Versioned device-local appearance, chat typography, and agent/project terminal typography. Defaults preserve the pre-feature system/dynamic theme, Material 14sp/20sp chat body, and 13sp terminal text. Changing defaults, value meaning, or document shape requires migration; future-version documents must never be overwritten.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| iOS Create PR mode                             | `ios/App/App/Features/Projects/GitHubOperations/GitHubOperationsPresentation.swift` (`GitHubPullRequestCreationMode.storageKey`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Device-local default for the native Create Pull Request primary action. `dialog` preserves the released editable-sheet behavior; `auto` generates a summary with the selected host's commit-generation settings and immediately performs one exact-host PR mutation. Changing this vocabulary or default requires a new versioned key and migration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| iOS GitHub workflow pins                       | `ios/App/App/Features/GitHubActions/GitHubActionsPageView.swift` (`GitHubWorkflowPinPreferences.storageKey`, `documentVersion`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Device-local pinned workflow IDs are scoped by desktop and project. Changing the scope, ID meaning, document shape, or ordering semantics requires a new key/document version and an upgrade regression test; future-version documents must never be overwritten.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Remote terminal cursor-sync                    | `src/shared/remote/protocol.ts` (`TERMINAL_CURSOR_SYNC_VERSION`, `TERMINAL_CURSOR_SYNC_V2_VERSION`), `src/host/remote/server/terminalCursorSync.ts` (`TERMINAL_CURSOR_SYNC_SUPPORTED_VERSIONS`), `protocol/remote/v3/generated/manifest.json` (`compatibility.terminalOutput.cursorSync`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Additive capability under the current remote protocol / manifest `formatVersion` 1. Advertised in environment `capabilities.terminalCursorSync.versions` (currently `[1, 2]`). Version 2 adds byte-budgeted chunked baselines and cumulative ACK credit; version-1 watches retain their framing. Client `terminal-watch.cursorSync.version` accepts any positive int; unsupported versions get a non-retryable `unavailable` watch-result and install no reliable watch. Wire frames keep legacy byte shapes when the capability is absent. `generation: null` on snapshots is replace-only and never append-compatible. Cursors are **JS string code units** (UTF-16 / `String.length`), not code points — astral planes and surrogate pairs are two units; do not change unit space without a capability bump. One reliable or legacy watch per `(connection, terminalId)` (rewatch replaces; no dual streams). Keep goldens, conformance, server registry, and mobile protocol mirrors aligned when bumping.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Remote native push routing                     | `src/shared/remote/protocol.ts` (`REMOTE_PUSH_ROUTING_VERSION`), `src/host/remote/push/PushRegistrationStore.ts`, `src/host/remote/push/pushRouting.ts`, and `website/src/lib/push/{validate,fcm}.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Additive capability under remote protocol v3. Environment advertises `capabilities.pushRouting.versions` (currently `[1]`). A client opts in by registering the complete `{ version, clientConnectionId, desktopId }` routing identity; legacy registrations and payloads remain accepted. Native payload v1 carries that identity plus `threadId`; APNs custom data is outside `aps`, while FCM data values are strings. Update host, hosted gateway, and native consumers together before adding a version.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Relay framing                                  | `src/shared/remote/relayProtocol.ts` (`PORACODE_RELAY_PROTOCOL_VERSION`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Relay host and relay server.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Browser-forward child origins                  | `src/host/remote/portForward/forwardOrigin.ts` (`ForwardOriginPolicy` label shape `f-<owner24hex>-<forward32hex>`; `deriveForwardOwner` HMAC domain `poracode-forward-origin-v1`), `src/host/remote/portForward/portProxy.ts` (`FORWARD_ORIGIN_SESSION_COOKIE_NAME = "__Host-poracode-forward"`), `src/shared/remote/relayProtocol.ts` (`RELAY_FORWARD_SESSION_COOKIE_NAME` / `RELAY_ROUTING_COOKIE_NAME` — legacy `lc_forward`/`lc_relay`, credential role removed)                                                                                                                                                                                                                                                                                                                | These are persisted browser-side boundaries (cookie jars and origin-scoped storage outlive deploys), so change them only with a deliberate compatibility design. The cookie name is `__Host-`-prefixed and minted only on a forward's own child origin, bound server-side to the exact (forwardId, origin) pair — renaming it invalidates every live forward session (a fresh entry is required, never a silent reuse), and reusing a name for different semantics lets an old cookie authenticate new behavior. The owner label derives from the host's persistent 32-byte origin secret (not the relay password and not a caller-supplied hostname), so rotating the secret or changing the derivation/label shape mints a different namespace: previously served child origins stay reserved by shape (`isForwardOriginAuthority`) and must never start serving host content. Relay-derived labels additionally bind to relay framing version 2; old relays/hosts must not claim isolation merely because optional fields parse. Acceptance: the two-host probe (`src/server/relay/forwardOriginTwoHostProbe.test.ts`) plus the real-Safari boundary drill (`tmp/b3-lane3/safari-two-host-probe.mjs`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Cursor SDK worker                              | `src/supervisor/agents/cursor/sdkWorkerProtocol.ts` (`CURSOR_SDK_WORKER_PROTOCOL_VERSION`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Worker and worker client message shapes and required lifecycle behavior. Version 3 requires detached SDK cancellation handling so a stale helper cannot kill a parent and its subagents on a transport abort; message shapes remain unchanged. Version 2 added `sdk.pinnedRoot` to discovery requests and `packageRoot` to the probe result; both ends ship together and the native helper under `resources/wsl-helpers` is staged from the same source, so a stale staged copy must fail the handshake rather than ignore the field.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| WSL bridge deployment                          | `src/supervisor/wsl/bridge/bridge.mjs` (`BRIDGE_VERSION`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Bump for every behavioral, endpoint, auth, or wire change so existing deployed bridge copies are replaced. Its hook `PROTOCOL_VERSION` must stay compatible with the CLI hook protocol.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| WSL staging worker                             | `src/supervisor/wsl/staging/protocol.ts` (`WSL_STAGING_PROTOCOL_VERSION`, currently 3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Deployed per-distro helper the supervisor spawns to run WSL filesystem verbs outside the control loop. Host and worker ship in the same bundle and the ready handshake requires an exact version match, so a stale staged/bundled worker fails closed instead of half-serving new verbs. Bump for every request/result shape, verb, or mode-bit change, and update the fixture default plus the host/worker version-rejection tests together.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| WSL managed Node runtime directory             | `<wsl $HOME>/.poracode/runtime/<node-v…-linux-{x64,arm64}>` (`MANAGED_RUNTIME_MARKER_FILE = ".poracode-managed-complete.json"`, `MANAGED_RUNTIME_MARKER_VERSION = 1`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Cross-build persisted runtime in every WSL distro. The marker is published atomically (host temp file + worker `stage-file` rename) only after the extraction command exited and its child was joined, and a runtime is served only when the marker and `bin/node` are both present — so a killed or timed-out extraction can never be mistaken for an install. Marker contents are validated against the resolving identity (`markerVersion`, pinned `nodeVersion`, `target`; additive fields tolerated): a `markerVersion` newer than this build's fails closed and is never rewritten, so an older build cannot silently downgrade a newer install, while a corrupt, wrong-shape, wrong-target, or wrong-pinned-node marker is treated as no proof and falls back to executing the exact binary. A marker read/transport failure throws instead of reading as absence, so a reinstall never writes into a tree that may still be valid. Unmarked installs written by earlier builds are accepted only after executing the exact binary and seeing the pinned version, then are stamped with the current marker; a missing marker alone never deletes anything, and extraction invalidation (`remove` before tar, marker after) plus the unique `.poracode-stage-*` input keep publication ordering honest. Adding reader-side validation without bumping `MANAGED_RUNTIME_MARKER_VERSION` is intentional: v1 stays the valid shape, and versioning the marker or moving the layout requires older readers to keep accepting unmarked dirs through the same revalidation. Tests: `src/supervisor/wsl/runtime/completion.test.ts`, `src/supervisor/wsl/runtime/install.test.ts`, `src/supervisor/wsl/runtime/index.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| SSH runtime build manifest                     | `src/shared/sshRuntimeManifest.ts` (`SSH_RUNTIME_MANIFEST_VERSION`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `src/build/runtimeDeclarationPlugin.ts` source/code/resource declarations, `src/host/ssh/runtimeBuildManifests.ts` validation before memory/disk cache reuse, and `src/main/ssh/runtimeBundle.ts` staged verification. Generation 4 carries settings capture metadata; owner-control generation 3 and settings generation 4 require fresh combined generation 5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Preassembled SSH runtime archive               | `src/host/ssh/runtimeArchive.ts` (`SSH_RUNTIME_ARCHIVE_MANIFEST_VERSION = 1`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Release pipeline output `manifest.json` (`formatVersion`, `archive`, `archiveSha256`, `hash`, `sourceHash`) plus the archive bytes. The loader is strict: an existing manifest of an unknown generation or a byte-mismatched archive is a loud failure, while `sourceHash` different from the app build means "stale" and falls back to worker staging. When this format changes, update the archive writer in the artifact lane, `resources/ssh-runtime-archive` packaging, and the runtime loader together.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Standalone server artifact metadata            | `scripts/server-artifact-metadata.mjs` (`SERVER_ARTIFACT_METADATA_VERSION = 1`), produced as `dist/server-artifact.json` and promoted as `server-artifact-<platform>-<arch>.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Immutable provenance for one assembled tarball: `version`, `targets[]`, `tarball.{name,sha256,bytes}`, `runtime.{nodePty,betterSqlite3,dependencies,overlayTargets}`, `webClient`, per-file hashes, and the additive optional `longestMemberPath` (Windows path-length preflight; absent in older artifacts, no bump). Release qualification, the aggregate merge, the launcher-manifest generator, and the npm publication pipeline all read it; a release must promote these bytes, never a rebuild. Unknown `formatVersion`/`kind` or a missing hash is refused. Bump only with a migration for already-published assets and update `scripts/generate-runtime-manifest.mjs`, `scripts/server-install-qualification.mjs`, and the workflow verify steps together.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Launcher runtime manifest                      | `packages/poracode-cli/lib/manifest.mjs` (`RUNTIME_MANIFEST_VERSION = 1`), `packages/poracode-cli/runtime-manifest.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | The embedded `npx poracode` contract: exact `version` plus one `{url, sha256}` per published target. The package version must equal the manifest version (the launcher refuses a mixed pair with `PORACODE_RUNTIME_MANIFEST_MISMATCH`), `set-release-version.mjs` resets the target table on a version bump, and the publication pipeline replaces it from the qualified `server-artifact.json` set. Never point an entry at a mutable `releases/latest` URL. A format change needs a new `formatVersion` plus a launcher release that understands the old generation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Launcher runtime cache marker and install lock | `packages/poracode-cli/lib/cache.mjs` (`.poracode-runtime.json` `formatVersion: 1`; lock `owner` record `{formatVersion: 1, pid, token, at}`, legacy bare-pid text accepted, anything else foreign)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Cache identity for one `<cacheRoot>/<version>/<target>` install: `tarballSha256` plus the `lib/server.cjs` `entrySha256` and the `version`/`target` the record was written for; a missing/unknown marker, a mismatched identity/hash, or markerless non-empty content is refused (`PORACODE_RUNTIME_CACHE_TAMPERED` / `PORACODE_RUNTIME_CACHE_UNREADABLE`) and never replaced, while an empty leftover directory is removed with `rmdir` and republished. Correctness is publication, not the lock: every installer builds in a unique private `…staging-<version>-<target>-<pid>-<uuid>` directory and the entry is published by one atomic rename; a loser re-verifies the winner's marker and adopts it, so concurrent installs converge on one immutable verified entry. The lock is an advisory duplicate-work optimization (never a mutual-exclusion guarantee): owner publication is atomic (complete record staged in a unique `…lock.new-<pid>-<uuid>` directory and renamed onto the pathname only after an existence check, so the path never exists without a complete record), release and reclamation are verified private-name renames that delete only the exact generation they re-verified, missing-record locks are age-gated for 10 minutes, a dead generation-1/legacy owner is reclaimed, and an unknown/future/absent `formatVersion` is foreign — never reclaimed, never deleted, and the installer proceeds without the lock (`PORACODE_RUNTIME_INSTALL_LOCK_FOREIGN`; timeout likewise degrades). A reclaimer that moved a live lock restores it when possible; a displaced owner still converges through publication. `…lock.new-*`/`…lock.stale-*` scratch and dead `.staging-*` are swept by pid. Changing the record shape, reclamation protocol, or cache publication format means teaching readers the previous generation before writing the new one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Frozen stage install closure                   | Stage `package.json` + `npm-shrinkwrap.json` written by `scripts/runtime-closure.mjs` (`pinInstalledVersions`, `generateNpmShrinkwrap`) and shipped in the server tarball and the preassembled SSH archive                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | The qualified host must install with no live semver range and no compiler: `--ignore-scripts` first, then the verified native overlay. Both the standalone tarball and the SSH runtime archive consume the same helpers from the same installed tree; adding a dependency or changing the stage layout means regenerating both and keeping the overlay wrapper-version validation aligned.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Supervisor code capture                        | `src/shared/runtimeCodeManifest.ts` (`RUNTIME_CAPTURE_PROTOCOL_VERSION`, currently 1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `src/main/supervisor/runtimeManifest.ts`, `capturedRuntime.ts`, and serialized `capturedRuntimeBootstrap.ts` share the bounded declaration/session protocol. The production supervisor still advertises settings service 0 and `SupervisorClient` does not activate capture; settings reverse-service 1 and all-writer authority conversion remain required together. External dependencies, native libraries, separate workers and executable resources are outside the captured-code guarantee.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Provider hook plugins                          | Every `src/supervisor/agents/*/plugin/plugin.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Bump the plugin semver whenever installed plugin files or their behavior change; detection/install logic uses it to replace deployed copies. Check shared forward-runtime changes against every provider plugin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Computer-use native helper                     | `src/shared/contracts/computerUse.ts` (`COMPUTER_USE_HELPER_PROTOCOL_VERSION`) and `native/computer-use-helper/src/protocol/version.rs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Any helper request, response, capability, or delivery contract. Keep both constants equal, update the protocol fixture, and bump the bundled computer-use plugin semver when deployed helper behavior changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Interactive debug session file                 | `.agents/skills/interactive-testing/scripts/poracode-debug-session.mjs` (`DEBUG_SESSION_SCHEMA_VERSION`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Debug-session JSON fields or lifecycle semantics.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

External protocol identifiers such as MCP protocol dates and ACP SDK protocol versions are negotiated standards, not Poracode cache generations. Change them only with the corresponding dependency/protocol implementation and interoperability tests.

Crossagents plugin `1.6.0` updates the bundled skills, MCP guidance and prepared worker prompts.
`steer_agent` still accepts the previous `{ run_id, prompt }` request, but now waits for a
normal run result by default. `background: true` returns `accepted` without waiting for the result;
wait/output options are additive. The plugin manifest also supplies the MCP server version.
Completed structured workers can resume their same provider session through `steer_agent`;
the additive `continued_from` receipt identifies a new run ID for that turn, preserving old
reports, cursors and workflow joins. `list_runs.can_steer` includes resumable completed workers,
and `continued_by` directs old receipts to the latest turn. Resume is memory-only and capability
gated, never a fallback to a new conversation. Compact envelope version 1 is unchanged; its
prompt clarifies existing string-array and finding semantics without changing the schema.
Existing skill projections refresh by source content, and user skill overrides continue to
win over older bundles. No stored run state or compact-report shape changes; workflows and
runs remain memory-only. An already connected client must reload its tool catalog and skill
to use new behavior consistently. Keep old-host guidance in the skill until those clients
upgrade; instruction changes alone do not add newer server capabilities.

Crossagents plugin `1.7.0` reduces repeated initialization guidance and the core skills,
uses compact JSON whitespace for tool results without changing their decoded shape, and
adds an optional exact `model` filter to `get_agent`. Omitting the filter retains the full
provider response. Instruction/payload footprint gates and previous-bundle tests include
`1.6.0`; existing clients must refresh their catalog/skill to use the smaller setup path.
The compact report schema, session continuation semantics and 240-second wait cap are unchanged.

Crossagents plugin `1.8.0` raises the default/cap from 240 to 480 seconds and the
configured client deadline from 300 to 600 seconds. Authenticated tool responses
flush headers and legal leading JSON whitespace every 30 seconds while pending,
so HTTP header/body idle limits do not terminate the longer wait. Responses still
contain one JSON-RPC value; no MCP protocol date or compact-report schema changes.
Standalone and batch waits now wake for pending input/approval, as workflows already
do; deadlines never cancel workers. Prior-bundle tests include `1.7.0`. Existing
provider sessions need fresh MCP configuration; an updated skill alone cannot raise
an older host's cap or client timeout.

## Host ownership and local control

The standalone entry now consumes the shared ownership boundary; desktop entry
wiring remains pending. [Host ownership](../../docs/HOST_OWNERSHIP.md) describes
the active headless mapping, credential/import refusals and shutdown obligations.
Audit these separate identities together before changing their meaning:

| Boundary                   | Current version/source                                                                                                            | Compatibility requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owned root layout          | `HOST_ROOT_LAYOUT_VERSION = 1`, `hostRootPaths.ts` / `hostRootManifest.ts`                                                        | Map the original namespace once to its sibling; reject unknown layouts and staged activation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Permanent lease / metadata | SQLite `user_version = 1` / owner format 1, `hostOwnerLease.ts`                                                                   | Never replace an unknown lease; PID metadata is informational. Keep strong lease retention and the unmanaged-descriptor prohibition.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Data-custody fence         | SQLite `user_version = 1` / fence format 1, `hostDataFence.ts` (`<namespace>.host-data.sqlite`, lease-family sibling)             | New in Gates 2-3 Batch 1: the forked desktop backend child holds it for its lifetime (acquired before SQLite opens, released after it closes); owner admission probes it with a bounded wait. Old binaries never acquire it — an orphan from a pre-upgrade owner is undetectable by the fence and remains the documented legacy-contention case. No migration: an absent file is created fresh; an unknown future `user_version` is refused, never replaced. Desktop-only wiring today; the headless composition owns its database in-process and omits the fence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Credential provenance      | `HOST_CREDENTIAL_STATE_VERSION = 1`, `hostCredentialState.ts`                                                                     | Root, mode and fingerprint must match; malformed or cross-mode state never rotates silently.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Offline import receipt     | `HOST_IMPORT_RECEIPT_VERSION = 1`, `stageHostImport.ts`                                                                           | Imported state requires activation and later inventory revalidation; ephemeral control discovery is excluded.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Host activation manifest   | `HOST_ACTIVATION_MANIFEST_VERSION = 1`, `hostRootManifest.ts`                                                                     | The activated offline-backup form inside root layout 1 (`activation: "ready"` + `activationVersion`/`activatedAt`); the layout version itself stays 1. A pre-activation reader refuses an activated manifest loudly as an unsupported activation state instead of misreading it as staged or empty, and a future `activationVersion` fails the same read — never upgraded in place.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Host activation record     | `HOST_ACTIVATION_RECORD_VERSION = 1`, `activationHostRoot.ts` (`host-activation.json`)                                            | Decision evidence written after the manifest flip (which archives the staged receipt). A missing, malformed or foreign-`formatVersion` record is refused as unsupported — never converted; activation is idempotent-by-refusal, so a root whose record is absent but whose manifest says activated surfaces the loud reader error rather than silently re-activating.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Host key adoption offer    | `HOST_KEY_ADOPTION_OFFER_VERSION = 1` / `HOST_KEY_ADOPTION_PROTOCOL_VERSION = 1`, `nativeSecretKey.ts` (`host-key-adoption.json`) | One-time desktop cooperation for unsealing a staged OS-sealed key. The bounded private offer is validated field-by-field against the recorded owner generation, so a stale or foreign-version offer fails as "no desktop owner is currently offering key adoption" and the staged root stays untouched; the loopback request/response versions are literal-checked and a mismatch refuses the answer instead of parsing loosely. An offer left behind by a crashed desktop is retired on the first answered request or on service dispose, and stays inert in the meantime because it is bound to the owning generation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Host operation journal     | `HOST_OPERATION_JOURNAL_VERSION = 1`, `hostOperationJournal.ts` (`host-operations.json`, inside the leased data root)             | New in Gates 2-3 Batch 3: durable claim/receipt records for mutating host operations, written before and after each side effect. Bounded (≤32 records; terminal records expire after 60 s; a begin at capacity is refused, never evicting) with `HostControlServer` receipt semantics made durable. First consumer: staged-import activation (`activationHostRoot.ts`), whose interrupted mid-custody attempts now resume from the frozen plan evidence or refuse typed instead of surfacing a generic inventory mismatch. Records carry fingerprints and notes only, never key material. Unknown future `formatVersion` is refused loudly by readers and never rewritten; the file is excluded from import inventory like the other owned markers (see `hostImportFiles.ts`). Adding a new journaled operation kind or a plan-evidence field is an additive record change within version 1 only if every reader treats unknown kinds/fields as absent; changing phase or classification semantics requires a version bump plus an upgrade regression test seeded from the version-1 shape.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Local management wire      | `HOST_CONTROL_PROTOCOL_VERSION = 2`, `hostControlProtocol.ts`                                                                     | Closed operations, generation-bound HMAC request/response proofs; no bearer or PID-signal fallback. Version 2 is the host-declared service-capabilities boundary (V5 plan 1.2): the describe result renames its operation list to `operations` and gains the closed `capabilities` boolean object (ssh, browserPanel, chromeBridge, computerUse, nativeSecrets, portForward), published by both the desktop and headless describe builders from their actual service composition. Version-1 peers reject version-2 requests/replies on the literal version check in both directions — regression-covered in `src/shared/hostControlProtocol.test.ts`; there is no cross-version describe. D4 adds the additive `status` (read-only) and `admit` (mutation with expected build payload) operations plus the `identity-mismatch`/`not-staging` error codes under the same version 2: old readers never send them, a pre-D4 owner answers the authenticated empty 400 the client classifies as unsupported, and `admit` is generation-bound, deduplicated and idempotent once open. The additive `shutdown` operation (empty payload, `{ accepted: true }` result, no new error code) follows the same precedent under version 2 for platforms where signals cannot drain (Windows `kill()` is TerminateProcess): it is generation-bound, authenticated, only served when the host composes a `shutdown` callback (invoked after the acknowledgement is flushed), never advertised in `operations`, sent only by `poracode-server stop` and the win32 upgrade stop paths, and a pre-shutdown owner answers the authenticated empty 400 that the client classifies as unsupported (callers then keep the SIGTERM fallback or fail loudly). No version bump: old clients never send it and an old owner refuses it in a way already handled. Tests: `hostControlProtocol.test.ts`, `HostControlServer.test.ts`, `hostControlClient.test.ts`, `serverUpgradeIdentity.test.ts`. |
| Private control discovery  | `HOST_CONTROL_DISCOVERY_VERSION = 1`, `hostControlProtocol.ts` / `hostControlDiscovery.ts`                                        | Bounded private file, exact namespace/root/generation, authenticated running peer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| SSH deployment manifest    | `SSH_RUNTIME_MANIFEST_VERSION = 3`, `sshRuntimeManifest.ts`                                                                       | Refuse predecessor manifests 1/2 for the changed owner/pair command. Settings preflight reserves 4; the combined deployment must use fresh 5 and validate warm caches too.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Server install layout      | `SERVER_INSTALL_LAYOUT_VERSION = 1`, `serverInstallLayout.ts`                                                                     | Prefix and checkout are the only supported bundle shapes; anything else refuses startup with `ServerLayoutError` instead of misresolving resources, and explicit `PORACODE_*` asset declarations win but must be absolute existing directories. No persisted artifact carries this version, so an older deployed prefix never half-works: it either still matches a supported shape or fails the loud layout refusal until reinstalled per docs/STANDALONE_SERVER.md.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Server backup receipt      | `SERVER_BACKUP_RECEIPT_VERSION = 1`, `serverBackup.ts` (`poracode-backup.json`)                                                   | Written last, after the verified copy, as the disclosure of what was captured. Nothing imports a backup by trusting this receipt — the restore path re-verifies content through the staged-import hashing — so an older receipt never corrupts a restore; any future reader must refuse an unknown `formatVersion` instead of degrading it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Server doctor report       | `SERVER_DOCTOR_REPORT_VERSION = 1`, `serverDoctor.ts`                                                                             | Read-only diagnostics emitted fresh on every run and never persisted, so no stale report artifact can remain present; a consumer of an emitted report must refuse an unknown `formatVersion` instead of guessing section shapes. D4 adds the additive `upgradeJournal` section (absent/ok/unreadable-invalid with phase, release, expected version, backup path) and the `upgrade-journal` check; JSON consumers ignore unknown fields and no field changed meaning.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Server upgrade journal     | `SERVER_UPGRADE_JOURNAL_VERSION = 1`, `serverUpgradeJournal.ts` (`<prefix>/upgrade-journal.json`)                                 | Process-crash-safe phase journal for the per-prefix upgrade (staging → staged → draining → drained → backup-captured → swapped → candidate-started → qualified → complete, or failed/recovery-required), written with the atomic-write helper (temp file + rename) before each phase. Atomic complete writes are process-crash safety, not fsync power-loss durability: a power loss can lose the newest phase and leave an older complete phase. Contains no secrets (prefix, release paths, phase, expected version/entrypoint SHA, backup path) and is written mode 0644 so the service user that starts the staged candidate can read it. A present journal that is unusable fails closed: unreadable, not a regular file (a directory or a symlink, including a dangling one — never treated as absent), not format 1, or carrying a phase unknown to this build makes releases under the prefix hold admission and `upgrade` refuse until an explicit `--resume` or `--abandon-journal --confirm`. Recovery re-reads and re-validates the journal under the prefix lock before any effect. Version-1 field meaning is frozen; unknown future formats are never rewritten by an older reader. Adding a phase is a compatibility change: it requires a format-version bump plus a regression that still accepts the existing format-1 shape, while an older reader rejects the unknown phase as invalid (fail closed, never guessed). Tests: `serverUpgradeJournal.test.ts`, `serverUpgradeRecovery.test.ts`, `serverUpgrade.test.ts`, `serverDoctor.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                       |
| Server upgrade lock        | `SERVER_UPGRADE_LOCK_VERSION = 1`, `serverUpgradeLock.ts` (`<prefix>/upgrade.lock`)                                               | Atomic per-prefix lock record (random token, holder PID plus process start identity, release id). A corrupt or unreadable record is never stolen; a stale holder is taken over only by an atomic rename whose quarantined record still matches the record observed as stale, and `assertHeld()` fences every destructive phase. No cross-version compatibility surface exists by design: a lock is meaningful only while an upgrade process is alive, and a leftover is classified stale by process identity, never by PID alone. Windows adds the `win32:<ticks>` process-identity form (PowerShell start time; null on any failure keeps the conservative live-PID-is-holder behavior), an exclusive-create fallback when hard links are unavailable, and bounded EBUSY/EPERM/EACCES retry on unlink/rename; the record shape and version-1 field meaning are unchanged, and an unrecognized identity string simply fails the equality check, so no version bump. Tests: `serverUpgradeLock.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Remote audit log           | `REMOTE_AUDIT_LOG_VERSION = 1`, `src/host/remote/server/auditLog.ts` (`remote-audit.jsonl`, JSONL at the host data root)          | New in Gate 6 batch 4 (item 4.7): append-only, one JSON object per line (`v`, `at`, `kind`, optional `sessionId`/`detail`), never containing credential material. Readers must tolerate a torn trailing line and unknown `kind`s/fields; writes are queued off the event loop (bounded queue with a drop counter audited on recovery) and drained on SIGTERM/fatal exit; rotation is byte-counted and asynchronous (V6 A.8). Changing the line envelope or a `kind`'s meaning requires a version audit with an upgrade regression test seeded from the version-1 shape.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Only the kernel lease grants ownership. Never open an existing leased SQLite
inode through an unmanaged descriptor in its owning process: closing it can
release POSIX file locks. `cancelStartup()` retains this lease for runtime drain;
only final joined `close()` releases it. The existing unversioned headless-key
and relay-secret byte formats remain valid inside their root-bound provenance;
blank, malformed or mismatched state is refused rather than converted.

## Electron preload compatibility

The Electron preload must advertise `clientRuntimeVersion` from
`PORACODE_CLIENT_RUNTIME_VERSION`. The renderer checks this peer value before
creating its transport. Version 8 required the native quick-composer show
subscription; absent, version-6, and version-7 preload artifacts are rejected.
Version 9 stays RESERVED for the settings-authority activation. Version 10 is
the per-window delivery-ownership boundary (V4 F7 correction): the facade
additionally requires the generation-fenced recovery-barrier listener
(`onRendererStreamRecovery`) and the per-window ownership grant
(`getRendererStreamOwnershipGrant`). An older preload cannot honor recovery
barriers, so a version-8/9 preload paired with a version-10 renderer would
silently trust a cursor advanced past missing bulk after socket loss — the
version gate rejects that pairing loudly instead. Version 11 is the off-main
remote HTTP bridge boundary (V4 F8): the preload must expose
`remoteHttpBridgeVersion` plus `openRemoteHttpBridge`/`cancelRemoteHttpBridge`
and forward each request's `MessagePort` into the main world. A version-10
preload cannot deliver those ports, and the renderer no longer has a
full-body main-process HTTP path, so the facade gate must reject the pairing
loudly rather than fall back to buffering every remote response through main.
Browser runtimes use the same local facade version; this desktop boundary does
not change the remote wire, backend-host protocol, or persisted state.

Facade 12 is the settings-authority procedure boundary (Gates 2–3 batch 1): the
renderer procedure map gains the additive main-local procedures
`settingsTransactionMutate` and `settingsTransactionSnapshot`. The preload
invoke surface is generic (`invokeProcedure`) and exposes no new API, but the
renderer bundle, the main handler map, and the preload must agree on the
procedure map in lockstep, so the facade gate rejects a version-11 preload
instead of letting an older bundle disagree about which settings procedures
exist (the pre-upgrade rejection is regression-covered in
`src/renderer/clientRuntime.test.ts`, old-version list including 11). No
persisted state, remote wire, or backend-host version changes for this bump;
the new procedures are additive names inside the existing envelopes.

Facade 13 is the bounded thread-list hydration boundary (Gate 4 hazard #3): the
renderer procedure map gains the additive main-local procedure `dbGetThreadsPage`
(cursor-paginated, project-scoped counterpart of `dbGetThreads`). The same
lockstep rule applies and the gate now rejects a version-12 preload (old-version
list updated in `src/renderer/clientRuntime.test.ts`, including 12). No
persisted state, remote wire, or backend-host version change; see the bounded
thread-list surfaces note above for the full boundary audit.

Facade 14 is the renderer-stream leg deletion (V5 plan 2.5). The preload no
longer exposes `getBackendRendererStreamInfo`,
`onBackendRendererStreamChanged`, `onRendererStreamRecovery`, or
`getRendererStreamOwnershipGrant` — the direct renderer stream, its grants,
and its recovery barriers are gone, and desktop events arrive only over the
sequenced desktop-IPC relay (with its gap signal, still required). The facade
additionally advertises `ipcProcedureMapVersion` (the V5 2.6 procedure-map
handshake; the renderer asserts it typed in both Electron runtime installers)
and the `onBackendSupervisorReset` signal (the desktop-IPC relay sequence
space restarts with a new backend child, so windows drop their dedupe cursor
and rebuild). A version-13 preload cannot deliver the reset signal and still
serves the deleted stream APIs, so the gate rejects that pairing loudly
(old-version list updated in `src/renderer/clientRuntime.test.ts`,
including 13). No persisted state, remote wire, or relay change.

## Bounded thread-list surfaces (Gate 4 hazard #3)

`dbGetThreads` returns every row, so every client attach transferred the whole host
thread list (380,596 B at the 1069-thread Gate-4 fixture). Two additive bounded
surfaces now replace the full-list transfer; the unbounded read stays valid for
in-bundle non-renderer consumers (tray, attachment cleanup, headless scans):

- **Desktop (facade 13).** The renderer procedure map gains the additive main-local
  procedure `dbGetThreadsPage` (`{ limit ≤ 200, cursor?, projectId? }` →
  `{ threads, nextCursor }`), consumed by the renderer's app-store hydration in pages
  of 100. The preload invoke surface is generic and exposes no new API, but the
  renderer bundle, the main handler map, and the preload must agree on the procedure
  map in lockstep, so the facade gate rejects a version-12 preload (regression list
  updated in `clientRuntime.test.ts`). No persisted state, backend-host version, or
  remote wire change: the procedure is an additive name inside the existing
  envelopes, and an older backend loud-rejects the unknown name.
- **Remote (protocol 12, additive capability).** `GET /api/snapshot` accepts
  `threadLimit` (1–200): the response bounds the thread list to its head rows and
  carries `threadsNextCursor` (new optional field on `remoteShellSnapshotSchema` —
  present only for opted-in requests, so clients that never send the parameter never
  see the field, honoring the manifest's `unknownObjectFields: "ignore"` policy). The
  new `GET /api/threads?cursor&limit` route serves continuation pages with per-page
  `runtimeSummariesByThread`/`gitSummariesByThread` slices. `RemoteDesktopClient
.snapshot({ threadListPageLimit })` assembles the complete snapshot and treats an
  absent cursor as "complete" (legacy host). Cursors are versioned opaque strings
  (`tp1.` + base64url `(sort_order, id)`); malformed cursors are refused, never
  mispaged.
- **Contract artifacts moved together:** `manifest.json` (65 routes),
  `protocol/remote/v3/generated/*` (regenerated, `pnpm protocol:remote:v3:generate`),
  `native-parity.json` (`thread-list` and `local-image-ticket` ledgered as `planned`
  for both native platforms with absence tokens pinned in `native-parity.test.ts`),
  and the committed native e2e `operation-map.json` (224 keys, route 65; regenerated
  and reviewed per the operation-map lock). `PORACODE_REMOTE_PROTOCOL_VERSION` stays
  12: additive routes plus opt-in optional fields are capabilities, not
  wire-generation changes (same pattern as terminal cursor-sync and push routing).
- **One-time image tickets (B5b, query-token removal in V5 4.6):**
  `POST /api/files/image-ticket` (bearer, `session:read`) mints a 30-second,
  one-time, path-bound `lc_img_` ticket (256-bit, stored sha256-hashed,
  256-cap oldest-first) consumed by `GET /api/files/image?ticket=…`; any
  failed consume burns it. The legacy `access_token` query param on the image
  routes was **removed** in V5 batch 4 (item 4.6): the host accepts only the
  Authorization header or the one-time `ticket` query parameter on
  `local-image`/`runtime-image`. The registry auth label stays
  `bearer-or-query` on purpose (the wire shape "header or query credential" is
  unchanged and native strict auth-kind parsers stay valid); only the query
  credential's name and semantics changed, which is an additive regeneration,
  not a route removal. The TS client now returns "" for the first render per
  path while a mint is in flight instead of falling back to a tokened URL, so
  no client-built URL carries a bearer token. Native platforms keep
  authenticating image GETs with the bearer header, which the host still
  accepts — their generated query codecs gained the optional `ticket` field
  through regeneration; native ticket minting remains `planned`
  (absence tokens `LocalImageTicket`).
- The renderer page size (100) is the policy that keeps one page's serialized
  response inside the 64 KiB acceptance bound at realistic thread sizes; it is
  asserted per page by `snapshots.pagination.test.ts` at a 1,000-thread fixture,
  together with the unbounded response exceeding the bound.

## Remote contract registry as the single route/procedure/scope table (V5 batch 3)

- **Artifact home change:** the hand-maintained `protocol/remote/v3/manifest.json`
  is GONE. The manifest is now GENERATED at
  `protocol/remote/v3/generated/manifest.json` from the contract registry
  (`src/shared/remote/contract/`), byte-compared by
  `pnpm protocol:remote:v3:check` and `git diff -- protocol/remote/v3/generated`
  in native CI. `manifestHash`/`sourceHash` changed for this reason (the
  generated manifest also corrects two pre-existing hand-copy drifts: the
  `local-image-ticket` route's `queryParameters` and the
  `thread-start-existing` idempotency marker, both now taken from the registry).
  Every consumer of the old path was moved in the same change: conformance,
  native-parity and replay-parity tests, the registry/goldens tests, and the
  native-e2e harness (`tests/native-e2e/harness/paths.ts`). The committed
  native-e2e `operation-map.json` was regenerated for the new
  `manifestHash`/inventory `sourceHash` (224 keys unchanged). Native apps never
  read the manifest at runtime — they compile the generated bundles, which
  embed the manifest hash.
- **Router dispatch is registry-driven:** `src/host/remote/server/httpRouter.ts`
  compiles its matchers from `REMOTE_HTTP_ROUTES` and looks handlers up in an
  exhaustively-typed table (`httpRouteHandlers.ts`) keyed by the closed
  `RemoteHttpRouteId` union. Adding a route without a registry contract, or a
  registry route without a handler, is a typecheck error; the former
  regex-over-router-source conformance gate was deleted as structurally
  impossible. Route scopes are enforced by the dispatcher from the registry
  contract (`requireBearer` once per bearer route), so registry scopes are the
  wire truth; procedure-defined routes keep their per-procedure scope check.
- **Per-route scopes flow to every client from one generation:** the generated
  manifest carries `httpRoutes[].scopes`, the Swift/Kotlin bundles embed them
  in `RemoteRouteDescriptor.scopes`, and the native parity ledger
  (`native-parity.json`) restates them per route with an equality check in
  `native-parity.test.ts`. No wire shape changed: envelopes, payloads, and
  status codes are untouched; this batch restructured where the truth lives.

## Pairing scope presets (V5 batch 4, item 4.3)

- `src/shared/remote/protocol.ts` now names two pairing-scope presets:
  `REMOTE_OPERATOR_SCOPES` (the pairing default; identical to the historical
  `REMOTE_STANDARD_SCOPES` full set) and `REMOTE_VIEWER_SCOPES`
  (`["session:read", "terminal:read"]`, the read-only split). Presets are
  host- and client-side vocabulary only: no wire schema changed, so
  `PORACODE_REMOTE_PROTOCOL_VERSION` and the generated bindings are untouched
  (`pnpm protocol:remote:v3:check` stays byte-stable). A later additive
  `preset` field on the token-exchange payload would be the wire-visible form
  for native clients and requires regeneration at that point.
- The pairing credential remains the scope ceiling and the exchange still
  rejects over-requests (`compatibility.unknownClientRequestedScopes: "reject"`
  is unchanged): a client pairs into the viewer preset by requesting
  `REMOTE_VIEWER_SCOPES` (or no scopes, inheriting the grant) against a
  viewer-scoped pairing credential. The desktop renderer
  (`remoteServersStore.ts`) now requests the operator preset by name; the
  persisted `RemoteServerRecord.scopes` continue to come from the
  server-echoed grant, so an operator-preset request against a narrower
  credential fails loudly at pairing rather than silently widening.
- Enforcement is the dispatcher's registry-driven scope gate
  (`httpRouter.ts`), proven per route by
  `RemoteAccessServer.scopePresets.test.ts`, which enumerates the mutating and
  read-only route matrices from `REMOTE_HTTP_ROUTES` itself.

## Generated pairing state machine (V5 batch 5, item 5.2)

- **One spec, three consumers.** `src/shared/remote/contract/pairingMachineSpec.ts`
  declares the pairing intent states/events/guards, the failure-phase
  transition table, the one-shot candidate fingerprint (sha256 over
  `endpoint \u0001 credential`), both duplicate-detection policies (in-flight +
  last-succeeded tracker; process-lifetime consumed set), the deep-link
  confirmation policy, and the scope-request policy.
  `contract/native/emitPairing{Swift,Kotlin}.ts` render it into the native
  bundles as `swift/PairingMachine.swift` and `kotlin/PairingMachine.kt` under
  the same byte-stability, hash, size, and 450-line gates as the wire bindings
  (`native/generate.ts` fails closed if the spec is not exhaustive);
  `contract/pairingMachine.ts` is the executable TS reference the contract
  tests pin vectors against.
- **Native-bindings manifest format 1 → 2** (`native-bindings.json`): the
  manifest now declares a `stateMachines` section and
  `counts.pairingStateMachines`. Every mirrored pin moved with the bump in the
  same change: `GeneratedRemoteV3Contract.expectedNativeBundleManifestFormatVersion`
  (iOS startup check), the `verifyRemoteV3NativeBindings` gradle pin, the
  Android JVM `GeneratedRemoteV3ManifestTest`, and the generator's own
  `generate.test.ts`. An old reader refuses a v2 manifest fail-closed; a v1
  manifest cannot list the new source shards, and both apps' directory
  membership checks refuse extra files, so a torn bundle cannot half-adopt the
  machine.
- **No wire change.** The pairing spec is deliberately not part of the wire IR
  (`buildRemoteV3IrDocument` never reads it), so `sourceHash`/`manifestHash` —
  and therefore the native-e2e `operation-map.json` — are unchanged.
- **Hand-written copies deleted.** iOS `PendingPairingState` /
  `DeepLinkPairingPolicy` / `PairingCandidateTracker` and Android
  `PairingIntentDecisions` / `PairingPhaseMapping` are gone; the apps keep
  thin app-owned facades only for API stability (`RemoteAccessScopes`,
  `SessionPolicies.shouldShowBrowsableConfirm` / `sanitizedHostLabel`,
  `PairingFailurePhaseMapper`, `ProtocolConstants.STANDARD_SCOPES`) that
  delegate to the generated machine. The existing iOS/Android pairing tests
  pass unchanged in shape against the generated sources.
- **Intentional behavior unification.** The candidate fingerprint recipe is now
  identical across platforms (Android previously hashed a trimmed/lowercased
  endpoint with a `\u0000` separator; iOS hashed the raw endpoint with
  `\u0001`). Digests are process-memory-only on both platforms — never
  persisted, never logged — so no migration is required; the spec is the single
  recipe going forward.
- **TS convergence is a recorded follow-up.** The renderer pairing flow
  (`remoteServersStore.ts`) remains hand-written this pass (renderer files sit
  outside the contract tree); converging it onto the spec executor is the
  outstanding 5.2 remainder.

## Generated terminal-cursor state machine + native-bindings manifest format 3 (V5 plan item 5.2, remainder)

- **One spec, three consumers.**
  `src/shared/remote/contract/terminalCursorMachineSpec.ts` declares the
  terminal-cursor reconciliation machine: frame kinds, consumer actions (the
  parity-fixture tokens), resync reasons (with `stale-watch` as an
  informational, never-resyncing annotation), the UTF-16 bounds (200_000-unit
  transcript tail; pre-baseline buffer bounded by 200_000 units AND 1024
  frames — iOS previously lacked the frame bound), and the ordered first-match
  rule table. `contract/native/emitTerminalCursor{Swift,Kotlin}.ts` render it
  into `swift/TerminalCursorMachine.swift` and
  `kotlin/TerminalCursorMachine.kt` under the same byte-stability, hash, size,
  and 450-line gates as the wire bindings;
  `contract/terminalCursorMachine.ts` is the executable TS reference the
  contract tests run against the shared parity tape
  (`protocol/remote/v3/fixtures/terminal-cursor-sequence.json`).
- **Native-bindings manifest format 2 → 3** (`native-bindings.json`): counts
  gained `stateMachines` (2 — the pairing machine plus the cursor machine;
  `counts.pairingStateMachines` is retired) and the `stateMachines` array
  gained the `terminalCursor` entry (rule/guard/action/reason counts, bound,
  and source shards `swift/TerminalCursorMachine.swift` /
  `kotlin/TerminalCursorMachine.kt`). Every mirrored pin moved with the bump
  in the same change: `GeneratedRemoteV3Contract.
expectedNativeBundleManifestFormatVersion` (iOS startup check, refuses v2
  fail-closed), the `verifyRemoteV3NativeBindings` gradle pin,
  `GeneratedRemoteV3ManifestTest`, and the generator's own
  `native/generate.test.ts`. Both apps' directory-membership checks refuse
  extra files, so a v2 app cannot half-adopt the new shard.
- **No wire change.** The cursor spec is deliberately not part of the wire IR
  (`buildRemoteV3IrDocument` never reads it), so `sourceHash`/`manifestHash`
  are unchanged; only `outputHash` moved (new files).
- **Hand-written copies deleted.** iOS `TerminalCursorReconciler.swift` and
  Android `TerminalCursorReconciler.kt` (reconciler + state/action types) are
  gone; consumers import the generated types
  (`com.poracode.remote.v3.generated.TerminalCursor*` on Android, same-target
  names on iOS). The per-platform JSON frame decoders stay hand-written
  coordinators (iOS `TerminalCursorFrameDecoder.swift` over `RichJSON`,
  Android `TerminalCursorFrameDecoder.kt` over `kotlinx.serialization`) —
  `terminalCursorMachine.ts#decodeTerminalCursorFrameMessage` is the
  normative reference they are tested against. The parity fixture tests run
  unchanged in shape against the generated machines; the Android
  frame-count-bound test (`TerminalCursorBufferBoundTest`) now passes on both
  platforms.
- **Renderer pairing convergence, recorded per 5.2** (same slice): the
  renderer now consumes `contract/pairingMachine.ts` — which required moving
  the fingerprint digest to the browser-safe pure-TS `contract/sha256.ts`
  (`node:crypto` cannot enter the renderer bundle; digests are byte-identical
  to Node's, pinned in `sha256.test.ts`). The web deep-link intake
  (`bootstrap.ts`) applies the executor's consumed-set duplicate policy over
  the same host+credential key material as the retired raw `host\0token` set;
  `usePairing.ts`, `pairingDirect.ts`, and the mobile settings sheet drive the
  executor's direct in-app path (candidate → beginPair → commit/failed). The
  QR-scanned PWA link still pairs without the spec's external-confirmation
  stop (treated as the direct in-app path); routing scanned links through the
  external `pendingConfirmation` stop — as the natives already do for
  browsable intents — is the recorded follow-up divergence. The TS renderer
  terminal feed (`remoteTerminalFeed.ts`) keeps its own hand-written cursor
  reconciliation this pass (renderer terminal feed files are outside this
  lane's pairing-scoped renderer surface); converging it onto
  `terminalCursorMachine.ts` is the recorded follow-up.

## Generated terminal hardware-key encoder + native-bindings manifest format 4 (deep-review consolidation)

- **One spec, three consumers.**
  `src/shared/remote/contract/terminalKeyEncodingSpec.ts` declares the PTY
  byte encoding for one normalized hardware-keyboard press: the normalized
  key set, the modifier flags (shift=1, alt=2, ctrl=4, meta=8 — the values
  double as the xterm CSI-u modifier contributions, so the wire parameter is
  `1 + sum(set flags)`), the bare-key sequences, the arrow suffixes, the
  CSI-u code points, the C0 fold band (0x40..0x5F), the scalar bounds, and
  the ordered first-match rule table ending in a passthrough catch-all.
  `contract/native/emitTerminalKeyEncoding{Swift,Kotlin}.ts` render it into
  `swift/TerminalKeyEncoding.swift` (`TerminalHardwareKeyEvent` +
  `TerminalRawKeyEncoder.encode`) and `kotlin/TerminalKeyEncoding.kt`
  (`TerminalHardwareKey` + `terminalHardwareKeySequence`) under the same
  byte-stability, hash, size, and 450-line gates as the wire bindings;
  `contract/terminalKeyEncoding.ts` is the executable TS reference the
  contract tests pin the shared vector table against.
- **Native-bindings manifest format 3 → 4** (`native-bindings.json`):
  `counts.stateMachines` moves 2 → 3 and the `stateMachines` array gains the
  `terminalKeyEncoding` entry (key/rule/guard/effect counts and source shards
  `swift/TerminalKeyEncoding.swift` / `kotlin/TerminalKeyEncoding.kt`). Every
  mirrored pin moved with the bump in the same change:
  `GeneratedRemoteV3Contract.expectedNativeBundleManifestFormatVersion` (iOS
  startup check, refuses v3 fail-closed), the `verifyRemoteV3NativeBindings`
  gradle pin, `GeneratedRemoteV3ManifestTest`, and the generator's own
  `native/generate.test.ts`. Both apps' directory-membership checks refuse
  extra files, so a v3 app cannot half-adopt the new shard.
- **No wire change.** The encoder spec is deliberately not part of the wire
  IR (`buildRemoteV3IrDocument` never reads it), so `sourceHash`/`manifestHash`
  — and therefore `manifest.json`/`ir.json` — are byte-identical; only
  `outputHash` moved (the new shards).
- **Hand-written copies deleted.** Android `terminalHardwareKeySequence` +
  `TerminalHardwareKey` + their lookup extensions (in
  `TerminalKeyAccessory.kt`) and iOS `TerminalRawKeyEncoder` +
  `TerminalHardwareKeyEvent` (in `TerminalRawKeyInput.swift`) are gone;
  consumers import the generated encoder (same-name types, so only the
  import lines moved). Event normalization stays a hand-written per-platform
  coordinator exactly like the terminal-cursor JSON decoders: Android
  `terminalHardwareKey(Key)` over Compose `Key`, iOS
  `TerminalTranscriptView.terminalEvent` over `UIPress`. The Android
  on-screen accessory encoder (`terminalVirtualKeySequence`) is a separate
  app-owned surface (its Ctrl toggle deliberately keeps classic sequences
  for non-arrow/non-letter keys) and is not generated.
- **Reconciled divergences (the spec decides; both platforms now ship the
  same behavior).** (1) Ctrl-only/ Ctrl+Shift on a fold-band miss (Ctrl+1,
  Ctrl+Space, Ctrl+Delete): Android emitted the xterm CSI-u form while iOS
  silently dropped the modifier and passed the character through,
  contradicting both doc comments — the spec keeps CSI-u. (2) A character
  with no single scalar code point: iOS fell back to the bare sequence while
  Android emitted CSI-u with the first UTF-16 unit — a lone surrogate for
  supplementary input, i.e. a broken escape — the spec keeps the fallback and
  maps single supplementary scalars by code point, not UTF-16 unit. (3) The
  C0 fold width: Android required one UTF-16 unit, iOS one UTF-8 byte — the
  spec measures Unicode scalars, which also removes Android's latent
  `.single()` crash on Ctrl+'ß' (two-scalar uppercase "SS" neither folds nor
  maps, so it passes through). The reconciled rows are pinned as vectors in
  the TS contract test, `TerminalKeyAccessoryTest`, and
  `TerminalRawKeyInputTests`.

## Generated background-task reduce + follow-up queue + native-bindings manifest format 5 (V6 E.3)

- **One spec, three consumers.**
  `src/shared/remote/contract/backgroundTaskReduceSpec.ts` and
  `followUpQueueMachineSpec.ts` declare the reducers the three clients used
  to hand-triplicate. `contract/native/emitBackgroundTaskReduce{Swift,Kotlin}.ts`
  and `emitFollowUpQueue{Swift,Kotlin}.ts` render them into
  `swift/BackgroundTaskReduce.swift` / `kotlin/BackgroundTaskReduce.kt` and
  `swift/FollowUpQueueMachine.swift` / `kotlin/FollowUpQueueMachine.kt` under
  the same byte-stability, hash, size, and 450-line gates as the wire
  bindings; `contract/backgroundTaskReduce.ts` and `followUpQueueMachine.ts`
  are the executable TS references.
- **Native-bindings manifest format 4 → 5** (`native-bindings.json`):
  `counts.stateMachines` moves 3 → 5 and the `stateMachines` array gains the
  `backgroundTaskReduce` and `followUpQueue` entries. Every mirrored pin
  moved with the bump in the same change:
  `GeneratedRemoteV3Contract.expectedNativeBundleManifestFormatVersion` (iOS
  startup check, refuses v4 fail-closed), the `verifyRemoteV3NativeBindings`
  gradle pin, `GeneratedRemoteV3ManifestTest`, and the generator's own
  `native/generate.test.ts`. Both apps' directory-membership checks refuse
  extra files, so a v4 app cannot half-adopt the new shards.
- **No wire change.** The reducer specs are deliberately not part of the
  wire IR (`buildRemoteV3IrDocument` never reads them), so
  `sourceHash`/`manifestHash` — and therefore `manifest.json`/`ir.json` —
  are byte-identical; only `outputHash` moved (the new shards).
- **Hand-written copies deleted.** iOS `RuntimeEventReducer` and Android
  `RuntimeThreadState` call the generated background-task reduce; iOS
  `RichChatTranscriptController` and Android `RichReducer` call the
  generated follow-up queue action. Old-reader: a format-4 native bundle
  refuses format 5 at startup.

## mDNS advertiser contract (V5 plan item P4)

- **Discovery wire boundary.** `src/host/remote/mdnsAdvertiser.ts` speaks
  RFC 6762/6763: service type `_poracode._tcp.local`, one record set per
  host — PTR (shared, class IN, TTL 4500), SRV + TXT (unique, cache-flush,
  TTL 4500), A (TTL 120, IPv4 hosts only) — announced twice ~1 s apart, then
  every 5 minutes, with a bounded query responder (service-type PTR/ANY
  questions only). TXT entries: `id=<desktopId>` and
  `fp=sha256:<leaf-certificate-hex>` — the same fingerprint the pairing QR
  carries, so discoverers can pin on first connect. The builders are pure
  functions pinned by an independently written RFC parser and a golden byte
  fixture (`mdnsAdvertiser.test.ts`); treat any TXT key, TTL, or class change
  as a compatibility change for older discoverers (they ignore unknown TXT
  keys, but `fp`/`id` consumers are versioned by this entry).
- **Decision boundary.** `shouldAdvertiseMdns` is the single advertise
  decision: default off in `loopback` mode, on only for TLS-configured
  `lan`/`tailnet` binds, overridable per-process by
  `PORACODE_REMOTE_MDNS=0|false|1|true` (forcing cannot advertise a plaintext
  listener — there is no fingerprint). The env name is the compatibility
  surface for deployments/scripts.
- **Native discovery surfaces.** iOS declares `_poracode._tcp` in
  `NSBonjourServices` (Info.plist) — required for local-network browsing and
  part of the app's permission surface; Android uses `NsdManager` with no new
  permission. Both parse the TXT `fp` into the discovered-host model. Native
  TLS-handshake enforcement of that fingerprint (TOFU pin-on-first-connect,
  matching the PWA's `#fp=` machinery) is a recorded follow-up; until it
  lands, the native transports treat the endpoint as ordinary HTTPS.

## Remote TLS, token lifecycle, and operability routes (V5 batch 4, items 4.2/4.6 + 4.9 rider)

- **TLS for direct connections (4.2).** `PORACODE_REMOTE_TLS_CERT` +
  `PORACODE_REMOTE_TLS_KEY` (paths, set together) switch the remote listener
  to HTTPS (`RemoteAccessServer.tls` option; the composition roots resolve the
  material from the environment through `loadRemoteAccessTlsMaterial` in
  `src/host/remote/server/tlsMaterial.ts`). A partial or unloadable
  configuration is a loud startup failure — it never downgrades an operator
  who asked for encryption to plaintext. A TLS-backed wildcard (`lan`) bind no
  longer needs `PORACODE_ALLOW_PLAINTEXT_LAN=1`. The pairing URL gains the
  ADDITIVE `#fp=sha256:<64-hex>` fragment carrying the leaf certificate's
  SHA-256 fingerprint (`pairingUrl.ts`); clients that ignore it pair exactly
  as before. The TS client pins on first pair (TOFU anchored by the QR
  assertion, probed through a `certFingerprintProbe` transport hook) and
  refuses (`certificate_fingerprint_mismatch`, before credentials are sent)
  on mismatch; the renderer persists pins in localStorage beside the server
  records (`remoteServersStore.ts`, key `poracode.remoteServerCertPins`) and
  drops them with the record. No wire envelope, schema, or version changed —
  the fragment is inside the existing pairing URL string.
- **Token lifecycle (4.6).** Access tokens now live 24 hours and every
  pairing/exchange mints a rotating refresh token with a fixed 30-day
  absolute deadline; the exchange RESULT gained the additive optional
  `refreshToken`/`refreshTokenExpiresAt` fields, and the token-exchange
  PAYLOAD gained the additive `refresh_token` grant type plus an optional
  `refreshToken` field (`src/shared/remote/protocol.ts`). Older clients strip
  the unknown response fields (Zod default) and never send the new grant;
  older hosts reject it loudly, and the TS client then surfaces the original
  401 rather than a grant-endpoint error. A server-side revocation list
  (hashes of the access AND refresh halves, remembered until their natural
  expiry) rides the existing `remote-access-auth.json` shape as the additive
  `revokedTokenHashes` array (default `[]`) and per-session additive
  `refreshTokenHash`/`refreshExpiresAtMs` fields: old hosts strip them
  (sessions keep their remaining validity), new hosts read old files
  unchanged (pre-refresh 30-day sessions stay valid; regression-tested).
  The renderer keeps refresh tokens in the existing encrypted WebCrypto vault
  (not in the Zustand persist — no store-version change) and rotates them
  transparently on the first 401 of an expired access token.
- **Operability routes (4.9 rider).** `GET /healthz` (fixed `{ok:true}`, no
  auth, discloses nothing) and `GET /metrics` (loopback-peer-gated snapshot)
  are registry contracts (`src/shared/remote/contract/routes/ops.ts`), so
  route counts moved 65→67 everywhere: the generated artifacts
  (`pnpm protocol:remote:v3:generate`), the native parity ledger
  (`unsupported-by-wire` on both platforms — natives never consume them),
  the committed native-e2e `operation-map.json` (226 keys), and the pinned
  counts in `registry.test.ts`, `generate.test.ts`, `routeGoldens.test.ts`,
  `operationMap.ts/.test.ts`, `foundationCoverage.test.ts`, and
  `unsupportedLedger.test.ts`. `PORACODE_REMOTE_PROTOCOL_VERSION` stays 12:
  additive routes and opt-in optional fields are capabilities under the
  established pattern. The native-e2e mock's `bearerToken` helper is now
  header-only, mirroring the removed `?access_token=` acceptance.

## Client transport cursor and engine scoping (V5 batch 2, items 2.1/2.2/2.6)

Two behavior contracts changed for the remote event socket and the client
decode engine; both are process-local (no persisted state, no remote wire
change):

- **Applied-cursor rule (2.1).** The per-server resume watermark
  (`remoteServerSnapshotSeq`) now advances only AFTER a frame is applied —
  dispatched, replayed from the recovery queue, or filtered out — never on
  receipt, and never past a frame the client provably dropped. The remote WS
  server delivers every seq to a connected client contiguously, so the
  session treats `seq > watermark + 1` as a client-detected loss: it marks
  the session resync-required and reconnects from the last applied seq, then
  re-baselines interested threads from authoritative snapshots. The same
  loss path handles engine-dropped frames: a rejected `decodeRemote`
  (overflow/reset) and the engine overflow listener both reconnect instead
  of swallowing the frame. Frames parked in the recovery queue advance the
  cursor only when replayed, so a failed recovery never skips them. Fixtures
  that hand-craft event streams must deliver seqs densely (see
  `deliverFillersThrough` in `remoteServersStore.test.ts`).
- **Per-consumer decode engines (2.2).** The former process-wide
  `getClientEngineHost()` singleton is gone. `clientEngineHost.ts` exposes
  three independent engines (`getBackendStreamEngine`,
  `getRemoteSocketEngine`, `getPersistJsonEngine`), each with its own
  generation, pending set, overflow handlers, and worker. A loopback
  renderer-stream close resets only the backend-stream engine, so remote
  socket decodes and Zustand persist JSON work can no longer be rejected as
  collateral and silently report state as absent. Do not reintroduce a
  shared engine accessor.
- **Typed protocol mismatches (2.6).** Both versioned boundaries here reject
  typed instead of dropping: the engine worker answers a foreign-version
  request with `protocol-mismatch` and the host rejects pending work with
  `ClientEngineProtocolMismatchError` (then falls back to sync decode), and
  the IPC procedure map gate is `assertIpcProcedureMapVersion` (see the
  wire-protocol table rows above).

## Off-main remote HTTP bridge contract (facade 11 / bridge frame set 3)

`src/shared/remote/httpBridgeProtocol.ts` owns the versioned frame set for the
utility-process HTTP bridge introduced by V4 F8; main-side admission schemas
live in `src/shared/remote/httpBridgeValidation.ts`.

- `REMOTE_HTTP_BRIDGE_VERSION = 3` gates two surfaces: main → utility control
  messages (`open` with the admission descriptor, `cancel`, `abort-window`,
  `abort-all`, `stats-query`) and the per-request renderer ⇄ utility port
  frames (`upload-chunk`, `upload-end`, `credit`, `cancel` upstream;
  `upload-grant`, `head`, `chunk`, `end`, `error` downstream). Worker → main
  `settled` and `stats-reply` messages close the control loop.
- Version 3 carries an optional exact TLS leaf fingerprint on each request (`null` explicitly clears prior endpoint trust; omitted preserves it), plus a certificate-mismatch error code. The utility binds it to the actual HTTPS connection before releasing headers or body, and refuses redirects on pinned calls. Version-2 descriptors are rejected; the preload marker and renderer gate derive from the same constant. Facade 11 stays unchanged because the bridge frame-set gate owns this compatibility boundary.
- Version 2 is an intentional bump with real compatibility meaning: v2 adds
  the downstream `upload-grant` acknowledgement that makes uploads
  admission-gated and credit-bounded, and it gives responses a metadata budget
  separate from the stricter request budget (a v1 renderer would post a whole
  body before utility admission and reject legal response header shapes). The
  version is mirrored by the preload's advertised `remoteHttpBridgeVersion`
  marker and the renderer client's `resolveDefaultTransport` gate, so a
  mismatched pairing is rejected loudly even at the same facade 11.
- The renderer facade version `PORACODE_CLIENT_RUNTIME_VERSION` moved 10 → 11
  for this milestone (see above) and stays 11 for both corrections: the
  required preload API shape (`remoteHttpBridgeVersion`, open/cancel, port
  forwarding) is unchanged, and the bridge frame-set gate rejects a mixed
  frame set on its own. Facade 9 stays RESERVED.
- Correction 2 keeps frame set 2: admission is reserved synchronously before
  the shared utility start yields (caps include pending starts, and pre-port
  cancels/window lifecycle events retire the reservation), the post-await
  revalidation plus expected-record-identity releases fence a stale
  continuation or settlement from a reused id, the utility emits its existing
  `settled` control frame for valid rejected opens so main releases the slot
  immediately (duplicate and malformed descriptors emit nothing), upload chunks
  are posted as exact-length copies instead of subarray views of the caller's
  backing store, and the utility clamps accumulated response credit to the
  advertised 1 MiB ceiling. None of these changes a frame shape, so no version
  bump; the peer inventory (preload marker, renderer gate, utility entry,
  preload port forwarding, packaging `asarUnpack`) is unchanged.
- Compatibility: a generation mismatch closes the request and settles it; no
  frame may revive a retired request or consume another request's credit. Any
  descriptor/frame shape change requires auditing the utility entry
  (`dist/main/remoteHttpBridge.cjs`), the preload port forwarding, the
  supervisor admission path, the renderer bridge client, and the direct-mock
  suites together.
- No persisted state participates: the bridge is process-lifetime only, so
  there is no migration. The packaging boundary is audited by the
  `dist/main/remoteHttpBridge.cjs` entry in `tsdown.config.ts` plus its
  `asarUnpack` entry in `scripts/build-desktop-artifact.mjs` (a packaged
  utility child must start from a real file path).
- Bounds pinned by tests: 64 MiB response body, 64 MiB request body, 96 MiB
  aggregate upload account (declared reservation + retained bytes; committed
  utility memory, not total RSS), 1 MiB response credit enforced on both the
  client grant and the utility accumulator, 1 MiB upload credit window,
  64/128 active requests per window/global including pending cold-start
  reservations, request metadata 64 headers/8 KiB value/32 KiB total, response
  metadata 4096 headers/16 KiB value/64 KiB total, and a 60 s whole-request
  deadline with the pre-F8 error message. The remote wire protocol (12), relay,
  and native clients are untouched by this local boundary.
- Diagnostic seam (unchanged by the correction): `PORACODE_REMOTE_HTTP_BRIDGE_DEBUG=1`
  enables utility settle logging and main lifecycle lines, but desktop builds
  minify with `dropConsole`, so those logs exist only in development builds.
  `PORACODE_REMOTE_HTTP_BRIDGE_INSPECT_PORT` forks the utility with
  `--inspect=127.0.0.1:<port>` only when `!app.isPackaged`; packaged
  verification must rely on the packaged main-process inspector and the
  payload-free stats/memory probes instead.

  Qualification note (F8 publication, 2026-09-14): this boundary is qualified
  on the frozen candidate (source SHA `74dcf4e0…c983`, bridge 2 / facade 11)
  by the independent source + real-transport and full-mock + packaged-UI
  evidence recorded in `docs/V4_EXECUTION_LOG.md`. Publication commits the
  candidate as-is with no version change.

## Off-main SSH environment contract (C3/A5)

`src/host/ssh/sshEnvironmentProtocol.ts` owns the versioned frame set between
Electron main and the device-local SSH utility process introduced by C3/A5.

- `SSH_ENVIRONMENT_PROTOCOL_VERSION = 1` gates the worker `ready` handshake,
  main → utility request frames (`discover-hosts`, `connect`, `disconnect`,
  `prepare-runtime`, `cancel`, `shutdown`) and utility → main frames (`ready`,
  `result`, `fatal`). A utility that answers with another version never becomes
  ready; main retires and kills it instead of serving requests.
- The worker configuration crosses the fork boundary as JSON in
  `PORACODE_SSH_ENVIRONMENT_CONFIG` and is validated by
  `sshEnvironmentWorkerConfigSchema`. Paths and connection payloads are
  device-local process data, never persisted; the protocol carries no frames
  across restarts, so there is no migration.
- `SshConnectionManager` remains the Electron-free mechanism owner
  (`src/host/ssh/SshConnectionManager.ts`): operation generations, config-keyed
  dedupe, waiter ownership, subprocess/tunnel tracking, and cancel-and-join
  disconnect/dispose. The desktop runs it inside the utility; backend/headless
  compositions construct it in-process, which is the headless-parity contract.
- Packaging boundary: the `dist/main/sshEnvironmentWorker.cjs` entry in
  `tsdown.config.ts` must stay outside the asar like `remoteHttpBridge.cjs`
  (artifact-lane `asarUnpack`), and the optional immutable archive directory
  (`resources/ssh-runtime-archive`) is a release resource. Any frame-shape
  change requires auditing the utility entry, the supervisor admission/fencing
  path, and the manager together.

## Renderer-stream leg deletion (V5 plan 2.5) — one desktop event path, host 14 / facade 14 / engine 2

The desktop renderer no longer has a second, renderer-direct transport. The
`BackendRendererStream` loopback WebSocket, its request/reply vocabulary
(`BackendRendererRequest`), the bounded large-reply chunked framing
(`reply-start/chunk/end/abort`, `reply-ack`, `request-cancel`), the per-window
delivery-ownership table and grants
(`set-renderer-stream-ownership`, `RendererWindowDeliveryState`,
`RendererStreamOwnershipGrant`, `RendererStreamOwnershipClaim`), the targeted
fallback-copy envelopes (`supervisor-event.target`), and the generation-fenced
recovery barriers (`renderer-stream-recovery`) are GONE, together with
`BACKEND_RENDERER_STREAM_VERSION` (last 6, never published) and the
`getBackendStreamEngine` consumer.

- **`BACKEND_HOST_PROTOCOL_VERSION` 13 → 14** (`src/shared/backendHostProtocol.ts`):
  the deleted operation and envelope shapes are refused at the request and
  outbound gates (a v13 backend child fails both directions instead of
  half-serving a deleted transport), and a `supervisor-event` envelope that
  still carries targeting metadata is invalid. The relay is the legacy
  full-relay shape again: every `supervisor-event` crosses untargeted with its
  host-lifetime monotonic `rendererSequence`; windows dedupe by sequence;
  IPC shedding recovers through `supervisor-event-gap` (unchanged, and now the
  only recovery signal); `call-supervisor.originWindowId` still scopes
  terminal-bootstrap retention from the authenticated IPC sender. Host and
  main ship in one bundle, so the bump gates stale artifacts rather than
  cross-version production pairs.
- **Facade `PORACODE_CLIENT_RUNTIME_VERSION` 13 → 14** (see the preload
  compatibility section): the four stream bridge APIs are replaced by
  `ipcProcedureMapVersion` (the wired V5 2.6 handshake) and
  `onBackendSupervisorReset` (new `backendSupervisorReset` IPC channel;
  windows drop their dedupe cursor and rebuild subscribed state when a
  replacement backend child restarts the sequence space).
- **Client engine protocol 1 → 2**: the `decode-backend` work type left with
  the transport; the per-consumer engines are now the remote socket and the
  persist-JSON engines only (the T2 isolation rule — never reintroduce a
  shared engine — is unchanged).
- **What deliberately did NOT move:** the desktop event intake stays on the
  desktop-IPC relay, NOT the loopback remote HTTP+WS server. The remote wire
  deliberately does not carry the full desktop event surface — PTY bytes ride
  the opt-in `terminal-watch` frames instead of the replayable stream,
  `REMOTELY_CONSUMED_EVENT_TYPES` withholds desktop-only supervisor events
  (provider usage, workflow events, …), and `capBroadcastEvent` strips largest
  payload fields. Porting the desktop renderer onto that wire would therefore
  lose desktop features or require contract changes (a separate, deliberate
  decision). Requests keep flowing over the surviving main→backend
  `call-supervisor`/`call-database`/`call-service` operations, which the tray
  and shell consumers already require. The collapsed path deletes the
  redundant second implementation (stream + grants + chunking + recovery),
  which was the H4 redundancy.

## Desktop-internal loopback sessions (V5 plan 2.5 continuation) — additive remote-wire surface, no version bump

The wire-level blockers that stopped the loopback unification sub-item are
resolved with an ADDITIVE, admission-gated extension of the remote protocol.
The co-located desktop renderer can now consume the withheld desktop event
families over the loopback server without widening the surface any external or
native client sees.

- **New server message `desktop-event`** (`src/shared/remote/protocol.ts`,
  carried verbatim in the generated manifest via
  `REMOTE_DESKTOP_INTERNAL_MESSAGES` in `protocolFacts.ts`): `{type, seq,
event}` where `event` is a desktop-only `SupervisorEvent`
  (`DESKTOP_INTERNAL_EVENT_TYPES` in `RemoteAccessServer.ts` — provider usage,
  LSP, OSC, crossagent, experiment judging, `thread-voice`,
  `thread-scrollback-resync`, `agent-detected`, `git-changed`,
  `project-tree-changed`). It rides a SECOND bounded replayable buffer with its
  own contiguous `desktopSeq`, fully independent of the shared `event`
  sequence, so external clients' replay-contiguity contract never observes a
  desktop-only type. `thread-output` is absent from BOTH streams by design
  (PTY bytes stay on the terminal path).
- **New `/ws` handshake query parameters** `desktopInternal` (`0-or-1`) and
  `lastDesktopSeq` (`int`), declared in `WEBSOCKET_QUERY_CODECS` and the
  `desktopInternalStream` compatibility-policy block. Admission is
  loopback-origin gated in `wsConnections.ts`: the parameter counts only when
  the upgrade socket's remote address is loopback (IPv4, IPv6, IPv4-mapped,
  or a unix socket's empty address); a remote peer sending it is admitted as
  an ordinary session. Fail-closed by construction.
- **Version policy: no bump, both directions safe.** The protocol's
  compatibility policy treats unknown server-message discriminators as
  accept-and-ignore, so an OLD client never receives the frame (the server
  gates delivery per connection) and cannot be broken by its existence; an OLD
  server ignores the two new query parameters, so a NEW desktop client
  degrades to an ordinary session (live shared events only) and keeps
  working. `PORACODE_REMOTE_PROTOCOL_VERSION` (12) is unchanged.
- **Generated artifacts**: `pnpm protocol:remote:v3:generate` regenerated
  `protocol/remote/v3/generated/**` (manifest, IR, JSON-schema bundle,
  inventory, Swift/Kotlin bindings) so the `manifestHash`/`sourceHash` pins
  moved together in one generation — the single-source pipeline, not a hand
  mirror.
- **Renderer intake boundary** (`state/remoteServers/desktopLoopbackIntake.ts`
  - `ElectronBackendTransport`): the intake bootstraps through the EXISTING
    `getRemoteAccessPairing` main-local procedure and the standard
    pairing-token → access-token → WS-ticket HTTP flow, so no preload surface,
    IPC channel, or `standaloneAttachInfo` field changed. The pairing
    credential it consumes is the same single-use startup credential the
    desktop already mints per server start (consuming it participates in the
    existing rotation; the renderer is just a new consumer of an existing
    boundary). The intake joins live-only (no replay cursors) and recovers
    through the transport's rebuild dispatch — the same primitive the relay's
    shed/gap signals use — so no desktop reducer gained seq-replay obligations.
- **Completion (V5 plan 2.5, final):** the three recorded not-yet-moved
  sub-items landed; see the section below.

## Loopback 2.5 completion — terminal-watch migration, loopback request routing, always-on managed server — additive, no version bumps

The last three 2.5 sub-items moved the desktop's terminal bytes, its managed
requests, and the server guarantee itself onto the loopback leg. The version
verdict first, boundary by boundary:

- **Remote wire (`PORACODE_REMOTE_PROTOCOL_VERSION`, 12): unchanged, generated
  artifacts untouched.** The terminal migration consumes the EXISTING
  `terminal-watch` / `terminal-output` / cursor-sync v1/v2 surface (the
  desktop-internal admission from the 2.5 continuation). The request-routing
  and bootstrap surfaces below ride desktop-internal IPC, not the remote
  manifest; `pnpm protocol:remote:v3:check` stays green with the existing
  `manifestHash`/`sourceHash` pins.
- **IPC procedure map (`IPC_PROCEDURE_MAP_VERSION`, 1): additive name, version
  stays, fingerprint pin moved.** One new main-local procedure,
  `getManagedLoopbackBootstrap`, was added; every peer loud-rejects unknown
  names, so per the map's recorded rule the version stays 1 and the pinned
  fingerprint in `procedureMapVersion.test.ts` was refreshed to force exactly
  this review.
- **Backend-host protocol (14): additive same-build service name.**
  `getManagedLoopbackBootstrap` mirrors through `BackendServiceProcedureMap`;
  main and the backend child ship in one bundle, so no protocol bump (the
  same rule as the `dataFencePath` field).
- **`standaloneAttachInfo` / attach bootstrap: untouched.** The managed
  bootstrap payload is a separate surface; attach mode and the standalone
  server are unaffected.

The three sub-items:

- **Terminal UI on `terminal-watch`.** Local (managed) terminal surfaces
  subscribe through `watchManagedTerminal` (`remoteTerminalFeed.ts`) instead
  of the raw relay subscription: while the loopback leg is active, PTY bytes
  and terminal lifecycle ride the loopback session's `terminal-watch`
  machinery (v2 chunked baselines + cursor sync, v1 downgrade preserved),
  exactly as remote terminals always have; while it is down there is no IPC
  `thread-output` data plane (V6 B.6). The transport's rebuild dispatch
  (`thread-scrollback-resync`) drives scrollback-recovery rehydration on
  every leg flip. Renderer terminal interest leases are still held in both
  modes, so backend retention and rebuild scope do not change. The terminal
  surface contract (real PTY, byte-exact output, Ctrl chords, resize
  propagation, scrollback persistence) is regression-covered on the unified
  path against a real `RemoteAccessServer`
  (`desktopLoopbackUnification.test.ts`).
- **Loopback request routing.** While the loopback leg is active, managed
  remote-routable requests (the `REMOTE_PROCEDURE_ROUTES` set) route over the
  loopback HTTP leg through an ephemeral, in-memory owner row
  (`hostTransport/managedIdentity.ts`, internal routing key `managed-loopback`
  — a literal that can never collide with a UUID `desktopId`). The managed
  host mirrors attach mode's owner-row routing for the desktop's OWN
  entities: identity owners (managed rows are not projected), with local
  location payloads stamped `remoteServerId` by `stampRemoteOwnerOntoPayload`
  (the router's `unprojectRemotePayload` strips the stamp before the wire, so
  the request the server sees is byte-identical). Persisted paired owners
  still resolve first, so desktop-as-client routing is unchanged. V6 B.6:
  a loopback transport failure is not retried over preload IPC. The 32 MiB
  large-reply acceptance runs on the loopback HTTP path only.
- **Always-on managed server + bootstrap payload.** The desktop-managed
  flavor ALWAYS has a loopback `RemoteAccessServer` running from readiness:
  `startIfEnabled` starts unconditionally — the full (advertised) instance
  when remote access is enabled, otherwise a loopback-only instance whose
  bind is pinned to `127.0.0.1` regardless of bind-mode env. The loopback
  instance is reachable but never discoverable: the user-facing pairing
  surface (`getPairingInfo`, the `remote-access-pairing-changed` broadcast,
  and `refreshRemoteAccessPairing`'s QR rotation) reports `disabled` while
  only the loopback instance runs, and no pairing URL is logged for it.
  Enabling upgrades (replaces the loopback-only instance), disabling
  downgrades to it — the full stop path is deleted. The renderer learns the
  attach point through the **managed bootstrap payload**
  (`ManagedLoopbackBootstrap` = `{ endpoint: <loopback http origin>,
pairingUrl: <loopback pairing URL with the single-use `#token=` credential> }`)
  served by `getManagedLoopbackBootstrap`; the controller serializes behind
  readiness, so the server is running and a fresh dedicated credential
  (`mintLoopbackRendererCredential`, which never rotates the displayed QR)
  is minted before the renderer asks. On leg loss the renderer re-asks the
  bootstrap (fresh endpoint/credential after a server restart); a failed
  attempt retries on the discovery interval. V6 B.6: preload IPC is bootstrap
  plus local-shell only; there is no live event/PTY/non-shell request relay.

## Local delivery-ownership wire boundary (backend-host 13 / renderer stream 5) — SUPERSEDED, deleted in V5 2.5

> **DELETED (V5 plan 2.5, host protocol 14 / facade 14 / engine protocol 2).**
> The entire renderer-stream leg this section describes — the per-window
> delivery-ownership table, minted grants, targeted fallback copies,
> generation-fenced recovery barriers, and `BACKEND_RENDERER_STREAM_VERSION`
> itself — was removed together with the desktop-IPC relay becoming the sole
> desktop event path. See "Renderer-stream leg deletion (V5 plan 2.5)" below.
> The history here is retained for the audit trail of versions 13/5/10.

The V4 F7 correction consumed three previously unused versions for one
incompatible handoff, chosen deliberately around the active reservations:

- `BACKEND_HOST_PROTOCOL_VERSION` 7 → 13 in `src/shared/backendHostProtocol.ts`
  — `set-renderer-stream-ownership` now carries a per-window
  grant+interests table (every entry carries its minted grant — main mints
  identity and generation before publishing interests, so the former
  `grant: null` sentinel has no supported producer — plus the explicit
  `receivesShellRemainder` role that keeps the shell-recipient window's
  controls exact-once), `supervisor-event` envelopes gained a targeted
  `windowId`/`generation` recipient, the untargeted shell copy no longer
  carries a sequence, `call-supervisor` carries an authenticated
  `originWindowId` (main-assigned from the IPC sender, or the
  backend-validated stream bind) that scopes terminal-bootstrap retention to
  the requesting window, and the new `renderer-stream-recovery` kind announces
  generation-fenced loss windows through the ordered desktop-IPC fallback.
  Versions 8-12 remain RESERVED for their recorded V4 activations (owner
  bootstrap 8, settings authority 9, the superseded two-parent combination 10,
  private usage-secret 11, and 12 for the eventual combined contract); this
  milestone deliberately skipped them.
- `BACKEND_RENDERER_STREAM_VERSION` 3 → 5 — the interests-frame version gates
  recovery ordering and the acknowledged-handoff cursor semantics; a v3/v4
  frame is closed with 1008 instead of being half-owned. Version 4 remains
  RESERVED for the settings-authority activation and was deliberately skipped.
- `PORACODE_CLIENT_RUNTIME_VERSION` 8 → 10 (see above); facade 9 stays
  RESERVED.

Old-artifact rejection is regression-covered at every boundary (request and
outbound version gates, stream-info version checks, and the renderer facade
check), and a stale backend that never receives the per-window table keeps the
legacy full-relay behavior instead of starving fallback windows. The remote
wire protocol and its reserved remote 13 are unrelated to this local boundary
and untouched by it.

Final-correction note (same uncommitted candidate, same 13/5/10 versions): the
v13 table shape was audited and tightened after independent review — the
grant-less sentinel was removed (recovery-barrier and delivery targets now
always fence to a real generation ≥ 1; `RENDERER_STREAM_UNGRANTED_GENERATION`
survives only as the renderer-presented fallback when a grant pull has not
confirmed), the shell-remainder role was added, and the call-supervisor origin
field was added. Because 13 was never shipped, the shape change does not
consume a new version; the acceptance tests at every mirror (protocol gate,
ownership registry, delivery-table builder, host client, grant authority) pin
the final shape.

Integration-replay note (same uncommitted candidate, same 13/5/10 versions):
after the local F7 batch was replayed onto the five incoming `poracode/v2`
commits and `origin/master` (#765) was resolved in, a third review round fixed
main-side publication and dispatch only — the per-window table is republished
for every per-window interest/identity change even when the merged union is
unchanged (a dedicated wiring helper), native/sleep handling is applied exactly
once on the shell/legacy path instead of on every targeted copy, grant-authority
sync failures are reported through its `onError` callback instead of rejecting
into fire-and-forget callers, and the `call-supervisor` envelope is again built
by one shared origin-aware builder used by both ends. None of these change the
wire shape or any version identifier; the never-shipped 13/5/10 boundary is
unchanged, and the remote/native protocols remain untouched.

Final boundary-correction note (same uncommitted candidate, same 13/5/10
versions): the independent integrated review proved the quick-composer
duplicate suppression keyed on object identity that cannot survive the
backend-host IPC boundary — the targeted copy and the shell remainder are
separate messages, so each `process.send` produces a distinct object in main.
The correction is main-local only: `createRendererEventDispatcher` never sends
a targeted agent-status copy to the quick composer window, and the shell
forward is the overlay's single delivery path (a directly owned overlay keeps
its direct stream; a hidden overlay refetches on show). No envelope shape,
operation, payload field, or version identifier changes, so host 13 / stream 5
/ facade 10 remain correct and no migration or new pre-upgrade fixture is
required for a change that only alters which already-versioned envelope main
forwards. Reserved host 8-12, stream 4, and facade 9 remain unconsumed, and the
existing mixed-pairing gates (protocol request/outbound gates, stream-info
version check, interests-frame version close, facade version check) still
reject older peers.

## Bounded large-reply transfer candidate (renderer stream 5 → 6, uncommitted) — DELETED in V5 2.5

> **DELETED (V5 plan 2.5).** This working-tree candidate was never published
> and its entire subject (the renderer-stream chunked large-reply framing and
> `BACKEND_RENDERER_STREAM_VERSION` 6) was removed with the renderer-stream
> leg before any release. Large replies now travel the unified desktop-IPC
> procedure path un-chunked; the 32 MiB acceptance is pinned by
> `src/renderer/electronBackendTransport.largeReply.test.ts`. The budgets
> below are historical.

Phase 3 item-6 candidate (working tree only, not published): the direct
renderer stream moves 5 → 6 for bounded large-reply transfer while host 13,
facade 11, HTTP bridge frame set 2, remote wire 12, and relay 3 stay unchanged.

- `BACKEND_RENDERER_STREAM_VERSION` 5 → 6 in
  `src/shared/backendHostProtocol.ts` — backend → renderer adds
  `reply-start`/`reply-chunk`/`reply-end`/`reply-abort` and renderer → backend
  adds `reply-ack`/`request-cancel`, all version-gated. A v5 peer fails the
  same loud gates as before (1008 on frames, IPC fallback on stream info) and
  never receives chunked frames. No new host IPC shape, no preload/facade
  change, no F8 bridge/remote/relay frame change.
- Budgets (all regression-pinned): logical serialized reply ≤ 64 MiB UTF-8;
  complete encoded data frame ≤ 64 KiB; receiver credit ≤ 2 chunks / 128 KiB
  unacked per transfer (ACK only after validation/acceptance; 30 s credit stall
  aborts that transfer with a bounded error, socket alive, ownership kept);
  delivery ≤ 2 large/client with 64 MiB retained serialized bytes/client and
  ≤ 4 large / 128 MiB global (exactly-once reserve/release); execution 64 /
  client (cancelled-but-unsettled counts) plus a new 128 outstanding
  direct-handler global that survives disconnect/reconnect orphans. Delivery
  cancellation frees delivery buffers promptly while the handler slot is held
  until real settlement; late completion never publishes, never replays, never
  reroutes over main IPC. Fragmentation applies to any valid `ok:true` reply
  (no procedure whitelist — chunking never re-executes the handler).
- Compatibility mirrors: old-stream v5 info rejected / v6 accepted at the
  main/host-client gate, preload info gate, transport v5-1008 / v6-ok in both
  directions, and stale-host fixtures (`src/main/backend/
rendererStreamVersionGate.test.ts`, renderer transport + backend suites).
- Qualification status (candidate, 2026-09-14): focused suites only —
  framing/slicing (5), reassembly (8), transport wiring (6), backend delivery
  incl. 2 MiB hash equality / Unicode-escaping / 64 MiB and +1 / credit /
  sibling / mutation-once (7), admission/cancel/orphan/version (6), smoke hash
  (1); adjacent pre-existing stream/transport suites (65); `tsc`, `oxlint`
  (plain + type-aware on touched files), `oxfmt` green. No full-repo
  build/test, no live app/CI verification in this lane — those run once on the
  frozen milestone candidate with the renderer/iOS lanes.

## Managed catalog mutations over the existing command routes (managed-root B4 prerequisite) — additive, no version bump

Managed-root clients keep no catalog mirror, so relative reorder, workspace
assignment, and project draft-config persistence must be host-authoritative
user commands. They ride the EXISTING project/thread command routes (no new
route, no new IPC procedure, no main-local data path) as additive
discriminated kinds:

- `POST /api/projects/command` adds `reorder` (project relative move),
  `set-workspace` (nullable single-column project workspace), and
  `set-draft-config` (nullable `lastDraftConfig`). `POST
/api/threads/{threadId}/command` adds `reorder` (single/block relative move
  inside one project) and `set-workspace` (nullable thread workspace).
- `remoteProjectCommandResponseSchema` is a union: every pre-existing project
  command kind still returns the complete `{projects, project?}`, while the new
  kinds return the bounded `{ok:true, project?}`. No catalog page/list is
  echoed for a catalog mutation, and the host's `remote-projects-changed` /
  `remote-threads-changed` broadcasts remain the only client notification
  (never a renderer mirror).
- Truthful older-host handling: a host that predates the kinds fails the
  unknown discriminator as `invalid_request` (400) before any effect. The
  descriptor advertises `capabilities.catalogMutations.versions = [1]`
  (`REMOTE_CATALOG_MUTATIONS_VERSION`); a client MUST treat an absent
  capability as "keep this state local" and must not send the intent. This is
  deliberately not an `update.patch` key, which an old host would strip while
  reporting success.
- Receipts: the catalog kinds honor `x-poracode-command-id` on both routes
  (the project route gains `command-id-header-for-catalog-kinds`; the thread
  route's declaration becomes
  `command-id-header-for-start-and-catalog-kinds`). The receipt binds the
  principal and the validated body digest and caches only the bounded
  response, so a lost-response retry never re-applies a relative move.
- Durability: `src/host/db/catalogIntents.ts` reads ids/order/project metadata
  only and writes only changed `sort_order` positions (slot-preserving;
  duplicate ordering values fall back to a deterministic complete renumber)
  or the single `workspace_id` / `last_draft_config` column. No whole-row
  upsert, no client-array `dbSyncChanges`, no schema migration (all columns
  already exist; `LATEST_SCHEMA_VERSION` stays 49).

Version boundary: `PORACODE_REMOTE_PROTOCOL_VERSION` stays 12 (old readers
only ever send the pre-existing kinds, so they never receive the bounded
response; old hosts reject the new kinds before mutation) and
`REMOTE_BINDING_FORMAT_VERSION`/`REMOTE_GENERATOR_VERSION` stay 2/3.

### Host correction (post-review): required command ids and commit-boundary receipts — still no version bump

The independent review reproduced two defects in the slice above; both are
corrected inside the same unreleased boundary, so no protocol/format version
moves:

- **Required idempotency key**: the header is now REQUIRED for the catalog
  kinds before any effect (`requireRemoteCommandId` → 400
  `command_id_required`); legacy kinds keep their historical optional header.
  The SDK `projectCommand`/`sendThreadCommand` overloads make the per-operation
  `commandId` a type-level requirement for catalog kinds and always classify
  them as mutations. The `catalogMutations` v1 capability stays: it was never
  released, and a client that gates on it now knows the id is mandatory.
- **Truthful commit boundary**: the DB intents signal the true commit point
  (`CatalogIntentCommittedSignal`) before the throwing change-listener fan-out,
  the post-write read/parse, the WS publication, and the removed mirror
  callback. A post-commit failure is recorded `uncertain` and answered as the
  typed `command_outcome_uncertain` 409 (both routes; the no-command-id branch
  of `runRemoteCommand` answers the same way instead of a plain 500), while a
  pure validation refusal stays a definite `failed` with zero effect. Receipt
  semantics are unchanged: this marks the real boundary, it does not infer
  non-effects from SQL atomicity.
- **Project relay removal (same correction)**: the backend→main→renderer
  `projects-changed` native event is removed (see the Client/host hop row);
  project mutations publish the bounded `remote-projects-changed` WS
  membership event, and project-scoped MCP settings writes publish the same
  event through the desktop composition instead of a native bulk copy.

Housekeeping (host-owned startup/idle policy; separate from the command
routes): archive/purge predicates and the custody delete add no schema, wire,
or IPC shape change. The only boundary touch is the additive internal
supervisor name `closeThreadConfirmed` (documented in the procedure-map row,
version stays 15). Policy notes: 30-day archived purge and the configured
`autoArchiveDoneAfterDays` (default 3, 0 disables) move to the host; the
sweep runs once at boot, never on a settings change; experiment-owned
candidate ids are skipped for archive and purge (a deliberate, documented
parity difference — an unreadable experiment store fails closed); a failed or
unconfirmed runtime retirement never deletes the row; the host publishes a
bounded `remote-threads-changed` membership event and never closes local
panes.
`CLIENT_HOST_HOP_VERSION` stays 15 (no IPC procedure was added; superseded by
the later hop-16 `dbPersistExperimentState` removal — see the Client/host hop
row). The generated
remote-v3 artifacts (manifest/IR/JSON-schema/native Swift+Kotlin + the
native-bindings manifest hashes and structural counts) were regenerated in the
same pass and `pnpm protocol:remote:v3:check` is green. The native parity
ledger records the additive kinds as host-authority source evidence only and
promotes no wire/ui claim. Regression evidence: `catalogOrder.test.ts`,
`catalogIntents.test.ts`, `catalogIntents.http.test.ts` (real HTTP + real
SQLite: two-client stale projection, minimal-write assertions, receipt
replay/digest/principal binding, viewer scope refusals, capability
advertisement, bounded vs complete responses), plus the regenerated
`protocol/remote/v3` suite and
`src/shared/remote/contract/native/generate.test.ts` hash/count pins.

### Bounded catalog-change notifications and lifecycle corrections (ratified slice) — additive, no version bump

The independent final review's H1-H4 corrections and the parent-ratified bounded
catalog notification design land together without moving any version:

- **Wire/capability (D1/D2/D3)**: `capabilities.boundedCatalogChanges.versions =
[1]` (`REMOTE_BOUNDED_CATALOG_CHANGES_VERSION`) is advertised by the
  environment descriptor; the WS upgrade carries the per-connection, exact-match
  declaration `catalogChanges=bounded-v1`, honored only with `session:read` and
  registered before `ready`/replay and removed on close. The
  `remote-projects-changed` discriminator gains the optional `mode:"signal"`
  marker; the shared schema rejects a signal carrying a payload and a payload-less
  full form. Replay retains the canonical signal (~100 B) for every catalog
  mutation, so a 2k-project catalog can no longer evict the 8 MB replay window or
  withhold a 2 MB+ event. Undeclared sockets receive the truthful full live event
  when deliverable and a per-socket `resync-required` otherwise — never the global
  `resync-required`/`onOversizedEventDropped` path. Declared sockets never observe
  a global resync from project size. `PORACODE_REMOTE_PROTOCOL_VERSION` stays 12:
  additive negotiated capability on an existing event type; old readers ignore the
  marker, and an old host neither advertises nor emits it.
- **Read avoidance (D6)**: catalog-mutation HTTP responses no longer read/parse
  the full catalog; a single declaration-aware publisher
  (`publishCatalogChanged`) reads the authoritative rows only when an undeclared
  live subscriber or the optional in-process `onProjectsChanged` callback
  consumes them. Legacy kinds keep their complete response and read. Host-local
  project writers (`BackendDesktopServices`, headless composition, home-project
  creation) route through the same helper.
- **Membership bound (H3)**: the shared publisher splits `remote-threads-changed`
  id lists into ordered, duplicate-free batches TARGETING ≤ 8 KiB UTF-8 each,
  including the event envelope, the live/replay wrapper, JSON escaping of
  arbitrary accepted id lengths, and the serialized `viewedThreadIds` payload
  every batch carries (the acknowledgement is never truncated or dropped). One
  accepted id — thread id or viewed id — that alone exceeds the remaining
  budget is the explicit oversized-single-id exception: it forms its own batch
  and the unchanged hard per-event guard (`maxBroadcastEventBytes`) still
  governs it. Accepted-id lengths are not universally bounded by HTTP
  body/header limits (imports and local procedures are separate ingress paths),
  which is exactly why an exceptional id is split, never dropped. Empty
  membership changes publish nothing, so a 60k-id sweep is ~300 small
  replay-safe frames instead of one over-cap event that globally resyncs every
  client. No event name, payload schema, or replay budget changed.
- **H1 classification**: the no-command-id branch of `runRemoteCommand`
  classifies ONLY host-resource-admission refusals (unproven admission refusal →
  typed uncertain 409; any other failure keeps its raw historical error). Keyed
  post-commit uncertainty is unchanged. This restores the pre-correction
  error mapping for unrelated legacy operations.
- **H2/H4 lifecycle**: the boot housekeeping sweep calls the existing
  `closeThreadConfirmed` with `startIfNeeded:false` and never forks a
  supervisor; a no-start `SupervisorUnavailableError` counts as confirmed
  retirement only when `SupervisorClient.isSupervisorProvenAbsent()` (no child,
  no retiring child, no start/stop/restart transition, no scheduled auto-restart)
  proves no runtime can act — a disconnected child or a generic unavailable error
  skips the row. `BackendDurableServices` cancels the sweep synchronously on
  dispose, checks cancellation before candidate reads/retirement and after every
  await, and joins the run before its database closes; a cancelled sweep never
  deletes or publishes.
- **Generated mirrors**: the capability object is generated (Swift/Kotlin
  validation, models and the JSON-schema bundle); all canonical mirrors were
  regenerated with the generator and `pnpm protocol:remote:v3:check` is green. No
  binding-format/generator version moved. No IPC procedure, hop, SQLite schema
  (49) or persisted shape changed.
- **Regression evidence**: `boundedCatalogChanges.http.test.ts` (real HTTP +
  SQLite + WS: exact/malformed declaration and scope gating, close cleanup, 2k
  oversize mixed sockets, bounded retained replay bytes, replay signal vs
  undeclared resync, no-eager-read with a poisoned catalog row),
  `membershipPublication.test.ts` (60k ids: bounded live + contiguous replay,
  no drop callback, empty no-op), `boundedCatalogChanges.test.ts` (both schema
  variants + malformed rejection), `eventReplay.test.ts` (declared signal /
  undeclared resync), `BackendDurableServices.test.ts` (never-started,
  transition-skip and held-disposal join), `ThreadHousekeepingService.test.ts`
  (cancellation before reads and after a held retirement),
  `SupervisorClient.test.ts` (positive absence proof states) and
  `remoteCommandIdempotency.test.ts` (admission-only unkeyed classification).

### Managed-root host contract completion (ratified slice) — additive, no version bump

The renderer correction's host prerequisites and the N1 membership-accounting
correction land together without moving any wire version:

- **Canonical Home (`src/backend/BackendHostCore.ts`)**: the owning managed-host
  startup persists the canonical Home row through the existing
  `ensureHomeProjectRow` helper before its first catalog/launch request can
  observe an absent row. The write is guarded by the non-`validate` schema mode:
  validate-only/offline/import opens stay read-only, and no renderer-random id
  is invented. Regression: `BackendHostCore.managedHome.test.ts` (real
  fresh-profile SQLite + real HTTP route: a fresh row-less host refuses the
  Home launch with `project_not_found`, a started host launches it, a
  validate-only host writes nothing).
- **Launch metadata (`capabilities.threadLaunchMetadata` v1)**: the `start`
  thread command now persists `workspaceId`, `parentThreadId` and `prNumber` on
  the durable row and honors the client's exact `initialSize` at launch
  (title, group, worktree, config were already honored). `workspaceId` and
  `initialSize` are additive optional command fields. An old host's object
  schema strips unknown keys silently and answers success, so a client MUST
  gate sending the new fields on the advertised capability
  (`hostSupportsThreadLaunchMetadata`) instead of assuming they applied; an
  older client never sends them and is unaffected.
- **Retained launch operation (`startNewThread` `commandId` option)**: an
  explicit `commandId` plus explicit `threadId` lets a caller retain ONE launch
  operation across an uncertain retry; the same id and body replay the recorded
  receipt, a changed body/target conflicts, and an interrupted attempt stays a
  typed uncertain 409 that is never blindly relaunched. Omitting the option
  keeps the historical `thread-start:<threadId>` default for unrelated callers;
  passing the option without an explicit thread id is refused client-side.
- **Bounded project-command results (`capabilities.projectCommandResults` v1)**:
  the existing `POST /api/projects/command` route accepts the exact declaration
  header `x-poracode-project-command-result: bounded-v1` and then answers every
  command kind with the existing bounded union (`{ok:true, project?}`) instead
  of the complete `{projects}` result. The declaration is separate from the
  catalog-mutation KINDS: an undeclared caller keeps the byte-identical
  complete result. Opted-in mutations REQUIRE the per-action command id, bind
  the exact body plus the semantic mode to the receipt digest (the mode is part
  of the digest, so a receipt never replays across contracts), record the
  commit/effect boundary before callbacks, and classify a post-commit
  read/parse/publication failure as `command_outcome_uncertain` rather than a
  definite failure. Update/relocate/remove lookup by primary key and never read
  unrelated project rows; registration returns only the affected row (the
  registration id mapping). Publication reuses the consumer-aware
  `publishCatalogChanged` helper, so the catalog is read only for an undeclared
  live subscriber or the embedding callback. Legacy kinds keep their historical
  optional id and complete response. Client gate/helper:
  `hostSupportsProjectCommandResults`; the SDK refuses a complete response to a
  bounded declaration instead of silently claiming the guarantee.
- **N1 membership accounting**: `batchThreadIdsForMembershipEvents` now charges
  the actual serialized `viewedThreadIds` payload to every batch (see the H3
  bullet above); the 60k normal-id no-global-resync proof is preserved and
  exceptional singleton/viewed cases are pinned.
- **Generated mirrors**: capability schemas were regenerated with the generator
  (`pnpm protocol:remote:v3:generate`; `protocol:remote:v3:check` green); the
  native-bindings `sourceHash` pin is refreshed to
  `sha256:9a2d6f57…` (manifestHash unchanged, structural counts unchanged,
  binding format 2 / generator version 3 / protocol version 12). No
  IPC procedure, hop, SQLite schema (49) or persisted shape moved.
- **Regression evidence**: `boundedProjectCommandResults.http.test.ts` (real
  HTTP + SQLite + WS: capability advertisement, 2k-row legacy complete parity,
  declared bounded affected-row response with zero unrelated full reads,
  bounded registration mapping + removal, required ids, receipt replay/conflict
  binding, post-commit fault → uncertain),
  `httpRouteHandlers.threads.receipts.test.ts` (launch metadata persisted +
  `initialSize` launch, one-operation replay/conflict/uncertain),
  `BackendHostCore.managedHome.test.ts`, `membershipPublication.test.ts`,
  `client.test.ts` (launch metadata forwarding, retained-operation refusal,
  bounded declaration + truthful refusal, capability gates).

## Native mock controls

`src/main/testing/smokeNativeControls.ts` owns the separate version-2 QA bridge
and versioned channels. The preload and Quick Composer smoke driver must agree;
version-1 drivers are rejected. Version 2 adds native `BrowserWindow.close()` and
`app.quit()` probes. Registration requires development mode, an unpackaged app,
mock agents, and the current main window's top frame. It adds no public
ClientRuntime, backend-host, or remote operation. HTML `window.close()` is not a
substitute for the native close callback in a sandboxed Electron renderer.

## Measurement evidence

`ProcessMemorySummary` in `tests/native-e2e/helpers/processMemorySampler.ts` emits
`samplerVersion: 3`; `HostLoadSummary` in the adjacent `hostLoadSampler.ts` emits
`samplerVersion: 2`. Both use asynchronous probes, a fixed delay after each
completed probe, and a joined `stop()` before evidence serialization. Their
`sampling` field records probe duration and unexpected failures. These versions
distinguish the new observer from older synchronous probes, which blocked the
test client's event loop and could contaminate latency measurements.

Host-load scenario windows and summaries are asynchronous: they capture the
window end before joining the pending probe. `buildMetricsArtifact` emits
`metricsVersion: 2` and copies raw per-client samples, keeping those samples
consistent with the captured aggregates while observer completion is awaited.
Unversioned metrics retained live array references and were only safe to
serialize without an intervening asynchronous boundary.

Memory version 2 already corrected own-process RSS peak accounting. Earlier
unversioned reports contain a last-sample value in that field and must be
remeasured before use as peak-memory evidence. Machine load and foreign-tool
presence are contention indicators, not process CPU measurements or proof of an
idle machine. Keep measurement versions separate from the application's wire and
storage versions, and record both with the exact tested artifact.

`ProcessCpuSampler` emits its independent `samplerVersion: 1`. It records
per-process cumulative CPU deltas only between matching PID/start identities,
with counter resolution, missing roots, discarded counter regressions, untracked
identities and lost exit tails explicit. It is partial external POSIX observation,
not complete CPU accounting or a strict lower bound: counter quantization can
overstate a short interval. Windows reports an unsupported platform rather than
valid zero usage. The 4,096 cap bounds historical metric records; the most recent
tree is separately bounded by the 8 MiB process-output limit. Preserve these
limits when supplementing in-process CPU/event-loop traces.

`src/shared/diagnostics/processPerformanceSampler.ts` retains process-sample
format 1. The surrounding local NDJSON evidence envelope in
`nodePerformanceDiagnostics.ts` is now format 2: it declares process-sample format
1 and IPC-queue sample format 1 independently. Existing format-1 evidence remains
unchanged; each run creates new exclusive files. Readers must check the envelope
version before interpreting its samples. With `PORACODE_PERF_OUTPUT_DIR` set to an existing absolute directory,
the desktop main, backend, supervisor, standalone server and relay write distinct
private NDJSON files. No collector starts by default. CPU/RSS are process-wide;
event loop, heap and GC describe the current thread/isolate. Completed callback
intervals are assigned at capture, can span a window boundary, and include the
configured timer period. The unfinished callback tail is recorded separately.
This method is distinct from native timer/iteration histograms; do not compare
their percentiles as if they were the same measurement.

The reporting interval defaults to 1,000 ms (`PORACODE_PERF_INTERVAL_MS`, range
100–60,000). The per-file cap defaults to 64 MiB (`PORACODE_PERF_MAX_BYTES`, range
64 KiB–512 MiB). Output serializes at most four pending 16 KiB records; overflow,
budget exhaustion and I/O failures invalidate that recording. Normal shutdown
attempts a final sample and end marker, with at most 500 ms added for diagnostic
output. A missing/truncated end marker or incomplete-output warning cannot qualify
a gate. Successful writes are not a power-loss durability guarantee. No message
content, argv, environment dump or credentials are recorded. The observer's CPU
and timer work is included; qualify its overhead against a disabled control.

Format 2 adds opt-in observations for the application waiting queues from main to
backend, backend to main, and supervisor to its host (backend or standalone
server). Registration is limited to those three names with one current reader
each; the recorder copies only the fixed numeric/boolean schema and a random
sender-instance UUID. Sender replacement changes that UUID. An absent sender is
`unavailable`, a failed/invalid observation is `error`, and an unregistered queue
is absent. None means measured zero. A complete end marker describes file output,
not queue-observation coverage or successful delivery.

Waiting bytes are the existing sender admission estimates, not native IPC buffer
measurements. Age starts at initial waiting-queue admission; a queued retry keeps
that time, and merging an existing recovery marker preserves the marker's age.
Any missing/invalid admission time makes the oldest age unknown. In-flight counts
and send-adapter attempts (including a local adapter rejection) are separate from
waiting messages and are not peer processing acknowledgments. Terminal coalescer count is separate; its bytes/ages and other
transport queues remain outside this measurement. Per-sample queue collection
work is reported separately from process sampler work. With diagnostics disabled,
the sender creates no probe or admission timestamps; the optional code branches
remain, so this is not a claim of zero overhead.
Stopping the recorder, including budget/error stops, also ends the shared capture
lifetime; existing senders stop timestamps/counters and replacement senders do
not reactivate them. Application message admission and delivery continue normally.

## Mirrored-boundary rule

Some state has more than one durable layer. A version audit must follow the value end to end, not stop at the file being edited. The agent-status path is the canonical example:

```text
provider probe -> supervisor agent-status cache -> IPC/event -> renderer Zustand cache -> UI
```

If provider discovery semantics change, an old value can survive in either cache. Review both `STATUS_CACHE_VERSION` and the renderer store version, then test an upgrade fixture containing the previous version and stale data.

Supervisor status cache 42 and renderer status store 38 invalidate inventories
that omitted profiles when their probes returned the base adapter identity.
Profile detection now preserves the adapter's kind and label. Upgrade tests
reject supervisor cache 41 and renderer store 37; settings, profile formats,
IPC and remote protocols are unchanged.

Provider usage cache 10 invalidates version-9 snapshots that could pair a retired
account's quota with a replacement account fingerprint during cost enrichment.
Final account admission now follows enrichment and immediately precedes commit.
It also refreshes balances omitted by earlier collectors. The renderer usage
store is memory-only; shared settings and usage wire shapes are unchanged.

Devin native-default sessions now use the same account-scope-3 binding as
profiles. The hash dimensions retain their v3 meaning; no identity format,
IPC or database shape changes. Historical unbound default refs are intentionally
refused with `resume-scope-missing`: the current login cannot prove who created
an older conversation. They are preserved for inspection, never assigned a new
owner by migration. Pre-upgrade unbound-ref fixtures cover GUI and Terminal
admission. Terminal resumes also require an exact native id and never select
the latest conversation in a shared working directory.

WSL Devin session bindings use account-scope-4, adding the distro name because
default roots are shell templates and identical roots in separate distributions
are distinct filesystems. Prior WSL v3 refs fail with `resume-scope-mismatch`;
they are never assigned the currently selected distro by migration. Native v3
bindings retain identical bytes and remain resumable. Upgrade fixtures cover
both outcomes. Identity inputs now require the execution location. The shared
SessionRef field, database and IPC/remote shapes are unchanged. Credential reads
expand only the resolver's exact WSL default template inside the distro shell;
all literal paths remain quoted, and no native credential file is rewritten.

## Terminal scrollback chunks (schema 52)

Schema 52 is forward-only: new terminal writes store UTF-16LE BLOB chunks
instead of rewriting the retained whole transcript. Schema-51 transcript rows
remain readable and convert atomically on their first append. The chunk table,
retention counters, and absolute UTF-16 cursor commit together; the public
200,000-code-unit read tail and remote cursor payload are unchanged. Old code
cannot serve new chunk writes, so rollback requires the pre-upgrade database
backup. Validate-only opens refuse the missing chunk schema.

All readers continue through the scrollback facade except legacy admission,
which charges the actual legacy text or chunk BLOB bytes the reader loads.
No settings, wire, native binding, helper, or renderer cache version changes.
Migration, reopen, UTF-16 boundaries, atomic failure/retry, lock contention,
retention and delete/clear regressions live in terminalScrollback.test.ts.

Native qualification node-perf summaries now declare summaryVersion 2. They
read format-2 nested queue observations and retain unavailable/error/unknown-age
coverage separately from measured zero. Writer evidence format 2 and queue
sample format 1 remain unchanged; format-1 files supply process metrics only.
Older summaries must be regenerated from raw evidence before qualifying queue
bounds. Missing process metrics also remain null; per-metric coverage is separate
from recording completeness. A complete recording requires a recognized start,
a newline-terminated shutdown marker, matching writer counts/bytes, and no loss,
budget exhaustion, malformed records, or reported writer errors. The marker
records pre-close evidence and does not prove the later close succeeded.
Regression: tests/native-e2e/helpers/nodePerfSummary.test.ts.

Crossagent transcript indexes, deferred projections and terminal scaffolding
release are volatile same-process bookkeeping. Full output, UTF-16 cursor
corrections, compact envelope v1, attempts and continuation receipts remain
unchanged. Forwarded-item ancestry resolution preserves released stable ordering,
including cycles and missing/closed parents. Diagnostic suffix storage preserves
per-Buffer decoding and the existing 2,000-unit final slice/trim; its private
retention policy has no serialized representation. Released-oracle parity,
retirement and real process regressions cover these changes. No persisted state,
wire protocol, plugin capability or deployed helper contract changes, so existing
versions remain valid and no migration or compatibility bump is required.

Runtime stream writes reuse one consecutive item's decoded head only inside a
single synchronous transaction prefix. Any intervening non-delta event or item
switch invalidates it; no cached row survives commit, rollback, thread-prefix
change or connection replacement. Narrow stream statements read/write only
state and streams, preserving existing payload bytes. Persisted schema 52,
stream-state/chunk formats, retention policy, canonical admission receipts and
committed/fenced read semantics remain unchanged. Prior-row, replacement,
interleaving, rollback/retry and actual SQLite digest-parity regressions cover
this volatile optimization; no compatibility version bump is required.

Capped nonzero crossagent progress reads project the same forward correction
sequence into a bounded suffix of UTF-16 spans. The raw numeric cursor, stable
correction ordering, first qualifying replacement per key, omission marker and
result metadata retain their prior meanings. Exceptional numeric/range inputs
keep the legacy reader. Full output, compact envelope v1, quiet reads and
beginning/history projections remain compatible. The spans are private to one
synchronous read and are never persisted or sent across processes; no cache,
schema, wire, helper or plugin version changes are required. Previous-reader
parity and orchestration process checks cover the unchanged public contract.

Frozen runtime-stream head hints are connection-local TEMP SQLite metadata,
bounded to 64 entries with at most 1,024 UTF-8 key bytes per entry. They retain
no stream text or payload. TEMP triggers invalidate same-connection item row
changes; top-level immediate writers validate external `data_version` changes
before reading hints. That freshness stamp and all hint mutations are themselves
transactional, so rollback restores a consistent view. Nested writers use the
existing full-head path. Canonical head/chunk/state rows, retention boundaries,
UTF-16 behavior, read fences and commit receipts keep their existing meanings;
old stored rows and older readers/writers remain compatible. The frozen lookup's
NULL stream projection is private to the writer and never crosses the public
item API. No persistent schema, derived durable index, wire, helper or plugin
version changes are required. Previous-row, same/external-connection mutation,
rollback/retry, nested rollback, replacement and lifecycle regressions cover
this volatile optimization.

Frozen-head hint setup is lazy: cold connections keep the original lookup until
an eligible head has been observed in a confirmed top-level commit. Only a
boolean observation survives that prefix, and setup runs before a later
top-level transaction. Rollback, nested writers and failed commits cannot
schedule activation; setup failure cannot revoke an earlier commit receipt.
Resetting the statement cache discards pending observation. These private
lifecycle rules change no persisted or serialized contract; committed-only
activation and partial-setup retry regressions cover the boundary.

Timeline remount-height snapshots are volatile, renderer-local derived hints.
They retain at most 16 threads, 1,024 rows per snapshot, 4,096 rows in aggregate,
and 1 MiB of estimated UTF-16 key/record storage. Empty or oversized replacements
retire the prior snapshot; oversized snapshots fall back as a whole to existing
virtualizer estimates. Canonical items, history, layout signatures and measured
row values remain unchanged. Cache records are owned immutable copies, so caller
mutation cannot bypass admission accounting. The estimate excludes actual
JavaScript/native allocator overhead. Desktop and web use the same module; no
persisted cache, schema, wire, helper or plugin version changes are required.
Aggregate row/key-byte pressure, read recency, replacement/reset accounting,
removed-item snapshots and width/font restoration regressions cover this boundary.

Explicit virtual-row layout signals can delegate dimension measurement to an
established observation of the current connected row's border box. The optional
same-bundle callback preserves synchronous structural signaling without reusing
stored geometry. First delivery, missing callback, recycled/disconnected rows,
unusable border-box data and legacy content-box-only observation retain explicit
measurement. Observer dimensions and deferred shrink ownership keep their prior
meanings. No geometry is persisted or transmitted; the callback is a private
compatible renderer extension, so no schema, wire, helper or plugin version bump
is required. Lifecycle, fallback, current-row and pre-paint positioning checks
cover this volatile optimization.

Pane reader-follow intent is volatile and private to one mounted chat pane.
The signal owns one boolean and only currently mounted body subscriptions;
unmount removes those listeners. Implicit reader and explicit Earlier selections
use bounded detached UTF-16 pages (at most 8,193 units each), never source-text
caches. Only a confirmed user scroll-away freezes the current streaming page;
canonical intake and display/copy/export source selection continue advancing.
Explicit pane return releases the implicit page before tail reconciliation,
while explicit Earlier selection retains its separate Back to latest action.
Replacement/hydration epochs, source takeover and body remount invalidate old
selections. Standalone bodies without this same-bundle context retain the
previous latest-page behavior. No page or follow state is serialized, persisted,
transmitted or shared with independently updated helpers; existing schema,
cache, wire, IPC, helper and plugin versions remain valid. Gesture/compensation,
raw/capped append, first-cap, completion/source-takeover, threshold transition,
return/submission and subscription-cleanup regressions cover this private
presentation boundary.

An already-paused pane also detaches the first committed eligible streaming
window after mount, replacement, hydration or entry into windowing. Each restart
begins with its own current source; no old source/page survives. A valid selected
page consumes this capture eligibility, so subsequent appends do not make new
page copies until a source restart or explicit return.

## Runtime growing-head blocks (schema 53)

Schema 53 is forward-only: new runtime stream writes extend the existing JSON
head with canonical UTF-16LE BLOB blocks and per-stream scalar metadata. The
legacy `thread_runtime_items.streams` JSON remains an immutable seed during
ordinary appends and stream replacements. Migration 53 creates empty tables
and a seed-reset trigger; it never rewrites legacy seeds, tail chunks/state,
item metadata, completed turns, or durable gap/notice evidence. Eligible seeds
initialize lazily inside the same immediate canonical transaction as the first
write. Published migration 36 uses its own historical whole-value split helper
and the retained legacy append primitive, without requiring schema-53 tables.

`runtimeStreamHeadSchema.ts` owns mirrored bootstrap/migration definitions.
Each stream retains at most 256,001 UTF-16 units (the existing complete-surrogate
cap behavior), in blocks of at most 8,192 units and at most 32 block rows. One
partial open block may be rewritten; closed blocks remain immutable. Stream
keys are private JSON-string encodings, preserving isolated surrogate keys.
An explicit assignment to `streams`, even of identical bytes, resets the item’s
head overlays transactionally; key-only item moves and deletion use foreign-key
cascades. Per-stream replacement suppresses its legacy seed through persistent
metadata while keeping sibling streams and the seed JSON unchanged.

An older whole-head reader cannot assemble the new blocks, so code-only rollback
is unsafe and server upgrades require a consistent pre-migration backup. Normal
desktop/server startup and validate-only opens reject newer schema versions.
Physical SQLite backup/import includes the new tables automatically; receipt
format 1 remains valid and its numeric database schema field records 53.

The shared 256,000-unit head, 4,000,000-unit tail and elision policy, assembled
full-read strings, committed/fenced read contracts, remote protocol 12,
client-host hop 16, canonical admission 2, history `gap2:` tokens, native
binding/helper formats, settings and renderer/provider cache versions remain
unchanged. The prior TEMP frozen-head hint is superseded by durable head
metadata; volatile statement caches follow the connection and retain no stream
text across transaction prefixes. Runtime artifact content digests change when
the new migration/readers are rebuilt; their manifest formats do not change.

Regression coverage starts from actual pre-36 and schema-52 storage without
head tables, preserves legacy rows through migration/reopen, compares fresh
and upgraded DDL/constraints, checks lazy append and seed-reset rollback,
validates exact UTF-16 BLOB/sequence bounds, and rejects a newer version even
when every required column exists. The real schema-52→53 server migration
policy requires a backup. Old-artifact desktop/server refusal and native/runtime
performance qualification are separate from these unit regressions.

## Runtime payload origin custody (schema 54)

Migration 54 is forward-only and creates an empty keyed
`thread_runtime_item_payload_origins` side table, origin format 1. Historical
payloads, immutable stream seeds, head blocks, tails/state, completed turns,
and durable gap/notice evidence remain byte-for-byte valid and unchanged;
unproved legacy summaries remain unknown. A stable format-owner capability
belongs to the actual complete-payload producer, never the current thread kind
or adjacent handoff. There is no history scan or app-wide legacy repair.

The composite `(thread_id, item_id)` foreign key cascades deletes and key moves.
AFTER INSERT resets the new key only for successful insertions, preserving
ignored duplicate starts. AFTER UPDATE OF payload, type, thread_id, item_id
clears both old and new keys even for identical-value assignments. State-only
and stream-only writes preserve payload origins. The trusted INTERNAL helper
checks transaction/foreign-key context, a successful single-row SQL receipt,
exact installed type/payload binding, origin format 1 and an ASCII owner key of
at most 128 bytes. Its caller must establish captured actual-producer custody
of the complete payload before installing proof after the SQL write. This
storage slice supplies no public RPC, proof injection, writer transport or
provider projection; end-to-end summary repair remains incomplete. Existing
writers that assign payload conservatively clear proof until that later trusted
writer lane can attest the installation.

`runtimePayloadOriginsSchema.ts` supplies the single migration/fresh-bootstrap
DDL. Required-schema validation checks its exact table constraints, composite
FK and both reset triggers, not just columns. Upgrade/reopen regressions start
from actual schema 53, and test same-byte writes, replacement/cascade and
transaction/savepoint rollback. Physical SQLite backup/VACUUM copies preserve
valid new metadata; logical snapshots have no proof and remain unknown.
Older artifacts reject schema 54; server upgrades require a consistent backup.
Backup receipt format 1 keeps its numeric schema field. Public remote protocol
12, client-host hop 16, public IPC/procedure shapes, private canonical admission
2, gap2 tokens and helper/native/cache versions remain unchanged.

The separate Stop pending-request ownership change is volatile and local to a
renderer component. Same-thread/new-turn and pane-reuse tokens fence late
responses; existing bridge, protocol and persisted-state shapes are unchanged.
Errors/analytics and server Stop/background-job policy are preserved. No schema
or IPC version bump is needed for that UI state change.

Private runtime payload custody uses separately negotiated format 1 in
`runtimePayloadOriginProtocol.ts`. The supervisor advertises
`runtimePayloadOriginVersions`; only an exact owned-boot
`enable-runtime-payload-origins` control permits serialization. Old receivers
receive no private fields, and old senders/unsupported versions remain unknown.
Actual structured adapter callbacks capture the declared format key after their
generation/retirement guards, including child attempts before parent retagging.
Event-local private symbols survive hold/release and coalescing; sparse positions
are generated only from the final chunk. No side map or independent relay exists.
Both peers charge the bounded key/tuple/header allocation in event, envelope,
credit, queue and refusal accounting. Keys remain at most 128 permitted ASCII
bytes, boot identities at most 128 printable ASCII bytes, and sparse entries at
most 20,000 per envelope. Publication strips private fields and authority from
all unchanged/partial backend/main/WS paths; admitted payloads have independent
ownership from public publication. Flow1 ACK still means admission, not commit.
Admission2 remains unadvertised by the supervisor and explicitly UNKNOWN in its
events-only intake and alternate publication path; its version 2 is unchanged.

The private branded admission entry preserves custody inside bounded pending
and flush event objects, including prefix refusal, retries and proven rollback
fallback. Only successful payload SQL installs are stamped, after invalidation,
in the canonical+usage transaction. Ignored INSERTs preserve prior proof. A
shallow merge can retain only already-proved same-format evidence; an independently
complete replacement follows the original writer's replacement branches.
No-payload completion retains proved prior evidence through the original valid
JSON re-encoding; malformed evidence that becomes null remains unknown. Direct,
synthetic and public snapshot assignments invalidate even identical bytes.
Storage format 1, the table/checks/triggers and physical schema 54 are unchanged;
shared types/constants/validation now mirror that sealed storage boundary.
Legacy/import/public snapshot rows remain unknown. Public runtime events,
procedure signatures, hop 16, remote protocol 12, gap2, backup receipt1, and helper/cache
manifest versions remain unchanged. Updated helpers/bundles advertise the new
private capability; old complete artifacts remain valid without custody.
Regression gates run the actual source/router/sender/owned host/queue/SQLite
path and the sealed pre-custody source/writer, with raw payload conservation,
exact producer/index ownership, public erasure and atomic rollback receipts.

### Bounded persisted payload read projection (R99)

The provider-owned `persistedRuntimePayload.ts` leaf declares the stable
`codex.file-change/v1` format key, matching the adapter's captured origin
capability and origin format 1. Build-time discovery composes pure projection
leaves into every tsdown entry and all unit/integration/performance test
configurations; readers never scan directories or import full adapters. Runtime
source declarations cover build, host, shared and supervisor roots, so the new
leaf and composition plugin change bundled artifact identity. No deployed cache
or manifest keeps a separately cached hook registry.

Readers require proved selected-row origin in the same SQLite snapshot, with
stream-elision exclusion. Unknown legacy/imported rows, ambiguous or mixed
sources, elided evidence and oversized sources remain unchanged. Projection
changes only returned counters and preserves stored JSON and stream bytes.
Declared 16-byte wire/32-byte decode expansion is an upper packing reservation,
never an oversized lower-bound proof; hard limits use exact post-projection
serialization. Provenance strings actually selected are separately charged in
legacy stored-data reservations. Physical schema 54, origin format 1, public
remote 12 and client-host hop 16 remain unchanged. Future format changes must
version the provider declaration, registry acceptance, SQL proof predicates and
private custody mirrors together.

### Native desktop shell-save shutdown dependency (R100)

Native quit now joins shell saves before disposing the backend they depend on.
A bounded save drain shares the existing ten-second app-quit budget, leaving
the unchanged two three-second termination joins for backend retirement. The
helper and client use one `backendShutdownBudget.ts` reserve; remaining time
is measured with the monotonic clock. Independent ingress/SSH shutdown remains
concurrent, failures still attempt backend retirement, and the outer app-quit
timeout is unchanged. This changes ordering, not shell-state keys or values,
SQLite schema 54, IPC argument/result shapes, public protocol versions, or
helper/cache manifest formats. Runtime source declarations include `src/main`,
so new bundles receive a new source identity. Prior complete artifacts remain
valid with their prior quit behavior; no persisted-state migration is needed.

Electron is pinned to `44.4.4`, including the mirrored workspace override and lockfile resolution used by React DevTools. This same-major update includes the upstream sandbox initialization fix (electron/electron#54155). Native dependencies are checked by the existing Electron-aware installer, and qualification uses isolated profiles and a newly frozen artifact. Application state, runtime payloads, IPC and wire formats do not change; their versions remain valid. The dependency version and build identity distinguish this runtime from the preserved 44.0.0 artifact.

### Authenticated image reuse and gallery readiness — volatile cache format 2

The instance-local environment-image pool shares immutable Blob/URL resources only after each coordinate finishes its own authenticated, capped response and exact MIME/byte comparison. Resource ownership, comparison pins and unsettled jobs are volatile same-bundle state; disposal retires the pool. Public image resolution, canonical images, persisted data, transport, IPC, wire and deployed helper formats remain unchanged. No durable migration or protocol bump is required.

The volatile thread-gallery snapshot now includes `readyRemoteRefs` and `readyRemotePaths` alongside pending coordinates. `GALLERY_CACHE_FORMAT_VERSION = 2` stamps admission metadata; lookup rejects and removes missing/format-1 entries before reading their older three-field shape. Both owned and byte-overflow weak admission paths validate and charge the new fields. Pre-upgrade regression fixtures prove old warm snapshots are refused and recomputed. Collector, admission, hook and empty snapshots all use the five-field shape.

### Complete tool-image collection — volatile cache format 3

The gallery now collects every displayable image in each tool payload, while the transcript card keeps its first-candidate behavior. Format 3 invalidates warm format-2 snapshots that may omit later images or their readiness coordinates. The five-field collection shape and logical retention budgets stay unchanged; pre-upgrade tests include format 2. This cache is document-local. Persisted canonical image bytes, database, authenticated image references, IPC, remote wire, deployed helpers and service-worker formats remain valid. Existing content hashes identify the updated renderer assets.

### ACP model groups and context breakdown — existing optional capability fields

ACP group projection now fills the existing optional `subProviders` and
`modelSubProvider` fields in the capability and GUI-override schemas. Flat or
older cached capabilities remain valid, with no sections until the normal
detection refresh. Status cache 42, renderer status-store 38, usage cache 10,
IPC/remote schemas, generated native bindings and SQLite formats stay unchanged.
Group advertisement is separately gated; the inert retention change never
rewrites a model value or its independent effort selection.

Provider transforms may annotate standard usage updates with a same-bundle
`poracodeUsageBreakdown` pair. The shared mapper validates it against the
authoritative occupancy before filling the already-optional context breakdown.
Absent, malformed or inconsistent annotations retain the prior event shape;
old persisted context rows stay valid and are not backfilled. Account usage and
per-call accounting samples are unchanged. Vendor stats never become an extra
usage sample. The internal annotation is not an IPC, wire, cache or persisted
format, so no compatibility version or migration is required. New source hashes
distinguish the runtime; the J frozen app predates these two enrichment changes.

## Negotiated composite reasoning inventories (status caches 43 / 39)

Supervisor status cache 43 and renderer status store 39 invalidate older derived
inventories that suppressed a negotiated reasoning selector based on a model's
catalog classification. A composite model ID can have a separate native ACP
thought-level control; detection now retains its negotiated ladder. Previous
supervisor version 42 and renderer version 38 fixtures are discarded before
startup hydration, including an otherwise valid inventory with an empty model
ladder. Settings, persisted thread config, profile format, native session scope,
IPC and remote protocols keep their existing shapes and versions.

The provider's ACP launch defers independent composite effort to the live
selector without removing it from the saved config. Repeated submits validate
unchanged values against the current native ladder; a model switch waits for
the target's options through strict config sync. Terminal and one-shot selection
semantics are unchanged. No guessed migration rewrites historical thread choices.

## Family-relation composite inventories (status caches 44 / 40)

Supervisor status cache 44 and renderer status store 40 invalidate older derived
inventories that carried the raw flat composite model list plus a legacy
composite Fast declaration on the raw capability path. Family-relation
projection derives from fresh capability data instead of reinterpreting those
cached rows. The optional `modelFamilies` descriptor on fresh snapshots is
additive: raw `models` remain the compatible selection inventory for clients
that ignore the relation. Previous supervisor version 43 and renderer version
39 fixtures are discarded before startup hydration. Invalidation discards only
the derived status inventory; thread data, settings, persisted thread config,
profile format, native session scope and ThreadConfig keep their existing
shapes and versions, and no saved thread choice is rewritten. The optional
capability descriptor is mirrored in the regenerated remote and native
contracts; clients that do not understand it retain the raw inventory fallback.

## Presentation-scoped family fallback (status caches 45 / 41)

Supervisor cache 45 and renderer status store 41 invalidate valid-shaped older
snapshots that copied a model-bound relation onto a surface with independent
native controls. A refreshed surface declares its own accepted relation or
omits it. Previous supervisor 44 and renderer 40 fixtures prove that this is
version-based invalidation, preserving unrelated persisted state and saved
thread choices. The explicit family-row versus exact-model edit intent and
presentation transition are ephemeral UI operations; they introduce no
serialized configuration fields or preference identities. Remote protocol 12
keeps the optional capability metadata and complete raw model inventory.

## Devin cloud profile setup — profile format 2

The provider-owned profile schema now writes format 2 with optional
`cloudDefaults` (repositories, persona and platform). Explicit format-1 profiles
retain their previous meaning and upgrade on Save. Format 1 carrying these new
choices is rejected rather than silently losing execution intent; future formats
are preserved but disabled. Regression fixtures exercise an old profile and
the previous format-1 reader, which refuses format 2. Unknown profile keys
remain preserved. Account-root manifests remain format 1.

These mutable launch choices change detection generation, not the immutable
account/organization/runtime resume scope. Activated cloud resumes retain their
workspace; fresh and pending sessions apply explicit choices before the shared
composer configuration. The generic opened-session hook and qualified select
predicate are internal runtime declarations, not serialized capabilities.
Agent-instance config already travels as opaque provider JSON; no new IPC,
remote, native-client DTO, SQLite or helper-envelope fields are added. Public
remote protocol 12 and client-host hop 16 remain valid. Existing profile readers
delegate validation to the same provider schema, and bundled source identity
distinguishes the new launch implementation.

## Typed missing-session send refusal (thread-send 422) — additive, no version bump

The supervisor's `sendThreadInput` throws the typed absence refusal
(`unknown_thread_session`, `src/shared/threadSessionRefusal.ts`) when no session
exists after the pending-start join. The refusal travels three ways and every
boundary stays additive: the supervisor IPC reply reuses its existing optional
`errorCode` string field (documented additive since introduction; an older host
that does not know the code degrades to the historical message-only Error, and
an older supervisor that sends no code leaves the host on the plain-Error path);
the remote `thread-send` route answers it with HTTP 422 and body code
`unknown_thread_session`, which fits the open `remoteHttpErrorSchema`
(`code: string.min(1)`) — clients classify the definite rejection by the 4xx
status rule alone, and native `RemoteMutationClassification` needs no new entry;
and the legacy exact message `Unknown thread session: <id>` is preserved
verbatim in every carrier, so existing client message matchers keep working.

No receipt migration: the `remote_command_receipts` states are unchanged. Rows
recorded `uncertain` for thread-send before this change stay `uncertain`
forever — the idempotency claim guard replays the typed uncertain 409 and never
reclassifies or replays them, even though newer attempts can prove pre-effect.
Only the newly typed refusals record `failed`, and a same-id replay of a failed
row stays the definite `command_failed` 409. Predecessor message-only refusals
keep the raw 500 with the conservative `uncertain` receipt: the host applies no
message regex fallback, so the typed code is the only proof.

### ACP correlated text snapshots

The provider-to-mapper `poracodeTextStream` annotation is an in-process
normalization declaration, not a persisted or client wire field. Authoritative
snapshots emit the already deployed `content.delta` event with `replace: true`.
No remote, IPC, profile, or usage cache version changes are required. The
correlation store is session-local and bounded; a new mapper has no inherited
correlation state. Regression coverage must prove ordinary unannotated append
semantics, owner isolation, and late replacement of a closed item.

Replacement-only canonical effects do not reopen or extend autonomous work.
This is same-bundle runtime classification, with no serialized field or cache
change. Prompt completion and genuine autonomous append activity retain their
existing contracts.

## Provider default model visibility (status caches 46 / 42)

The supervisor status cache v46 and renderer status store v42 invalidate
previous derived inventories that lacked provider-owned default visibility.
Defaults hide older native catalog versions only when a newer version of the
same model line exists; recommendation labels do not override version age.
Both caches must refresh together; the preceding v45/v41 snapshots can be
structurally valid while still offering superseded models by default. Explicit
user hidden-model lists, including an empty show-all list, remain authoritative.
No saved thread model, profile, protocol, or native schema changes: the existing
optional `defaultHiddenModels` field carries exact native model IDs. The native
catalog cache is process-local and refreshes on restart. Pre-upgrade tests pin
rejection of valid-shaped old caches and preservation of unrelated settings.

## Thread workspace grant custody (schemas 55–56)

Migration 55 is forward-only. It adds host-owned committed `additional_directories`
and `workspace_grant_revision` columns plus a bounded operation journal. Existing
schema-54 rows migrate to `[]`/0 without changing prior payload/history evidence.
Ordinary thread upserts and full/delta replica synchronization omit both grant
columns; only the internal CAS store can publish committed intent. Pending,
dispatched and ambiguous candidates remain separate and cannot become saved
permissions. Missing custody schema is not repaired by recreating empty tables.
Older app versions reject newer databases; use the normal backup and
forward-upgrade path.

Forward-only migration 56 freezes the original migration-55 creator in
`threadWorkspaceGrantsSchema55.ts`. It adds host-minted immutable row
incarnations and a private committed-scope flag. Relevant thread/project owner
changes advance the existing revision, including empty-scope A → B → A changes.
Delete/recreate receives a new incarnation. Owner-only revisions leave
never-scoped launches on the legacy path; explicit committed empty grants still
use the scoped launch bridge. Safe-integer exhaustion refuses the whole owner
change. The migration preserves historical journal bytes and terminal replay;
old unresolved operations cannot publish against the new owner fingerprint.
Missing or partial custody refuses instead of synthesizing an empty journal.
Current admission also closes the persistent trigger inventory on the three
authority tables. Both expected DDL and that inventory are checked before
migration backfill or safe repair can write; conflicting triggers are refused,
never dropped. TEMP connection-local fault-injection triggers are outside this
persisted-artifact check. Pre-55 databases without custody retain safe repair.
Schema-55 startup artifacts reject schema 56. No public read shape changes.

The optional Thread read projections are additive to public remote protocol 12 and client
hop 16. No public grant mutation or launch field is introduced by this foundation.
The future replacement command requires a versioned host/supervisor capability,
confirmed quiescent reopen, reservation/retirement custody, explicit journal
cleanup/deletion policy, and an independent compatibility audit before enablement.
A legacy optional start field would be stripped by old hosts and is prohibited as
a grant carrier. Replica/browser/native caches never authorize filesystem scope.
App-store version 5 and agent-status versions 46/42 formats remain unchanged in this slice.

## Native string-bound semantics (generator 4)

Generator 4 corrects generated native JSON Schema `minLength`/`maxLength` and
string-union probes to count Unicode code points, matching current source Zod
and JSON Schema semantics. Swift counts Unicode scalars; Kotlin counts code
points. Combining marks remain separate code points. Terminal cursor offsets,
range validators, overlap accounting and buffered data retain UTF-16 units.

Binding format 2, manifest format 1, native-binding manifest format 5, public
remote protocol 12 and hop 16 keep their existing layouts. Generated manifests, native
validator/adapter/build version pins, tree hashes and parity fixtures must move
together to generator 4; native consumers built from v3 output must regenerate.
The readonly workspace directory projection uses portable count/path bounds;
host admission and persisted parsing separately enforce the aggregate 32,768
serialized-character budget and runtime execution-path policy. This change does
not enable folder mutation controls or authorize native notifications as grants.

## Approved workspace launch bridge (private runtime protocol 1)

`threadWorkspaceRuntimeProtocol.ts` defines a host-only `workspace-runtime-v1`
request, separate from the public procedure map and legacy start schema. The
support reply carries an exact version and supervisor-process incarnation.
Only committed SQL grants supply the complete primary/extra-directory/revision
snapshot; unresolved custody refuses launch. Support is cached only against the
actual child transport, and owner/revision, child identity and control epoch are
rechecked before dispatch. An older supervisor rejects the read-only support
request before any grant-bearing launch is sent. Public remote protocol 12,
hop 16, generated bindings and derived status-cache formats remain unchanged.

Version 1 promises immutable scoped start/ensure, not a live permission-change
transaction. New reservation/commit/reconciliation verbs require their own
compatibility audit before enablement. The full folder feature remains
unadvertised; prior schema-55 artifacts have no new grant writer exposed.
Schema 56 now rejects older consumers and adds monotonic SQL owner/incarnation
fences. Before enabling mutations, runtime reservations and positive retirement
evidence, receipt cleanup/deletion policy and durability must also be qualified.
Browser/native read projections never supply launch authority.

## Saved model selection writer admission (SQL 57, settings document 2)

Migration 57 is forward-only and deliberately changes no model/config rows or
DDL. It advances the database marker to reject older schema-56 consumers; it
does not infer or backfill selection intent. The historical schema-56 prefix
regression verifies unchanged rows and schema through that upgrade.

The settings authority now writes `$poracodeSettingsVersion: 2`. Documents
without a marker and version-1 documents remain readable without disk backfill.
Only an admitted commit advances their marker. Malformed/future document
versions remain refused. Existing unknown fields and ciphertext are retained.

Prepared settings writes require the actual successful Core connection, current
connection identity, unchanged filesystem root/database file, exact fresh SQL57
marker, and live custody. Desktop borrows its existing data fence lazily when
opening settings; headless retains its kernel lease and supplies the Core check.
No captured schema number, projected renderer state, or invented UUID grants
write authority. Refused database close retains custody until actual close.

For known provider draft and seven utility-selection containers, conservative
reads remove only unrecognized selection metadata from the public projection.
Actual model/options and original metadata remain unchanged. Legacy model
migrations do not reinterpret those protected containers. Unsupported metadata
makes the containing settings document read-only, including unrelated commits
or replacements that omit it. Every existing persistence checkpoint rereads
the authoritative file and compares it with the committed document; changed
outside data is refused instead of overwritten. Arbitrary plugin data is opaque.

Thread configs and project drafts retain their historical lossless JSON read
semantics, including empty or model-less legacy configs; they are not revalidated
as fresh launch payloads. Schedules and PR-watch configs retain their existing
known-field validation. All four remove unsupported selection metadata only
from the public projection and preserve stored bytes. Fresh requests remain
strictly validated. Their full-row writers check original raw storage inside the actual write transaction,
including replacements that omit metadata. Sync preflights replacement IDs
before deletes or cascades; duplicate-project repair checks both drafts and a
colliding watch's losing config before retiring it. Independent scalar updates
retain config bytes. These guards complete another part of the existing,
unreleased SQL57 boundary and introduce no new storage shape or migration.

These are bounded settings/Core/DB compatibility checks, not full release
qualification. Service and launch admission before external effects, complete
control propagation, derived cache boundaries, native readers/writers, and the
complete previous-app/restore/manual matrix remain separate required work.
Current-process fixtures do not establish compatibility with a complete previous
released application artifact; earlier migrations and imports remain unqualified.

## Surface-scoped family intent (status caches 47 / 43)

The supervisor agent-status cache advances from 46 to 47, and the renderer's
persisted status store from 42 to 43. Both discard older derived inventories
and request fresh detection; cached menus are not migrated into selection intent.
Previous-version fixtures use valid capability shapes and exercise the real
supervisor read and renderer rehydration paths, so refusal does not depend on
a parse error. Unrelated renderer state retains the existing migration behavior.

Providers may now advertise their already-versioned, surface-scoped
`redundantValues` declaration. Terminal and CLI print consumers compare saved
evidence with the independently supplied full adapter kind and concrete
presentation. Warm catalogs still resolve every original control. Cold resolution
may remove only matching, recorded, declared inert entries from a temporary
view; unrecorded controls still pass through the conservative gate, and saved
config bytes and the requested model ID remain unchanged. A matching record
does not authorize accounts, execution targets or session recovery.

This completes the bounded declaration/consumer/cache change. Optional runtime
route-ID propagation, native ACK handling, utility presentation declarations,
handwritten native codecs, old-artifact upgrades and full manual qualification
remain required. Provider-local function signatures changed; serialized wire,
binding format 1 and generated artifact formats did not change in this step.

### PR-watch execution admission (unreleased SQL 57)

PR-watch fix launches gain fresh raw execution admission and narrow runtime
patches. `dbReadPrWatchExecutionSnapshot`/`dbAdmitPrWatchExecution` read the
authoritative `pr_watches` row by key and refuse a launch whose row is gone,
changed (branch, worktree, automation flags, full opaque `agent_kind`,
own-presence-sensitive model/effort/fast/thinking/contextSize/selectionBinding),
or carries unsupported raw selection data; the launch-result and status writes
moved to `dbPatchPrWatchRuntime`, a status-only column patch that never reads
or serializes the config column, never resurrects a deleted row, and never
refuses on a protected row. There is no DDL, wire, cache, or catalog change:
rows written by current builds remain fully valid under the unreleased schema,
the guarded full-save refusal semantics are unchanged and still cover every
public upsert/sync ingress, and deletion remains an ungated retirement. The
launcher's per-call launch-admission options are an ephemeral host-only
callback — never serialized into a request or tool schema. Valid callers
without this callback retain their launch behavior; malformed controls and
unsupported selection metadata are now refused before Home creation or
worktree effects, including callers without the optional callback.

After an awaited permission or checkout operation, launch admission rechecks
the actual project location and remote identity as well as the selection.
Launch results that cannot be attached to the current watch remain owned until
the supervisor positively confirms retirement. A refused retirement retains
the thread ID, blocks another fix for that watch, and prevents successful
disposal; a later explicit disposal can retry. These callbacks and pending
custody are host-local, with no new persisted field or serialized format.
Current-source unit and SQLite regressions qualify these seams separately;
they do not qualify previous released artifacts or native/manual workflows.
Projectless sidebar chats use the existing persisted Home scope ID and projected remoteId. The host prepares that built-in row before client attachment; the chat surface opts into mirroring Home rows and conversations while desktop remote mirrors retain their prior exclusion. This uses existing Project and Thread shapes, credentials and launch protocol, so schema and wire versions stay unchanged. Pre-upgrade empty profiles and saved Home rows remain valid; regressions cover empty-profile bootstrap, existing Home identity, flat chat selection and refresh without desktop navigation.

Sidebar-inherent composer tools use a same-bundle React context, with the existing
per-thread MCP launch flags. They do not add persisted settings, wire fields or
helper formats. Host restrictions and provider scopes keep their meaning, and
existing sessions retain their bindings. Schema, transport and sidebar bootstrap
versions remain unchanged; content-hashed renderer assets identify the new UI.
Regressions cover implicit launch enablement without settings write-through,
hidden plugin controls, and unchanged desktop controls outside that context.

Sidebar desktop layout is derived from the existing client surface and build
target, with no saved preference or protocol field. Content-hashed renderer
assets invalidate the old presentation; persisted profiles and bootstrap
credentials remain compatible. Narrow extension/preview regression tests keep
desktop menus active while ordinary narrow web clients retain compact layout.
Restored sidebar conversations reuse the existing remote reattachment lifecycle;
cached histories remain provisional and refresh from the host. No offline cache
shape, subscription message or persisted state format changed.

### Per-turn client context (`clientContext`) — additive optional input field, no version bump

`StartThreadPayload`, `SendThreadInputPayload`, `SetPendingSteerPayload` and the
`start` remote thread command accept an optional `clientContext`
(`src/shared/contracts/turnClientContext.ts`). The extension chat sidebar uses it
to report browser focus and its own window's active tab (id, bounded title and
an http(s) URL reduced to origin and path — no credentials, query or fragment)
at submit time. The supervisor re-applies that URL reduction and escapes C1,
line/paragraph-separator and bidi characters, because any trusted client can
forge the field within its schema bounds. It renders the context as untrusted,
provider-only text for exactly that turn: it rides `QueuedStructuredTurn.turnContext`
through queued follow-ups (record snapshot, preserved across text edits), staged
or native steers and restarts, and is never stored on the session, the thread
row, the derived title, the painted user message, the follow-up queue projection
or the desktop-mirrored start command. Writers: the extension sidebar renderer
only; readers: host routes, the supervisor IPC schemas and the structured turn
path. A structured handle may declare `placesTurnContext` to receive it as
`StartTurnOptions.turnContext`; every other handle receives it at the front of
its existing `inlineInstructions`, except on a prompt that invokes a non-skill
command the session advertised in `slashCommands` (the command is dispatched by
the provider, so appended text would become its arguments). Pi's native steer
now delivers `inlineInstructions` like its prompt path.

Compatibility decision: no protocol, binding-format, hop or capability bump.
Older clients never send the field. An older host's object schemas strip it and
the turn runs without context — the same outcome as an unavailable tab — and no
client reports delivery or changes behavior on success, so (unlike
`threadLaunchMetadata`) there is nothing a capability gate would protect. The
receipt digest covers the field, so a retried send must reuse its retained body
(existing retry paths already do). Nothing is persisted, so there is no
migration. Regenerated mirrors: `protocol/remote/v3/generated/**` (additive
optional `clientContext` on the send/steer/start/command bodies and procedure
payloads; `manifestHash` unchanged, `sourceHash` and structural-type/file counts
re-pinned in `native/generate.test.ts`). Native iOS/Android clients ignore the
optional field. Regressions cover multi-window capture, bounded fallback,
send/queue/steer/restart delivery, queue-snapshot isolation, route forwarding
without desktop mirroring, browser focus without the extension API, URL and
Unicode hardening on both sides, advertised-command passthrough (runtime,
OpenCode 2 native compact and command arguments, ACP command mapping) and Pi
fresh and live steers.

### Sidebar saved-credential reconnect protection (extension 0.2.2)

Extension 0.2.1 protected bootstrap but allowed its sidebar to reconnect durable
vault bearers before native proof. Extension 0.2.2 installs a document-local
transport factory policy as the first renderer bootstrap dependency, before
store hydration and parent effects. Version-2 saved-server metadata and access /
refresh vault entries remain readable but confer no transport authority. Only a
fresh worker bootstrap and its currently proved hello nonce / loopback endpoint
create a grant. Its initial and most recently rotated access tokens, latest
refresh token, pending requests and at most 32 unspent event tickets are volatile;
retirement aborts requests, closes sockets and removes online selection. Reload
and proof loss require a new pairing. Old clients cannot borrow a later grant.
The original access token remains admitted within that grant because the shared
store rotates its refresh vault without rewriting the server record's bearer.

The package manifest advances 0.2.1 → 0.2.2. Worker-local `getChatConnection`
returns `{version: 1, session: <hello nonce>, endpoint}` only after a validated
bootstrap on the current authenticated socket; otherwise null. This read-only
command mints nothing and writes no storage. Every HTTP request (including OAuth
refresh and image reads) and event socket opening checks it again. Redirects are
refused. Missing/old worker implementations fail closed. Worker and renderer
ship atomically in the MV3 package, so the host bootstrap/HMAC protocol stays 2,
native messaging protocol and artifact stay 1, remote wire stays 12, and saved
server storage stays 2. No generated IPC, native contract, operation map or vault
migration is required. Shared PWA/Electron factories retain their defaults.

Already loaded 0.2.1 renderer/worker packages must be updated and reloaded; an
app-only update cannot retrofit this renderer gate or revoke bearer copies that
were already disclosed. HTTP and native/bridge sockets are separate transports:
this is a fresh dispatch-time worker liveness check, not a cryptographic binding
of the HTTP connection. In-flight bytes cannot be recalled, and a bridge failure
that the worker has not yet observed retains the inherent loopback TOCTOU window.
Idle sidebar retirement polls every four seconds; each HTTP/socket dispatch has
its own uncached check. Worker-message waits are bounded to five seconds.
Regression fixtures seed actual encrypted pre-upgrade vault slots, exercise
mount/resume/online/visibility, background refresh, retry and event backoff,
reject lost-session refresh after 401 and stale tickets, select only the current
host, and retain record-based clients across refresh rotation.

## Installed terminal font preference

`terminalFontFamily` is an additive device-local shared-settings field. Its empty
string default retains the existing bundled terminal stack for legacy flat JSON,
settings-document version 1 and renderer localStorage. Existing font-size values
keep their meaning. Settings document version 1 stays valid; no migration or
cache invalidation is needed. Legacy normalization supplies the default, while
the host document reader rejects malformed present values. Saved unavailable
families remain intact and CSS falls back to the existing readable stack.

The preference is absent from both remote settings projections (runtime and
contract generator) and from `REMOTE_SETTINGS_KEYS`: browser clients persist it
in their own localStorage without changing the paired host. Native iOS/Android
settings bindings retain their existing independent typography and wire shape.
Installed-font enumeration uses the client platform API, not a new IPC or host
route. Only the registered main app renderer's main frame has Electron font
permission; browser origins and subframes retain denial. Client/host hop 16,
remote protocol 13, settings transaction version 1 and current native generated hashes
remain unchanged by font selection. Terminal caches and prewarm state are disposable, process-local
objects; remounted cached terminals apply the current preference. Tests cover
legacy documents/defaults, local-only projection, permission scope, CSS escaping,
prewarm and live terminal changes without replacing the PTY surface. The editable
font picker uses the same single-family validator and escaped CSS stack for installed
suggestions and typed names; it introduces no stored or wire shape changes.

Migrate startup admits workspace custody read-only before committing any pending
migration or its forward-only schema marker. Unsupported schema versions are
refused first. A database rejected for an unexpected custody trigger therefore
keeps its prior schema version and remains eligible for an older artifact. This
reuses the existing preflight and changes no storage shape or version. The
schema-56 startup regression preserves raw schema, rows and custody journal on
refusal; legacy-read regressions preserve config bytes and writer protections.

## Native stored-pairing upgrade eligibility (remote protocol 13)

Remote protocol 13 changes wire admission only; the stored host/token binding
shape is unchanged. Reviewed stored generations 9–12 are listed explicitly in
both mirrored copies — Android `storage/StoredProtocolUpgrade.kt`
(`isEligibleStoredProtocol`, `importedBinding`) and iOS
`PreservedPairingUpgrade.isEligibleStoredProtocol` in
`Storage/SessionCredentialTypes.swift`. Keep them identical and never derive
the list from `current - 1`.

A v12 host record, single-host v2 source, or split-v1 source keeps its original
binding on import. It is rebound to 13 only by the existing verified upgrade
(public descriptor at the current protocol with a matching `desktopId` and read
scope, then an authenticated snapshot read) and the existing journaled host
write. A live v12 host, a different host, offline, or 401 refuses and preserves
the record, token and connection id. Future bindings stay refused. No storage
schema, journal or registry format changes. On the next protocol bump, review
whether 13 joins both lists and add matching regressions on both platforms
(`StoredPairingUpgradeTest`, `LegacyProtocolUpgradeTest`,
`AppSessionCompositionTests`, `HostImportTests`).
