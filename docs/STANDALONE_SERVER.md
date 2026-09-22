# Standalone server: run, install, operate

The standalone server (`dist/main/server.cjs`, built from `src/server/cli.ts`)
owns one Poracode profile outside any Electron checkout. It serves the remote
API and the bundled web client, and it is the artifact behind the `poracode`
launcher. This runbook is the contract for **choosing a mode, installing the
release artifact, running it as a service, and operating it**: configuration,
service units, stop semantics, diagnostics, backup, and upgrades. Platform
support and qualification status are in §10.

Ownership foundations (lease, data-root layout, credential custody) are
described in [HOST_OWNERSHIP.md](./HOST_OWNERSHIP.md); the remote/relay client
story is in [REMOTE_ARCHITECTURE.md](./REMOTE_ARCHITECTURE.md).

## 1. Ways to run it

| Mode                            | Use it for                                                                         | Section |
| ------------------------------- | ---------------------------------------------------------------------------------- | ------- |
| `npx` launcher (`poracode`)     | quickest start; version-pinned runtime, no checkout, no compiler                   | §2      |
| Release artifact service prefix | supported production deployment; immutable release directories, verified upgrades  | §3–§4   |
| Container image                 | container hosts; built from the Linux tarball, no compiler                         | §5      |
| Development checkout            | working on the server source inside the repository; **not** a supported deployment | §6      |

Every mode binds the remote listener to `127.0.0.1` unless you explicitly
configure a wider bind **and** satisfy its security gate (§4.3). Writable state
never lives in an install prefix: `PORACODE_BASE_DIR` selects the profile
namespace and the server owns its `<namespace>.host-v1` root (§3.1).

## 2. npx launcher (`poracode`)

`packages/poracode-cli` is a small publishable package with a `poracode` bin. It
contains no server code and no native modules: it resolves the runtime tarball
pinned to its own version in `runtime-manifest.json`, downloads it from the
matching GitHub release, verifies its sha256, installs it atomically into a
versioned cache, and then hands the terminal to the artifact's server CLI.

```sh
npx poracode@<version>                 # start the foreground server
npx poracode@<version> pair --json     # request a pairing URL
npx poracode@<version> doctor --json   # read-only diagnostics
npx poracode@<version> --version
```

- Pin the version (`poracode@<version>`). There is no mutable `latest` runtime
  URL and no unverified download path.
- The cache lives at `<PORACODE_BASE_DIR or ~/.poracode>/runtime/<version>/<target>`,
  separate from profile data. A verified install is reused without network
  access; `PORACODE_RUNTIME_CACHE_DIR` overrides the cache root.
- A missing target, a checksum mismatch, or an unreachable release fails with an
  actionable error. Targets present in the package's manifest are the published
  ones; anything else fails closed.
- `PORACODE_SERVER_TARBALL` plus `PORACODE_SERVER_TARBALL_SHA256` install a
  local, verified tarball instead of downloading (air-gapped or pre-release
  use). `PORACODE_RUNTIME_TARGET` overrides target detection only for
  qualification.
- All arguments are forwarded to the pinned runtime, so `serve`, `pair`,
  `status`, `doctor`, `backup`, `init-tls`, and `upgrade` behave exactly as
  documented below. The launcher also exports `PORACODE_APP_VERSION` for the
  pinned artifact version.

Publication status: the release workflow packs and publishes this package only
when npm publishing is enabled for the repository (`NPM_PUBLISH_ENABLED`); see
§10. Until a release has published it, use the artifact install in §3 — the
launcher's runtime format is the same tarball.

## 3. Release artifact service prefix

Each release artifact is a tarball assembled once by the release workflow for
its machine family. The same bytes are installed, qualified, and promoted;
installs never rebuild or patch the artifact by hand.

### 3.1 Artifact layout contract (v1)

`SERVER_INSTALL_LAYOUT_VERSION = 1` (resolved by `src/server/serverInstallLayout.ts`).
An install prefix separates **code**, **read-only resources**, and **data**, and
holds one immutable release directory per version plus a `current` symlink:

