# Host ownership and local control

The standalone server enters through `createHeadlessRemoteHost`. It acquires a
`HostOwnerController` before root preparation, credential initialization, SQLite
open or service construction. `headlessRemoteComposition` receives the resulting
private runtime capability and backs the host's single settings authority with
its lease and credential capabilities. Electron startup now adopts the same boundary for
its managed mode: the desktop owner leases the shared kernel lock and, at
ready, publishes the shared authenticated control surface (kind `desktop`,
`describe` only — desktop attach admission is refused at the compat gate until
the coordinated flip). Desktop attach, existing-profile activation and the
usage custody migration remain required V4 work; the settings custody
migration is now wired through the per-composition settings authority
(desktop process-lifetime lease adapter until the desktop unification).

## Profile namespace and actual data root

`PORACODE_BASE_DIR` names the original **profile namespace**, not the directory
that the new server writes. This applies to the default profile and an explicitly
configured absolute path. For a namespace `R`, the version-1 layout is:

| Path                  | Purpose                                                                               |
| --------------------- | ------------------------------------------------------------------------------------- |
| `R`                   | Original namespace/legacy state; never opened as the new application database         |
| `R.host-v1`           | Actual owned server data, including SQLite, settings and credential files             |
| `R.client-v1`         | Reserved separate Electron device-state root; desktop wiring remains pending          |
| `R.host-owner.sqlite` | Permanent kernel lease outside replaceable data directories                           |
| `R.host-owner.json`   | Informational owner generation/phase metadata                                         |
| `R.host-data.sqlite`  | Data-custody fence held by the writing backend for its lifetime (desktop child today) |

Startup prints both the canonical namespace and actual server root. Existing
namespace symlink spellings resolve to one identity; a mapped owned/client root
cannot itself be a symlink. Passing an actual `.host-v1` root back as the namespace
is refused to prevent accidental nesting. `resolvePoracodePaths` remains a literal
root helper: backend, supervisor and workers must not apply the mapping again.

The sibling layout keeps a legacy process configured with `R` away from the new
server's writable root even if that process does not understand the lease. A PID
preflight alone could not prevent a later legacy launch. This is not protection
against a same-privilege actor deliberately editing private state or pointing an
old binary at the internal owned root.

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

An empty namespace can initialize a fresh owned root. A nonempty legacy namespace
without an already valid owned-root manifest is refused. Existing owned manifests
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

A usable existing-profile upgrade is still pending. Activation must revalidate
actual staged database/file hashes and deliberately handle credentials, paths and
automation. Recovery for legacy settings/key state without `state.sqlite` also
remains open. A staged root stays refused by normal startup until that work exists;
manual marker edits or moving the old directory are not a supported activation.

## Authenticated owner control

The live owner publishes `host-control.json` only after one IPv4 loopback listener
has opened. Format 1 contains canonical namespace/root, owner generation, a
loopback port and a fresh 32-byte MAC secret. It is a bounded regular private file
(mode 0600 on POSIX), validated against current owner metadata. It is excluded from
backup import and carries no storage key, remote access token or pairing URL.
The Node client lives in `src/backend/ownership`, outside renderer-facing code.

Protocol 1 admits only `POST /control`, exact `Host: 127.0.0.1:<port>`, JSON content
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
construction/start. It reports failure without forcing exit
when partial construction or shutdown cannot confirm those joins. Full provider/
PTY descendant termination and the cross-platform outer process escalation remain
separate F11 acceptance work.

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
