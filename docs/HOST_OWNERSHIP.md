# Host ownership and local control

The standalone server enters through `createHeadlessRemoteHost`. It acquires a
`HostOwnerController` before root preparation, credential initialization, SQLite
open or service construction. `headlessRemoteComposition` receives the resulting
private runtime capability and backs the host's single settings authority with
its lease and credential capabilities. Electron startup now adopts the same boundary for
its managed mode: the desktop owner leases the shared kernel lock and, at
ready, publishes the shared authenticated control surface (kind `desktop`,
`describe` only — desktop attach admission is refused at the compat gate until
the coordinated flip). Desktop attach and the usage custody migration remain
required V4 work; the settings custody
migration is now wired through the per-composition settings authority
(desktop process-lifetime lease adapter until the desktop unification).

Since the V5 data-root unification both host kinds own the SAME data root for
a profile: the desktop-managed host adopts `<namespace>.host-v1` exactly like
the standalone server, and the historical plain desktop root is promoted into
it automatically on the first managed launch (see the promotion section below).

## Profile namespace and actual data root

`PORACODE_BASE_DIR` names the original **profile namespace**, not the directory
that the owned host writes. This applies to the default profile and an explicitly
configured absolute path. For a namespace `R`, the version-1 layout is:

| Path                  | Purpose                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `R`                   | Pre-promotion desktop state (preserved untouched after a promotion); never opened as the application database by an owned host |
| `R.host-v1`           | Actual owned host data for BOTH host kinds, including SQLite, settings and credential files                                    |
| `R.client-v1`         | Reserved separate Electron device-state root; desktop wiring remains pending                                                   |
| `R.host-owner.sqlite` | Permanent kernel lease outside replaceable data directories                                                                    |
| `R.host-owner.json`   | Informational owner generation/phase metadata                                                                                  |
| `R.host-data.sqlite`  | Data-custody fence held by the writing backend for its lifetime (desktop child today)                                          |

Startup prints both the canonical namespace and actual server root. Existing
namespace symlink spellings resolve to one identity; a mapped owned/client root
cannot itself be a symlink. Passing an actual `.host-v1` root back as the namespace
is refused to prevent accidental nesting. `resolvePoracodePaths` remains a literal
root helper: backend, supervisor and workers must not apply the mapping again.

The sibling layout keeps a legacy process configured with `R` away from the
owned host's writable root even if that process does not understand the lease.
A PID preflight alone could not prevent a later legacy launch. This is not
protection against a same-privilege actor deliberately editing private state or
pointing an old binary at the internal owned root.

The SQLite lease is acquired exclusively and retained for the owner's lifetime.
Only successfully acquired, unreleased leases are strongly retained; abandoning a
JavaScript reference does not release ownership. Process death releases the kernel
lock, and a successor receives a fresh generation. PID metadata is not lock
proof. Never read, hash, copy or open the leased SQLite inode with an unmanaged
file descriptor in its owning process: closing such a descriptor can release
POSIX locks belonging to the SQLite connection.

The data-custody fence (`hostDataFence.ts`) closes the fork handoff gap: the
lease proves the owner process, the fence proves the writer. A forked desktop
backend child takes `<namespace>.host-data.sqlite` before its SQLite opens and
releases it only after the database closes, so an owner killed while its child
still drains cannot be succeeded by a second writer. Owner admission acquires
the lease, probes the fence with a bounded wait, then releases it before the
fork; the lease closes that handoff gap. The fence follows the lease file
idioms exactly (never unlinked, exclusive from first open, unknown future
`user_version` refused). A process that predates the fence holds no fence; the
legacy-contention refusals cover that case.

## Preparation and credentials

An empty namespace can initialize a fresh owned root. A nonempty legacy
namespace without an already valid owned-root manifest is refused for the
standalone server; the desktop launch promotes such a namespace automatically
(see above) under the same refusals. Existing owned manifests
and credential provenance must match the namespace, root, format and mode. Unknown
formats, malformed keys, mismatched fingerprints and cross-mode credentials do
not trigger silent replacement or rotation.