```
<prefix>/                          install prefix (e.g. /opt/poracode)
├── releases/<id>/                 one immutable installed release
│   ├── package.json               "poracode-server", private, engines node>=24.10,
│   │                              dependencies pinned to the exact runtime closure
│   ├── npm-shrinkwrap.json        frozen transitive dependency closure
│   ├── lib/                       built CommonJS bundles for the release (immutable)
│   │   ├── server.cjs             the server entry (CLI + headless host)
│   │   ├── supervisor.cjs         the forked supervisor
│   │   ├── *.cjs / *.mjs          shared chunks and worker entries
│   │   └── *.ssh-runtime-manifest.json   build declarations the assembly unions
│   ├── resources/                 read-only assets forwarded to supervisors
│   │   ├── wsl-helpers/           required (SSH capability)
│   │   ├── agent-plugins/         required (SSH capability)
│   │   ├── computer-use-helper/   required (computer-use capability)
│   │   ├── skills/                optional (absent = feature simply unavailable)
│   │   └── plugins/               optional
│   ├── renderer/                  bundled web client served at the same origin
│   ├── native-overlay/            verified prebuilt native bindings (§3.4)
│   ├── scripts/                   install-server-prefix.mjs, server-release-install.mjs,
│   │                              server-native-overlay.mjs
│   ├── packaging/systemd/         poracode-server.service (shipped unit, §4.1)
│   ├── Dockerfile                 container recipe built from this layout
│   └── LICENSE
├── current -> releases/<id>       what services and upgrades target
└── upgrade-journal.json           only while an upgrade is in flight (§9)
```

`lib/` contents are exactly the files declared by the
`*.ssh-runtime-manifest.json` build declarations (hash- and byte-verified
during assembly), and `package.json` pins every runtime dependency to the
version installed in the packaging checkout — plus `node-pty` and
`better-sqlite3` unconditionally. Assembly also writes
`server-artifact.json` next to the tarball: version, source revision, platform,
targets, dependency pins, native-overlay targets, web-client identity, and the
tarball sha256. That file is the provenance record installers and qualification
compare against.

**Data never lives in the prefix.** All writable state is under the profile
namespace selected by `PORACODE_BASE_DIR` — the owned `<namespace>.host-v1`
root, the sibling `.host-owner.sqlite` lease, and `.client-v1` device state (see
HOST_OWNERSHIP.md for the versioned sibling layout). The prefix should be
treated as read-only after install.

#### Resource resolution

The running bundle resolves its resources in this order:

1. Explicit declarations win: `PORACODE_WSL_HELPERS_DIR`,
   `PORACODE_AGENT_PLUGINS_DIR`, `PORACODE_COMPUTER_USE_HELPER_ROOT`,
   `PORACODE_BUNDLED_SKILLS_DIR`, `PORACODE_BUNDLED_PLUGINS_DIR`. Each must point
   at an existing absolute directory or startup fails.
2. Otherwise the layout is inferred from the running bundle's directory:
   - **prefix shape** — `<prefix>/lib/server.cjs` with `<prefix>/resources/`
     and `<prefix>/package.json`; or
   - **checkout shape** — `<repo>/dist/main/server.cjs` with `<repo>/resources/`
     (development inside the repository).

Any other arrangement is a loud startup failure (`ServerLayoutError` naming the
supported shapes) — the server never silently boots with misresolved resources.
`wsl-helpers` is required in every resolution; `skills` and `plugins` are
optional. A layout without `agent-plugins` declares `ssh: false`; without
`computer-use-helper` it declares `computerUse: false`.

One operational consequence: a shell spawned from inside a Poracode desktop app
can inherit the declaration variables pointing at that app's resources —
explicit declarations win, so a hand-run `server.cjs` would silently use another
installation's assets. Unset the five `PORACODE_*_DIR` / root variables before
manual runs; service units have isolated environments and are unaffected.

### 3.2 Build and assemble (release machine, inside the checkout)

