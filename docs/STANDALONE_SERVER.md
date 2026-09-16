# Standalone server: artifact, install, operations

The standalone server (`dist/main/server.cjs`, built from `src/server/cli.ts`)
owns one Poracode profile outside any Electron checkout. This runbook is the
contract for **publishing that artifact, installing it on a supported host, and
operating it**: layout, install, service units, stop semantics, diagnostics,
backup, upgrades, and the recorded platform decisions (Linux `node-pty`,
Windows).

Ownership foundations (lease, data root layout, credential custody) are
described in [HOST_OWNERSHIP.md](./HOST_OWNERSHIP.md); the remote/relay client
story is in [REMOTE_ARCHITECTURE.md](./REMOTE_ARCHITECTURE.md).

---

## 1. Published artifact layout contract (v1)

`SERVER_INSTALL_LAYOUT_VERSION = 1` (resolved by `src/server/serverInstallLayout.ts`).
The install prefix separates **code**, **read-only resources**, and **data**:

```
<prefix>/                      install prefix (e.g. /opt/poracode)
├── package.json               name "poracode-server", private, engines node>=24.10,
│                              dependencies = the exact pinned runtime dependencies
├── lib/                       built CommonJS bundles for one release (immutable)
│   ├── server.cjs             the server entry (CLI + headless host)
│   ├── supervisor.cjs         the forked supervisor
│   ├── *.cjs                  shared chunks required by both
│   └── *.ssh-runtime-manifest.json   versioned build declarations (v4)
└── resources/                 read-only assets forwarded to supervisors
    ├── wsl-helpers/           REQUIRED
    ├── skills/                optional (absent = feature simply unavailable)
    └── plugins/               optional
```

**Data never lives in the prefix.** All writable state is under the profile
namespace selected by `PORACODE_BASE_DIR` — the owned `<namespace>.host-v1`
root, the sibling `.host-owner.sqlite` lease, and `.client-v1` device state
(see HOST_OWNERSHIP.md for the versioned sibling layout). The prefix should be
treated as read-only after install.

Provenance: `lib/` contents are exactly the files declared by the
`*.ssh-runtime-manifest.json` build declarations (hash- and byte-verified by
`readRuntimeBuildManifests`), and `package.json` dependencies are the union of
the manifests' `dependencies` pinned to the versions in the root
`package.json`. The same machinery assembles the SSH runtime tarball; the
assembly procedure below is the standalone-server application of it.

### Resolution and failure behavior

The running bundle resolves its resources in this order:

1. Explicit declarations win: `PORACODE_WSL_HELPERS_DIR`,
   `PORACODE_BUNDLED_SKILLS_DIR`, `PORACODE_BUNDLED_PLUGINS_DIR`. Each must
   point at an existing absolute directory or startup fails.
2. Otherwise the layout is inferred from the running bundle's directory:
   - **prefix shape** — `<prefix>/lib/server.cjs` with `<prefix>/resources/`
     and `<prefix>/package.json`; or
   - **checkout shape** — `<repo>/dist/main/server.cjs` with `<repo>/resources/`
     (development inside the repository).

Any other arrangement is a loud startup failure (`ServerLayoutError`) naming
the supported shapes — the server never silently boots with misresolved
resources (the pre-contract behavior this replaces). `wsl-helpers` is required
in every resolution; `skills`/`plugins` are optional.

Two operational consequences of this order, both observed in qualification:

- A shell spawned from inside a Poracode desktop app can inherit the three
  declaration variables pointing at that install's resources — explicit
  declarations win, so a hand-run `server.cjs` would silently use another
  installation's assets. `unset PORACODE_WSL_HELPERS_DIR
PORACODE_BUNDLED_SKILLS_DIR PORACODE_BUNDLED_PLUGINS_DIR` before manual
  runs; service units have isolated environments and are unaffected.
- Layout failures surface only after profile-ownership admission: on the
  default namespace an unstarted/import-required profile reports the
  ownership refusal first, and `ServerLayoutError` appears once the namespace
  itself is valid.

This is also why the SSH-launched helper runtime works unchanged: its launch
script declares all three directories explicitly, and explicit declarations
never consult the layout.

---

## 2. Build, assemble, install

### 2.1 Build (release machine, inside the checkout)

```sh
pnpm run build                     # dist/main bundles + build declarations
pnpm run prepare:package-assets    # resources/{wsl-helpers,skills,plugins}
```

### 2.2 Assemble the tarball

The procedure below is the contract; the Batch 2 qualification harness (run
out-of-checkout, local evidence under a gitignored `tmp/` path) is one
executor of exactly these steps:

1. Copy every file from the union of the `*.ssh-runtime-manifest.json` `files`
   lists into `lib/` (each is hash-verified against its declaration), plus the
   declaration files themselves.
2. Copy `resources/{wsl-helpers,skills,plugins}` into `resources/`.
3. Write `package.json` with the pinned union dependencies.
4. `tar -czf poracode-server-<version>-<platform>-<arch>.tar.gz -C <staging> .`
   and record the sha256.

The tarball deliberately contains **no `node_modules`**: native runtime
dependencies are installed at the target (below), which keeps the tarball
ABI-correct per target and matches the proven remote-runtime install path.

### 2.3 Install (target host)

Requirements: Node.js >= 24.10 on PATH (or at a known absolute path), `npm`,
and — on Linux — the native-module toolchain (see §7). macOS needs none of
that (prebuilds cover darwin-arm64/x64).

Canonical install procedure:

```sh
#!/bin/sh
# poracode-install.sh <tarball.tar.gz> [prefix]   (default prefix /opt/poracode)
set -eu
TARBALL="$1"
PREFIX="${2:-/opt/poracode}"