The headless entry uses the existing `secret-key.headless` format when no key is
injected. `PORACODE_SECRET_STORAGE_KEY` supplies an explicit 32-byte base64 key;
its exact fingerprint must remain consistent on subsequent starts. Explicit blank
input is invalid. A matching injected key may reuse file-backed provenance, but
this does not authorize arbitrary mode conversion. Relay credentials are also
read or created under the live lease; blank, malformed or conflicting relay
values are refused. Key material and persistence capabilities stay in private
runtime composition, outside control replies and remote snapshots.

The shared credential helper also models OS-sealed and session-only modes for
future desktop composition. A session-only capability refuses new durable secret
ciphertext. The settings adapters now enforce that guard at every real writer:
the headless composition passes the live `assertCanPersistSecrets` capability
into its settings authority, and the desktop composition asserts the
always-persistent desktop key until the HostOwnerController unification. The
usage adapters must enforce the same guard when they activate; having the helper
alone does not finish their activation.
Native callbacks may seal or unseal bytes for a captured owner generation. They
receive no key-file path and perform no owner-root filesystem operation.

The explicit import helper stages an independent offline database backup and
inventory with activation required. It never automatically enables schedules,
provider sessions or root-owned path references. It refuses source identity aliases
of protected original/owned roots before opening SQLite. The supplied backup may
undergo SQLite backup/WAL bookkeeping; it is not promised byte-for-byte untouched.
Original profile state is not opened as SQLite by that helper.

Activation revalidates actual staged database/file hashes and deliberately
settles credential custody before the staged root may start services. The
desktop's own plain-root upgrade is no longer manual: the automatic promotion
stages and activates the historical profile on the first managed launch (see
the promotion section below), while an explicitly staged offline backup still
requires the deliberate `poracode-server activate` step — automatic promotion
never activates an import it did not stage itself. Recovery for legacy
settings/key state without `state.sqlite` also remains open; manual marker
edits or moving the old directory are not a supported activation.

Activation journals its mutation window (Gates 2-3 Batch 3). A running
`host-operations.json` record with the frozen custody plan (credential outcome,
archived key names, adopted-key fingerprint — never key material) is claimed
before the first custody side effect and settled after the activation record is
written. A crashed attempt therefore leaves explicit evidence instead of a
silent half-state: a root whose custody verifiably applied resumes to its
activation record under a fresh lease, a root untouched by the interrupted
attempt is superseded and re-activated fresh, and any other mid-custody state
(adopted key with a foreign fingerprint, lost key material, changed staged
receipt or database) refuses with the typed
`HOST_ACTIVATION_INTERRUPTED` disclosure naming the recovery, instead of the
generic inventory mismatch. The journal is bounded (32 records, terminal
records expire after 60 seconds, capacity is refused rather than evicting) and
is excluded from import inventory like the other owned markers.

## Automatic desktop data-root promotion

Before the unification the desktop owned the plain namespace `R` while the
standalone server owned `R.host-v1` — two data lineages, so attaching Electron
to a server showed a different workspace and no upgrade path existed. The
desktop now promotes its plain root into the owned sibling on the first
managed launch (`src/backend/ownership/promoteDesktopRoot.ts`):

1. **Staging.** The plain root is staged into `R.host-v1` with the same
   `stageHostImport` machinery an explicit offline import uses (exclusive
   SQLite lock + online backup, verified file inventory, staged receipt, and
   a manifest marked `activation: required`). The offline declaration holds
   by construction: the shared kernel lease and the data-custody fence
   exclude every other writer while the promotion runs. A previous
   hard-killed run's WAL/hot-journal bookkeeping is folded into the database
   by a checkpoint before staging so the source is a consistent snapshot.