The release workflow (`.github/workflows/_server-artifact.yml`) runs exactly
this recipe per machine family:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm rebuild node-pty                       # CI retries this 3x on flake
pnpm run codex-protocol:gen
pnpm run build:web                          # builds the web client and dist/main
node scripts/prepare-server-native.mjs --require-target <target>  # repeat per target
pnpm run prepare:package-assets             # wsl-helpers + agent-plugins
pnpm run prepare:computer-use-helper
node scripts/assemble-server-tarball.mjs --target <target>
ls -lh dist/poracode-server-*.tar.gz dist/server-artifact.json
```

`--require-target` fails the build when a staged native binding for an
advertised target is missing, and the assembler fails when either native module
(`node-pty`, `better-sqlite3`) does not cover every advertised target. Linux
arm64 is cross-built in an emulated container in CI; a native arm64 build
compiles the same binding locally. The tarball contains **no `node_modules`**:
the frozen `npm-shrinkwrap.json` plus the shipped native overlay make a
target-side install compiler-free. The staged tree also ships the thin prefix
installer (`scripts/install-server-prefix.mjs` plus its two imports) and the
unit at `packaging/systemd/poracode-server.service`, so §3.3 and §4 run from
the verified artifact alone. `--api-only` assembles without `renderer/`
for an explicit API-only deployment; the entry page is then the pairing page
rather than the web client, and the default artifact serves the bundled client.

### 3.3 Install on the target host

Requirements: Node.js >= 24.10 on PATH (or a known absolute path), `npm`, and
`tar`. No C/C++ toolchain, Python, or `node-gyp` is needed — the artifact ships
verified prebuilt bindings — and no repository checkout is needed: the artifact
ships the installer and its imports under `scripts/`, and the unit under
`packaging/systemd/`. The host needs access to the npm registry (or a mirror)
for the frozen dependency closure.

```sh
set -eu
# 1. Obtain the versioned tarball and its published checksum, then verify the
#    bytes before extracting anything. A failed check stops this script.
TARBALL="$(pwd)/poracode-server-<v>-<platform>-<arch>.tar.gz"
case "$(uname -s)" in
  Darwin) shasum -a 256 -c "$TARBALL.sha256" ;;
  *) sha256sum -c "$TARBALL.sha256" ;;
esac

# 2. Bootstrap the shipped installer out of the verified artifact into an empty
#    directory outside any checkout. Read each member to stdout and write it
#    to a fixed regular-file path, without extracting archive paths or links.
#    The installer then
#    validates every archive entry (relative, no `..`, no links) before it
#    extracts the release, so no unvalidated path is ever written.
BOOTSTRAP="$(mktemp -d)"
mkdir "$BOOTSTRAP/scripts"
for script in install-server-prefix.mjs server-release-install.mjs server-native-overlay.mjs; do
  tar -xOzf "$TARBALL" "./scripts/$script" > "$BOOTSTRAP/scripts/$script"
done