# Node floor identical to the SSH runtime requirement.
node -e 'const [maj,min]=process.versions.node.split(".").map(Number);
process.exit(maj>24||(maj===24&&min>=10)?0:1)' || {
  echo "poracode-server requires Node 24.10 or newer" >&2; exit 1; }

mkdir -p "$PREFIX"
tar -xzf "$TARBALL" -C "$PREFIX"
(cd "$PREFIX" && npm install --omit=dev --no-audit --no-fund --loglevel=error)

# Smoke: the bundle must resolve its own layout and dependencies.
PORACODE_WSL_HELPERS_DIR="$PREFIX/resources/wsl-helpers" \
  node "$PREFIX/lib/server.cjs" --help >/dev/null
echo "installed at $PREFIX"
```

Verification is `node <prefix>/lib/server.cjs` resolving `better-sqlite3` etc.
**inside the prefix** — with no `node_modules` on any ancestor path. If a
layout is wrong, the server refuses to start with a `ServerLayoutError`
naming the problem (§1).

A custom `better-sqlite3` N-API binary can be forced with
`PORACODE_BETTER_SQLITE3_NATIVE_BINDING` (validated at open; a missing file
fails loudly).

---

## 3. Running

| Variable                                | Meaning                                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `PORACODE_BASE_DIR`                     | Profile namespace (required for a dedicated service profile). The server owns `<dir>.host-v1`.                                        |
| `PORACODE_REMOTE_ACCESS_HOST`           | Bind host for the remote listener (default `0.0.0.0`).                                                                                |
| `PORACODE_REMOTE_ACCESS_PORT`           | Bind port; unset picks the first free port from 49152.                                                                                |
| `PORACODE_SECRET_STORAGE_KEY`           | Explicit base64 32-byte credential key (`headless-environment` mode). Absent → file-backed `headless-file` key inside the owned root. |
| `PORACODE_REMOTE_RELAY_URL` / `_SECRET` | Register with a relay for cross-network access.                                                                                       |
| `PORACODE_APP_VERSION`                  | Reported version; service units must pin it to the installed release — unset, the artifact reports `dev`.                             |

Startup prints the canonical namespace, the actual data root, and the listener
URLs. The health endpoint is `GET /.well-known/poracode/environment` and
answers JSON with `protocolVersion`, `hostMode: "helper"`, and `appVersion`.

The CLI against a running owner (same `PORACODE_BASE_DIR`):

```
poracode-server                                  # serve (foreground)
poracode-server pair --json                      # request a pairing URL
poracode-server status --json                    # authenticated describe
poracode-server doctor [--json] [--log-file <p>] # diagnostics (§5)
poracode-server backup --to <dir> [--json]       # verified backup (§6)
poracode-server activate [--json] [--sign-in-again]  # staged import activation (Gate 2.5)
```

## 4. Service units + stop semantics

**Stop is the signal path.** SIGTERM (or SIGINT) initiates the documented
drain: startup admission closes, owned work joins, the supervisor and database
close, and the process exits 0 with the owner lease released. This was
re-verified live against the packaged artifact in Gates 2–3 Batch 1 (the stop
drill ran out-of-checkout; its script and results are local, gitignored
evidence, not committed); the authenticated
host-control **stop operation was assessed in Batch 1's S2.2 decision and
deliberately not added** — the control surface stays `describe`/`issue-pairing`
only, and PID signaling is unsupported. Service managers stop the server by
sending SIGTERM, which is exactly the supported path.

### 4.1 systemd (Linux)

```ini
# /etc/systemd/system/poracode-server.service
[Unit]
Description=Poracode standalone server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=poracode
Group=poracode
Environment=PORACODE_APP_VERSION=1.0.0
Environment=PORACODE_BASE_DIR=/var/lib/poracode/profile
Environment=PORACODE_REMOTE_ACCESS_HOST=0.0.0.0
Environment=PORACODE_REMOTE_ACCESS_PORT=49152
# Credential key: keep out of the unit file. 0600 root-owned file with
# PORACODE_SECRET_STORAGE_KEY=... (omit to use the file-backed owned key).
EnvironmentFile=-/etc/poracode/server.env
ExecStart=/usr/bin/node /opt/poracode/lib/server.cjs
Restart=on-failure
RestartSec=5
# SIGTERM is the supported stop; give the drain time, then escalate.
KillSignal=SIGTERM
TimeoutStopSec=90
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/poracode