2. **Custody.** A journaled `promotion` operation
   (`host-operations.json`, same journal the explicit activation uses)
   covers the custody window: the desktop's OS-sealed key file
   (`secret-key.safe`) STAYS at the root — desktop custody, nothing is
   archived — the credential state records the verified key fingerprint
   (mode `os-sealed`; `session-only` on launches whose OS-backed secret
   storage is unavailable), and the root manifest flips to its activated
   `ready` form. The versioned activation record (`host-activation.json`)
   carries the decision evidence, including the promotion source.

Crash safety: staging is atomic (a temp directory renamed into place), so an
interrupted staging leaves either no owned root (the next launch re-stages)
or a complete staged root with its receipt. Every custody step is covered by
the journal, and resumption re-derives the remaining work from durable
evidence only — a promotion interrupted at any point completes idempotently
on the next launch without duplication or loss. An interrupted attempt whose
on-disk custody contradicts its frozen journal plan refuses with the typed
`HOST_PROMOTION_INTERRUPTED` disclosure instead of reinterpreting state.

The promotion refuses loudly rather than guessing when:

- both roots exist with data and `R.host-v1` is not this promotion's own
  completed or interrupted staging (two independent roots are an operator
  decision, never a launch heuristic);
- `R.host-v1` is a staged import whose receipt names a DIFFERENT source —
  an explicitly staged offline backup must be activated deliberately with
  `poracode-server activate` and is never auto-activated;
- the owned root's manifest, receipt or activation record is unreadable.

The manual `activate` command remains the explicit override path and works
unchanged for staged imports.

### Rollback

The completed promotion never modifies the plain root (beyond SQLite folding
its own WAL into the database during the pre-staging checkpoint), so `R`
remains the exact pre-promotion copy. To roll back: stop every owner of the
namespace (the lease proves it), then delete or rename `R.host-v1` — the next
desktop launch re-promotes from `R`, or the plain root can be used directly
by a pre-unification binary. Going forward, `poracode-server backup --to
<directory>` captures a verified, receipted copy of the owned root
(`R.host-v1`) including its schema version and credential mode; restore it by
staging that directory and running `poracode-server activate`.

### Credential custody after a promotion

The promoted root keeps the desktop's OS-sealed key, so the desktop's stored
credentials remain decryptable with no migration step. A standalone server
started on the promoted root still refuses (`Credential mode change requires
explicit activation`) rather than silently rotating: adopting an OS-sealed
key headlessly requires the explicit one-time desktop cooperation protocol,
exactly as before the unification. A root the desktop initialized FRESH
carries its OS-sealed key file but no credential-state file until a promotion
or an explicit activation settles custody, so a headless start on it refuses
with the existing `Existing database credentials require explicit ownership
activation` disclosure instead of creating a competing key.

### Compatibility

Promotion journal records (`operation: "promotion"`) and the desktop custody
outcomes (`desktop-os-sealed-key`, `desktop-session-only-key`) live inside the
version-1 journal and activation-record formats. An old reader refuses these
values loudly instead of misreading an interrupted promotion as settled state;
the layout and format versions are intentionally unchanged.

## Authenticated owner control

The live owner publishes `host-control.json` only after one IPv4 loopback listener
has opened. Format 1 contains canonical namespace/root, owner generation, a
loopback port and a fresh 32-byte MAC secret. It is a bounded regular private file
(mode 0600 on POSIX), validated against current owner metadata. It is excluded from
backup import and carries no storage key, remote access token or pairing URL.
The Node client lives in `src/backend/ownership`, outside renderer-facing code.

Protocol 2 admits only `POST /control`, exact `Host: 127.0.0.1:<port>`, JSON content
and a kernel loopback peer. Any Origin header, alternate route/Host, upgrade or
content encoding is refused. The closed operations are `describe` and
`issue-pairing`; attach, arbitrary RPC and root selection are not supported.
Descriptions contain only noncredential endpoint information and preserve a
legitimate HTTP base path.