# 3. Install through the shipped installer; it may run from that empty directory.
node "$BOOTSTRAP/scripts/install-server-prefix.mjs" --tarball "$TARBALL" --prefix /opt/poracode
rm -rf "$BOOTSTRAP"
```

The installer is the same `scripts/server-release-install.mjs` contract used by
the upgrade path, the qualification script, and the Dockerfile:

1. validate every archive entry (relative, no `..`, no links) and extract
   safely;
2. `npm install --omit=dev --ignore-scripts --no-audit --no-fund` against
   `npm-shrinkwrap.json` (no package install script ever runs);
3. apply the verified `native-overlay/` for this host's platform-arch (each
   copied binding is re-hashed; the overlay's wrapper versions must equal the
   package pins);
4. point `<prefix>/current` at the new `<prefix>/releases/<id>`.

Verify the install without a checkout or ancestor `node_modules`:

```sh
node /opt/poracode/current/lib/server.cjs doctor --json
```

`doctor` exits non-zero on any `error` check. If a layout is wrong, the server
refuses to start with a `ServerLayoutError` naming the problem.

A custom `better-sqlite3` N-API binary can be forced with
`PORACODE_BETTER_SQLITE3_NATIVE_BINDING` (validated at open; a missing file
fails loudly).

### 3.4 Native closure

The `native-overlay/` directory carries the bindings the install applies:
`node-pty` (formatVersion 2 manifest: one staged target per machine shape) and
`better-sqlite3` (wrapper-version manifest; better-sqlite3 13 ships its own
N-API prebuilds, which the install validates). Overlay wrapper versions are
checked against the stage `package.json` pins and mismatch fails closed. glibc
and musl Linux are distinct target keys (`linux-*` vs `linuxmusl-*`), so a
tarball that does not stage the host's shape fails at install instead of
loading the wrong binding.

## 4. systemd / launchd service

### 4.1 Shipped systemd unit

The release artifact ships the unit at `packaging/systemd/poracode-server.service`.
It binds loopback by default and launches the `current` release so a symlink
swap is the restart boundary:

```ini
# /etc/systemd/system/poracode-server.service
[Unit]
Description=Poracode standalone server
Documentation=https://github.com/poracode/poracode
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=poracode
Group=poracode
Environment=PORACODE_APP_VERSION=dev
Environment=PORACODE_BASE_DIR=/var/lib/poracode/profile
Environment=PORACODE_REMOTE_ACCESS_HOST=127.0.0.1
Environment=PORACODE_REMOTE_ACCESS_PORT=49152
EnvironmentFile=-/etc/poracode/server.env
ExecStart=/usr/bin/node /opt/poracode/current/lib/server.cjs
Restart=on-failure
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=90
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/poracode

[Install]
WantedBy=multi-user.target
```

Install it as a dedicated service user (CI verifies the unit with
`systemd-analyze verify`; the prepared qualification image starts the shipped
file unmodified):

```sh
useradd --system --home-dir /var/lib/poracode --create-home --shell /usr/sbin/nologin poracode
install -d -m 0755 /etc/poracode
install -m 0644 /opt/poracode/current/packaging/systemd/poracode-server.service \
  /etc/systemd/system/poracode-server.service
systemctl daemon-reload
systemctl enable --now poracode-server.service
systemctl --no-pager status poracode-server.service
```

Use the installed release copy as the source outside a checkout; it is
byte-identical to the source tree's `packaging/systemd/poracode-server.service`.

Keep secrets out of the unit. `/etc/poracode/server.env` (mode 0600,
root-owned) is read via `EnvironmentFile` and is the place for
`PORACODE_SECRET_STORAGE_KEY=...` or a wider-bind TLS pair; omit it to use the
file-backed key inside the owned root. The reported version comes from the
installed artifact's `package.json`; `PORACODE_APP_VERSION` is only a fallback
for layouts whose metadata cannot be read (the unit's `dev` value is treated as
unset).

### 4.2 launchd (macOS)

No service file is shipped for macOS; this example binds loopback and uses the
`current` release path, matching the systemd contract:

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
    <string>/opt/poracode/current/lib/server.cjs</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORACODE_BASE_DIR</key><string>/var/lib/poracode/profile</string>
    <key>PORACODE_REMOTE_ACCESS_HOST</key><string>127.0.0.1</string>
    <key>PORACODE_REMOTE_ACCESS_PORT</key><string>49152</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>StandardOutPath</key><string>/var/log/poracode-server.log</string>
  <key>StandardErrorPath</key><string>/var/log/poracode-server.log</string>
</dict>
</plist>
```

`launchctl stop dev.poracode.server` sends SIGTERM — the supported stop path.
The `StandardErrorPath` log is the file to pass to `doctor --log-file` for the
redacted recent-errors tail (systemd units can equivalently
`journalctl -u poracode-server > recent.log`).

### 4.3 Beyond loopback (TLS or an explicit acknowledgement)

The default bind is loopback. A non-loopback bind is refused at startup unless
the surface is encrypted or the exposure is explicitly acknowledged — the same
rule applies to config resolution, `RemoteAccessServer` startup, and `doctor`
(`src/host/remote/config.ts`). To serve LAN clients, configure TLS:

```sh
# Generate self-signed material under the owned profile (key 0600).
runuser -u poracode -- env PORACODE_BASE_DIR=/var/lib/poracode/profile \
  /usr/bin/node /opt/poracode/current/lib/server.cjs init-tls --json

# /etc/poracode/server.env
PORACODE_REMOTE_ACCESS_HOST=0.0.0.0
PORACODE_REMOTE_ACCESS_PORT=49152
PORACODE_REMOTE_TLS_CERT=/var/lib/poracode/profile/tls/server.crt
PORACODE_REMOTE_TLS_KEY=/var/lib/poracode/profile/tls/server.key

systemctl restart poracode-server.service
curl -ksSf https://127.0.0.1:49152/.well-known/poracode/environment
```

Alternatives without TLS: `PORACODE_REMOTE_BIND_MODE=tailnet` binds the detected
Tailscale interface (no acknowledgment required), and
`PORACODE_REMOTE_BIND_MODE=lan` (or an explicit `0.0.0.0`) binds all interfaces
in plaintext only with `PORACODE_ALLOW_PLAINTEXT_LAN=1`; never publish a
plaintext all-interfaces listener without understanding that acknowledgement.

### 4.4 Stop semantics

**Stop is the signal path.** SIGTERM (or SIGINT) initiates the documented drain:
startup admission closes, owned work joins, the supervisor and database close,
and the process exits 0 with the owner lease released. A failed or unconfirmed
drain does not disarm the bound: the failure is reported and the process
force-exits 1 at the declared deadline (`shutdownDrainDeadlineMs`, default 10s),
which releases the owner lease and lets the service manager restart. The
deadline is an in-process timer, so it cannot fire while the event loop is
blocked; the service manager's stop timeout (`TimeoutStopSec=90` above,
launchd's stop) is the external bound for that case, and a direct foreground
`node …/server.cjs` run has no such watchdog. Connected remote clients receive
a WebSocket going-away close (RFC 6455 1001) before the connection grace ends; a
socket that ignores it is terminated at that grace, so the announcement never
extends the stop budget.

There is no authenticated "stop" operation and PID signaling is unsupported:
the control surface is `describe`/`issue-pairing`, and service managers stop
the server with SIGTERM.

## 5. Container image

Every Linux tarball includes `Dockerfile`, `native-overlay/`, and the shared
overlay/install scripts. Extract the tarball into an empty build context and
build there:

```sh
mkdir poracode-image && tar -xzf poracode-server-<v>-linux-<arch>.tar.gz -C poracode-image
docker build -t poracode-server poracode-image
# Linux: host networking reaches the container's loopback listener directly.
docker run --rm -v poracode-data:/var/lib/poracode --network host poracode-server
```

The build installs runtime JavaScript with lifecycle scripts disabled and
applies the shipped native bindings; it requires no compiler. The image runs as
the `node` user and initializes `/var/lib/poracode` with that user's ownership;
bind-mounted data directories must also be writable by that user.

The default listener remains loopback-only inside the container. Publishing a
container port does not expose it: either use host networking on Linux for
local access, or configure TLS **and** a wider bind inside the container (§4.3)
before publishing the port. Use a Linux tarball matching the image
architecture; a macOS tarball cannot supply Linux helpers or bindings.

## 6. Development (not a deployment)

Inside a repository checkout the server runs from the checkout shape
(`dist/main/server.cjs` with `<repo>/resources/`). This is for development and
source qualification only; it has no release directory, `current` symlink,
immutable artifact metadata, or service unit, and `upgrade` does not apply to
it.

```sh
pnpm run build:web                 # builds dist/main + dist/web + resources
pnpm run server                    # node dist/main/server.cjs (foreground)
pnpm run dev                       # full desktop app (Electron + renderer)
```

Unset any inherited `PORACODE_*_DIR` resource declarations before a manual run
(§3.1).

## 7. Running and configuration

The remote-listener and service contract is environment-first, with an optional
JSON config file whose fields map onto the same names (precedence per field:
CLI flag > environment > config file > built-in default; `src/server/serverConfig.ts`).