[Install]
WantedBy=multi-user.target
```

`systemctl stop` sends SIGTERM and waits through the drain — the supported
path, unchanged.

### 4.2 launchd (macOS)

```xml
<!-- /Library/LaunchDaemons/dev.poracode.server.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>dev.poracode.server</string>
  <key>ProgramArguments</key>
  <array>
    <!-- absolute node path on this host, >= 24.10 -->
    <string>/opt/homebrew/bin/node</string>
    <string>/opt/poracode/lib/server.cjs</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORACODE_BASE_DIR</key><string>/var/lib/poracode/profile</string>
    <key>PORACODE_REMOTE_ACCESS_HOST</key><string>0.0.0.0</string>
    <key>PORACODE_REMOTE_ACCESS_PORT</key><string>49152</string>
    <key>PORACODE_APP_VERSION</key><string>1.0.0</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>StandardOutPath</key><string>/var/log/poracode-server.log</string>
  <key>StandardErrorPath</key><string>/var/log/poracode-server.log</string>
</dict>
</plist>
```

`launchctl stop dev.poracode.server` sends SIGTERM — the supported path. The
`StandardErrorPath` log is the file to pass to `doctor --log-file` for the
redacted recent-errors tail (systemd units can equivalently
`journalctl -u poracode-server > recent.log` and pass that file).

---

## 5. `doctor` (read-only diagnostics)

`doctor` never acquires the owner lease, never writes, and never opens the
leased SQLite inode from inside an owning process (HOST_OWNERSHIP.md
invariant). The report (`formatVersion` 1) covers:

- **root** — canonical namespace, owned root, lease/fence paths, root
  manifest (`source`/`activation`), database presence;
- **lease state** — the recorded owner record (kind/phase/generation/pid +
  liveness) and a kernel-lock probe (`locked` / `free` /
  `skipped-same-process` / `unavailable`) that distinguishes a live owner
  from a stale record;
- **key mode** — credential mode, stored key-file name, fingerprint prefix
  (8 hex), whether an environment key is configured (never its value);
- **port / remote access** — published control discovery (port + generation),
  env-configured host/port, and a live authenticated `describe` when the
  owner answers;
- **versions** — app version, remote protocol version, host-control protocol
  version, runtime build source hash, Node/platform, and the resolved install
  layout;
- **recent errors** — bounded (64 KiB / 200 lines) tail of a `--log-file` if
  given, passed through redaction (pairing URLs, bearer/authorization values,
  key material, ≥43-char token runs).

Every section also produces a named `ok`/`warn`/`error` check; the CLI exits
non-zero when any check is `error`. `--json` emits the full machine-readable
report.

## 6. `backup`

`backup --to <directory>` captures one owned data root:

- **database** — SQLite's own backup API from a read-only connection with a
  busy timeout: a consistent snapshot that tolerates a live owner (WAL
  readers never block the writer). The delivered `state.sqlite` is
  checkpointed (self-contained), owner-private (0600), and has its schema
  version validated.
- **files** — every other regular file of the owned root copied through the
  import-staging primitives (`inventoryImportFiles` / `copyImportFiles`):
  symlinks, special files and multiply-linked files are refused instead of
  followed; the copy is re-inventoried and hash-verified. SQLite journals and
  the ephemeral `host-control.json` are excluded (mirroring the import
  exclusion list).
- **receipt** — `<destination>/poracode-backup.json` (`formatVersion` 1)
  written last: source root, owner record at capture time, credential mode,
  schema version, both sha256 digests, file count/bytes, and the explicit
  `databaseSource: "sqlite-backup-api-online-snapshot"`.

Refusals (loud, before anything is written): destination already exists;
destination inside or enclosing the profile's owned paths; owned root or
database missing; a source root containing symlinks/hard links; a pre-aborted
signal. A restore path imports a produced backup through the existing staged
import + `activate` flow (Gate 2.5); a backup of a root from a **newer**
schema cannot be imported by an older build (future-format refusal).

Manual stop-state alternative: while the owner is stopped,
`tar -czf backup.tar.gz <namespace>.host-v1` plus the lease/record siblings
is a byte-level fallback; it is **not** consistent if any owner is live —
prefer `backup`.

## 7. Upgrade / rollback

In-place upgrade of a prefix is **unsupported** (recorded G2.6 gap). The
supported shape: assemble/install the new release into a **new prefix**
(`/opt/poracode/<version>`), SIGTERM the old server, repoint the
`poracode` symlink (or the service unit path), start again. The owned data
root is untouched by an upgrade. Rollback = repoint the symlink back; note
that once a newer release has migrated the data (schema/custody), an older
release refuses future formats instead of degrading them — downgrade across a
data migration is unsupported.

---

## 8. DECISION RECORD — node-pty on Linux (no prebuild ships today)

Verified 2026-09-16 against `node_modules/node-pty` 1.1.0:
`prebuilds/` contains only `darwin-arm64`, `darwin-x64`, `win32-arm64`,
`win32-x64`. The package install script is
`node scripts/prebuild.js || node-gyp rebuild`, and `scripts/prebuild.js`
exits non-zero whenever `prebuilds/<platform>-<arch>` is absent — so on any
Linux target, `npm install` falls back to `node-gyp rebuild`, requiring
**python3 + make + a C/C++ toolchain** on the host. (The bundled
`better-sqlite3` 13.x ships N-API prebuilds for `linux-x64`, `linux-arm64`,
`linuxmusl-x64`, `linuxmusl-arm64`, so it is unaffected.) The same requirement
already exists today on every SSH-managed remote host, which installs the
identical runtime via `npm install --omit=dev`.

**Option A — ship a Linux prebuild in the artifact pipeline.**
Assemble `prebuilds/linux-{x64,arm64}.node` (glibc) and
`prebuilds/linuxmusl-{x64,arm64}.node` (musl) for the pinned node-pty version
in CI, and have the install step place them into
`node_modules/node-pty/prebuilds/` before its `prebuild.js` probe (overlay
file or postinstall step in the prefix `package.json`).
Costs: a 4-target (2 arch × glibc/musl) native build job per release with
artifact hashing/pinning plumbing; pipeline maintenance; one more release
blocking artifact to keep honest. Benefits: zero toolchain requirement on
targets — deterministic installs on locked-down servers and minimal
containers, and one whole failure class removed from install _and upgrade_.
Note N-API means no Electron/Node ABI split: one binary per
platform-arch-libc serves both (the repo already validates these same
prebuilds under Electron).

**Option B — document the toolchain requirement per target.**
State in this runbook that Linux installs need `build-essential`/`python3`
(Debian) or `make/g++/python3` (musl), added at install time. Costs: none in
pipeline work, but operators need root or preinstalled toolchains, `npm
install` compiles node-pty (~1–3 min) on every install _and every release
upgrade_, and minimal/air-gapped images fail in a way no artifact can fix.

**Recommendation: Option A, phased.** Ship Option B's documentation in this
batch (it is the current truth), and implement the Option A prebuild pipeline
as its own follow-up **before** Linux install qualification is required at
the Batch 2 freeze boundary (the freeze lists out-of-checkout qualification on
macOS **and Linux**). If an air-gapped/no-network target matters, prefer
baking `node_modules` into the tarball instead of the overlay — same build
matrix, larger artifact, fully offline installs. Decision owner: coordinator;
this record is the batch deliverable, the pipeline itself is not implemented
here.

## 9. Position: Windows standalone (draft non-goal)

**Draft — final say rests with the coordinator.** The standalone server
artifact is built and qualified for macOS and Linux (glibc/musl) hosts.
A Windows service install is a documented **non-goal** for the v2 gates:
Windows users run either the desktop app (which owns a profile under the same
lease/ownership rules) or the server inside WSL (the supported Windows-adjacent
surface, with its own helper assets). Rationale: while node-pty does ship
win32 prebuilds, the rest of the standalone service story — service manager
equivalents, the POSIX 0600 private-file and fcntl-lock idioms the lease and
fence rely on, path/permission validation, and the qualification budget —
does not cover a native Windows service this cycle, and shipping it
unqualified would be worse than declaring the boundary. Revisit as an explicit
backlog item with its own qualification matrix.

## 10. Qualification

The qualification loop runs out-of-checkout on the built artifacts: assemble →
tarball → fresh-prefix install (asserting no repository `node_modules` on any
ancestor and that native modules resolve only inside the prefix) → boot →
health → pair → SIGTERM drain (exit 0, socket closed) → restart → health,
then — with the Batch 2 CLI wiring landed — `doctor` (prefix layout asserted)
and `backup` (v1 online-snapshot receipt asserted). The Batch 2 harness
implementing this loop is local, gitignored evidence (run from a `tmp/` path,
not committed); this section is the contract any executor must satisfy.

```sh
pnpm run build && pnpm run prepare:package-assets
# then run the qualification loop against dist/ out-of-checkout, per the steps above
```

macOS is the qualified surface for this batch; the qualification states the
Linux position (§7 toolchain requirement) and Linux/CI qualification is the
recorded follow-up.