The discovery secret never crosses the socket. HMAC-SHA256 request proofs bind a
domain/version, method/path, exact Host, timestamp, fresh per-call nonce and exact
raw request bytes, including the generation and request ID. Response proofs use
a separate domain and bind that request proof, HTTP status and exact response
bytes. Fixed-length MACs are checked in constant time before the client parses or
trusts a reply. A process on a stale/reused port cannot impersonate the owner by
echoing public IDs. Remote OAuth tokens are not accepted for local control.

Requests are at most 4 KiB, responses 16 KiB and headers 4 KiB. Headers and body
have separate absolute two-second input deadlines; the client has a total deadline
of at most five seconds and follows no redirect. The listener admits at most eight
connections and sixteen outstanding requests. A transport timeout or abort does
not count as completion of its admitted action.

Mutation request IDs have a bounded deduplication window: retain up to 64 pending
or completed receipts, with completed receipts expiring after 60 seconds. A new
mutation at capacity is refused rather than evicting a retained receipt. A retained
mutation ID cannot be reused for another operation. The client never retries a
mutation automatically. An explicit retry after expiry can issue a new credential;
this is not immutable exactly-once execution. Replaying a receipt does not renew
an expired or consumed one-time credential. Control issues independent one-time
credentials so concurrent clients do not revoke each other's URLs. Existing
desktop QR rotation remains unchanged. No proof, request body, secret or pairing
URL is written to ordinary server logs.

Run `node dist/main/server.cjs pair --json` with the same `PORACODE_BASE_DIR` to
request `{requestId, pairingUrl}` from the owner. Serve logs provide addresses and
the pairing command, without an automatic credential URL. The former PID lock,
request-file polling and SIGUSR2 pairing path are removed. This authentication
boundary addresses another OS user without access to the private record;
same-privilege compromise is outside its scope. Windows file-permission and
installed-process qualification remain required.

## Shutdown and current proof limits

`cancelStartup()` closes initialization/import/readiness admission and abandons
native byte-transform waits while retaining the lease and initialized runtime
capabilities. Final `close()` joins admitted startup filesystem/SQLite work before
release. Runtime composition must first stop ingress and producers, join their
actual continuations, drain persistence and close the application database.

Headless disposal starts HTTP, local control, push, durable-service and supervisor
stops together, joins a concurrent start and all admitted push continuations, then
closes the database and owner. Push timers cannot restart work after stop and a
late rejection cannot remove a replacement credential. Failed or unconfirmed
joins keep ownership. The CLI registers SIGINT/SIGTERM before calling the factory,
forwards startup cancellation, and starts available runtime disposal while joining
construction/start. A failed or unconfirmed join reports failure and keeps the
hard deadline armed: the process force-exits 1 at the declared bound instead of
leaving a wedged owner alive, and that exit is what releases the lease. The
deadline is an in-process timer, so it cannot fire while the event loop is
blocked; the external stop bound for that case is the service manager
(`TimeoutStopSec`, launchd stop), and a direct foreground CLI run has no such
watchdog. The managed host announces its own stop to connected clients with a
WebSocket going-away close (RFC 6455 1001) before the transport grace terminates
sockets that ignore it. Full provider/PTY descendant termination and the
cross-platform outer process escalation remain separate F11 acceptance work.

Control discovery removal is best effort only after its listener, connections and
handlers have actually joined. A failure reports a fixed diagnostic without the
private path or secret. The closed port cannot answer; a stopped or successor
generation refuses the stale record. This cleanup exception never applies to a
failed listener or work join.

Real temporary leases, child contention, SQLite backup/seed operations and
loopback authentication tests cover these bounded contracts. The native-e2e
harness uses a synthetic credential, prepares fixtures under a temporary lease,
and exposes the actual data root separately from its profile namespace.
Real Node signal fixtures run the CLI with synthetic application services and a
real lease; they cover held factory/listener startup and failed-join retention.
These checks are not evidence of desktop attach, a usable legacy upgrade, packaged
Linux/Windows behavior, native store readiness, multi-client performance or 120 Hz
rendering. The remaining gates are tracked in `V4_MERGE_READINESS_PLAN.md`.