| Variable                                               | Meaning                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `PORACODE_BASE_DIR`                                    | Profile namespace (required for a dedicated service profile). The server owns `<dir>.host-v1`.          |
| `PORACODE_REMOTE_ACCESS_HOST`                          | Bind host for the remote listener (default `127.0.0.1`, loopback only).                                 |
| `PORACODE_REMOTE_ACCESS_PORT`                          | Bind port; unset picks the first free port from 49152.                                                  |
| `PORACODE_REMOTE_BIND_MODE`                            | Named bind: `loopback` (default), `tailnet`, `lan`.                                                     |
| `PORACODE_REMOTE_TLS_CERT` / `_KEY`                    | PEM pair; both together or startup fails. Required for unacknowledged wide binds.                       |
| `PORACODE_ALLOW_PLAINTEXT_LAN`                         | Exactly `1` acknowledges a plaintext LAN/all-interfaces bind. Never file-configurable.                  |
| `PORACODE_SECRET_STORAGE_KEY`                          | Explicit base64 32-byte credential key. Absent → file-backed `headless-file` key inside the owned root. |
| `PORACODE_REMOTE_RELAY_URL` / `_SECRET`                | Register with a relay for cross-network access.                                                         |
| `PORACODE_APP_VERSION`                                 | Fallback version when the artifact's `package.json` cannot be read; `dev` is ignored.                   |
| `PORACODE_LOG_LEVEL`                                   | `debug` / `info` / `warn` / `error` (default `info`).                                                   |
| `PORACODE_SHUTDOWN_DRAIN_DEADLINE_MS`                  | SIGTERM drain deadline in ms (default 10000).                                                           |
| `PORACODE_REMOTE_TRUSTED_PROXIES`                      | Addresses/CIDRs whose `X-Forwarded-For` the rate limiter may honor.                                     |
| `PORACODE_*_DIR` / `PORACODE_COMPUTER_USE_HELPER_ROOT` | Explicit resource declarations (§3.1), validated absolute directories.                                  |

`serve` (the default when no command is given) reads an optional JSON config
file at `<PORACODE_BASE_DIR>/poracode-server.json`, or the path given with
`--config`. Fields: `host`, `port`, `bindMode`, `relayUrl`, `tlsCert`,
`tlsKey`, `trustedProxies`, `logLevel`, `logMaxBytes`, `logMaxFiles`,
`shutdownDrainDeadlineMs`. The file is strict — an unknown field or invalid
value fails startup loudly rather than silently using a default.

```sh
poracode-server [serve] [--config <path>] [--host <host>] [--port <port>] [--trusted-proxies <list>]
poracode-server pair --json [--scope viewer|operator]     # request a pairing URL
poracode-server status --json                             # authenticated describe
poracode-server doctor [--json] [--log-file <path>]       # diagnostics (§8)
poracode-server backup --to <dir> [--json]                # verified backup (§8)
poracode-server init-tls [--json] [--cert <path>] [--key <path>]
poracode-server activate [--json] [--sign-in-again]       # staged import activation
poracode-server upgrade --from <tarball> [--prefix <path>] [--json]   # §9
poracode-server --version | --help
```

`--version` prints the immutable artifact version and fails when the metadata
cannot be read; it never invents a version. Startup prints the canonical
namespace, the actual data root, and the listener URLs. The health endpoint is
`GET /.well-known/poracode/environment` and answers JSON with `protocolVersion`,
`hostMode: "helper"`, and `appVersion`. `activate` completes a staged offline
import of a desktop profile (adopting its sealed credentials, or starting fresh
with `--sign-in-again`). Pairing credentials are printed only by the explicit
`pair` command.

## 8. Diagnostics and backup

### 8.1 `doctor` (read-only)

`doctor` never acquires the owner lease, never writes, and never opens the
leased SQLite inode from inside an owning process (HOST_OWNERSHIP.md
invariant). The report (`formatVersion` 1) covers:

- **install layout** — resolved shape and root, plus ssh and computer-use
  capability checks against the resolved resources;
- **root** — canonical namespace, owned root, lease/fence paths, root manifest
  (`source`/`activation`), database presence;
- **lease state** — the recorded owner record (kind/phase/generation/pid +
  liveness) and a kernel-lock probe (`locked` / `free` /
  `skipped-same-process` / `unavailable`) that distinguishes a live owner from
  a stale record;
- **credentials** — mode, stored key-file name, fingerprint prefix (8 hex),
  whether an environment key is configured (never its value);
- **remote access** — the resolved bind (mode, effective host, refusal reason
  when the bind would be refused), published control discovery (port +
  generation), env-configured host/port, and a live authenticated `describe`
  when the owner answers;
- **versions** — app version, remote protocol version, host-control protocol
  version, runtime build source hash, Node/platform, and the resolved install
  layout;
- **migrations / upgrade journal** — schema policy and any pending or
  interrupted upgrade;
- **recent errors** — bounded (64 KiB / 200 lines) tail of a `--log-file` if
  given, passed through redaction (pairing URLs, bearer/authorization values,
  key material, ≥43-char token runs).

Every section also produces a named `ok`/`warn`/`error` check; the CLI exits
non-zero when any check is `error`. `--json` emits the full machine-readable
report.

### 8.2 `backup`

`backup --to <directory>` captures one owned data root:

- **database** — SQLite's own backup API from a read-only connection with a
  busy timeout: a consistent snapshot that tolerates a live owner (WAL readers
  never block the writer). The delivered `state.sqlite` is checkpointed
  (self-contained), owner-private (0600), and has its schema version validated.
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
import + `activate` flow; a backup of a root from a **newer** schema cannot be
imported by an older build (future-format refusal).

Manual stop-state alternative: while the owner is stopped,
`tar -czf backup.tar.gz <namespace>.host-v1` plus the lease/record siblings is a
byte-level fallback; it is **not** consistent if any owner is live — prefer
`backup`.

## 9. Upgrade / rollback

`poracode-server upgrade --from <tarball> [--prefix <path>]` stages a distinct
release under `<prefix>/releases/<id>` through the shared release installer,
classifies the candidate's pending migrations from the candidate's own
`doctor --json` registry, drains the single authenticated owner, captures a
consistent pre-migration backup when a forward-only migration is pending, swaps
`<prefix>/current`, then starts the candidate with admission held. Admission is
released only after the candidate proves the exact expected build (version,
entrypoint SHA-256, prefix root, profile/data root, owner generation) over the
mutually authenticated control surface and the upgrader issues the small
`admit` operation. Readiness is re-proven through the same authenticated
surface; `/healthz` never qualifies an upgrade, and the owned data root is
untouched by the swap.

Service units must `ExecStart` `…/current/lib/server.cjs` so a symlink swap is
the restart boundary (SIGTERM remains the stop path). The upgrader verifies the
installed unit's `ExecStart` actually launches this prefix's entrypoint
(quote-aware; a path that merely appears as an argument does not match) and
refuses a unit pointing elsewhere.

Data compatibility: the upgrader reads the candidate's compiled migration
registry. Pending `forward-only` migrations require the consistent backup
before the candidate runs; a backup is never restored automatically over
accepted newer writes. A failure before admission rolls the code symlink back
only when the pending migrations are rollback-compatible and the post-failure
schema is readable; a forward-only migration that ran, a schema that cannot be
read after a potentially forward-only migration, an uncertain admission, or a
failed rollback yields `outcome: "recovery-required"` with the backup path, and
both releases plus the data are preserved.

Crash recovery: every phase is journalled in `<prefix>/upgrade-journal.json`
before it runs with the atomic-write helper (temporary file + rename), so a
reader sees the old or the new complete journal and never a torn write. This is
process-crash atomicity, not fsync power-loss durability: a power loss can lose
the newest phase write and leave an older complete phase behind. The journal
contains no secrets (prefix, release paths, phase, expected version/SHA, backup
path) and is written mode 0644 so the service user that starts the staged
candidate can read it. A journal that is present but unusable — unreadable, not
a regular file (a directory or a symlink, including a dangling one), not format
1, or carrying a phase this build does not know — fails closed: releases under
the prefix hold admission and `upgrade` refuses with explicit guidance.
Recovery is explicit, never automatic:

```sh
poracode-server doctor --json                      # phase, release, expected version, guidance
poracode-server upgrade --resume --from <tarball>  # pre-drain phases: safe restage
poracode-server upgrade --resume --confirm         # past drain: re-verify owner/build, finish
poracode-server upgrade --abandon-journal --confirm
```

Both entry points re-read and re-validate the journal under the prefix lock
before acting, so a record replaced while recovery was preparing is refused
rather than acted on. `--resume` re-probes the authenticated owner and
re-verifies the staged release's version/entrypoint hash before continuing.
`--abandon-journal` removes only the journal (never `current`, releases, or
data). For a readable journal it refuses while the interrupted release is the
active `current` and was not admitted. For an unusable journal the interrupted
release cannot be identified: a live owner that answers must still prove it is
the admitted, ready server for the current release, and with no live owner the
removal rests on `--confirm` alone. `--confirm` is an explicit operator
override, not an authentication and not evidence that no server process is
running — inspect `doctor --json` and the release `current` points at yourself.

Once a newer release has migrated the data (schema/custody), an older release
refuses future formats — downgrade across a data migration is unsupported.

## 10. Support matrix and qualification status

The standalone server is built for **macOS (darwin-arm64, darwin-x64)** and
**Linux glibc (linux-x64, linux-arm64)**, with musl target keys
(`linuxmusl-*`) resolved at runtime by glibc detection; a target is published
only when its release-matrix leg produced and qualified it. Node.js >= 24.10 is
the floor. Native Windows is a documented non-goal: Windows users run the
desktop app or the server inside WSL. Unsupported targets fail closed.

Qualification is per frozen artifact. The target install itself is the §3.3
recipe (the artifact's own shipped installer, no checkout); the source checkout
only supplies the harness that exercises that installed prefix:

```sh
# 1. Install the frozen bytes with the artifact's own shipped installer per
#    §3.3, then run the end-to-end loop from the checkout (doctor, boot, health,
#    pair, one PTY thread turn, SIGTERM drain with lease release, then an
#    upgrade of the same prefix and second drain).
node scripts/server-install-qualification.mjs --tarball <tarball> \
  --prefix <prefix> --artifact <server-artifact.json>

# 2. Qualify the publishable launcher against the same bytes (real npm pack,
#    empty external cwd, verified cache install, doctor through the bin).
node scripts/poracode-cli-qualification.mjs --runtime-tarball <tarball>

# 3. Required-mode real-artifact upgrade integration (fails instead of skipping).
PORACODE_REQUIRE_SERVER_IT=1 pnpm exec vitest run --configLoader runner \
  src/server/serverUpgrade.integration.test.ts
```

The harness verifies the installed prefix against the artifact's own
`server-artifact.json` (tarball sha256, version, web client, native-overlay
versions, and the shipped installer/unit closure), so a tarball that cannot
follow §3.3 fails qualification. Running these from a source checkout verifies
the recipe; it does not by itself qualify released bytes — a platform is
qualified only when its leg installs the frozen artifact's own bytes (uploaded
artifact plus the published checksum) and passes these steps on that platform.

The release workflow runs these legs per machine family and promotes the exact
qualified bytes; it never rebuilds a lookalike after tests. Status of the gates
that are wired but not yet proven for a released artifact:

- **npm publication** is gated behind the repository's `NPM_PUBLISH_ENABLED`
  setting; until it is enabled, `npx poracode@<version>` is not available from
  the registry and the artifact install (§3) is the supported path.
- **Platform qualification** is per artifact: install the frozen bytes on the
  target with the artifact's own shipped installer (§3.3) and run the harness
  steps above against that prefix; do not describe a platform as qualified
  until its leg passes.
- **Upgrade from a published N−1** requires a previous published release and is
  exercised then; the qualification loop's upgrade phase uses a staged distinct
  release and is not an N−1 claim.
- **Power-loss durability** is not implemented or claimed; the upgrade journal
  guarantees process-crash atomicity only (§9).
