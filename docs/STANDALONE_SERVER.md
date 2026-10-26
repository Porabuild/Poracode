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
npx poracode@<version>                 # TUI in a terminal; serve without opening when non-interactive
npx poracode@<version> tui [DIRECTORY] # explicitly open the TUI
npx poracode@<version> -p "PROMPT"     # one-shot prompt
npx poracode@<version> serve           # server only; no browser opening
npx poracode@<version> serve --open    # server + explicitly open the web app
npx poracode@<version> --open          # retain the web-app shortcut
npx poracode@<version> pair --json     # request a pairing URL
npx poracode@<version> doctor --json   # read-only diagnostics
npx poracode@<version> --version
```

To keep the command installed, use `npm install --global poracode@<version>`,
then `poracode` opens the TUI when both stdin and stdout are terminals; a
non-interactive invocation retains the foreground server behavior and does not
open a browser. Use `poracode serve --open` (or `poracode --open`) for the web
app. `--no-open` means server only. This does not install the Electron desktop
app or a managed service.

The TUI and `-p`/`--print` use the existing profile and provider runtime. If no
owner is running, they start a detached `serve` process and wait for its local
control endpoint. The owner remains running after the TUI exits; use
`poracode stop` with the same `--base-dir` to stop it. `-p` prints the
final assistant output; `--format json` streams the existing controlled-run
NDJSON. Provider, model, and effort default from the matching TUI selection in
`<profile>/tui/last-model.json`; if no saved model applies for the provider, the
first model from run options is used. Approval and sandbox values use a matching
saved TUI selection; if absent, `-p` lists the advertised choices and requires
explicit flags. It never chooses the first approval or sandbox option, and no
permission is automatically approved. A checkout requires `bun run tui:install`;
packaged builds download the TUI binary for their platform on first use,
verify its size and SHA-256 against the manifest staged in the install, and
cache it in the user cache; `PORACODE_TUI_BIN` overrides. When no TUI binary is
available a bare `poracode` falls back to the server + web app, while
`poracode tui` reports the error.

The TUI saves one session per profile in `<profile>/tui/session.json` and
reuses it on every launch (concurrent TUIs share it); if the host rejects it,
the CLI pairs once, relaunches, and revokes only that exact previous session.
`clients list` and `clients revoke SESSION_ID` still manage entries. Pairing
credentials remain separate from provider logins.

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
  `status`, `doctor`, `backup`, `init-tls`, `upgrade`, `tui`, and `-p` behave
  exactly as documented below. The launcher also exports `PORACODE_APP_VERSION`
  for the pinned artifact version.

Publication status: the release workflow packs and publishes this package only
when npm publishing is enabled for the repository (`NPM_PUBLISH_ENABLED`); see
§10. Until a release has published it, use the artifact install in §3 — the
launcher's runtime format is the same tarball.

### 2.1 Desktop-bundled entry

Windows and macOS packaging also stages a command under
`<desktop-resources>/desktop-cli/`: `poracode.cmd` on Windows, `poracode` on macOS,
and `poracode-next[.cmd]` for Nightly. This command uses that installation's
Electron runtime in Node mode, without a separate Node/npm installation or a
runtime download. Its default foreground/server-only modes and administration
commands use the same server entry and credential stores described here.

The packaged bootstrap checks the exact channel, executable, Electron/app
versions and first-party file hashes, then retains that verified code and build
identity for the process lifetime. An incomplete, tampered or future
bundle refuses; it never selects another installed runtime. `--base-dir` and
explicit resource overrides retain their existing meaning, and a running owner
is never stopped or replaced implicitly. Background owner startup re-invokes
the same `desktop-cli/bootstrap.mjs` with `ELECTRON_RUN_AS_NODE=1`, so the
captured bundle is revalidated. If the invocation is not through that verified
bootstrap, auto-start refuses with guidance to open the desktop app or run
`poracode serve` explicitly. Managed-service installation still
requires supported native Node and an explicitly selected service prefix.
Standalone `upgrade` also requires the native Node CLI: the desktop command
refuses it before effects. Update the desktop through its own updater.

The macOS source attempts command registration after successful packaged startup,
including attached mode. It uses an existing suitable writable directory on
`PATH`, preserves existing commands (including npm installations), and keeps
Stable/Nightly ownership separate. It does not edit shell profiles or request
elevation. If registration is unavailable, the startup log gives the exact
bundled command path. Dev, CI, CDP and custom-profile launches skip registration.

Windows NSIS source registers the desktop command directory in the installing
account's user `PATH`; existing entries keep precedence, including an earlier npm
command. It preserves the raw `REG_SZ`/`REG_EXPAND_SZ` value and records whether it
actually added the entry. Same-prefix updates retain registration while replacing
the app. Ordinary uninstall removes only a confirmed matching entry added by that
installation; a pre-existing entry is preserved. Oversized values, ambiguous or
future/partial metadata, another account/prefix, directory aliases and changed
launcher bytes refuse registration cleanup and leave evidence in
`HKCU\Software\Poracode\DesktopCli\<channel>`. All-users installs skip this
per-user binding. No PowerShell, command shell, extra helper or server is launched
by this registration hook.

The Windows installer source also replaces automatic process termination with a
read-only check of the selected physical installation directory. An observed running desktop or
bundled CLI runtime refuses replacement: quit the desktop or explicitly stop the
server with its exact profile, then retry. This check is not an atomic admission
fence against a concurrent new launch; update/launch races and older installer
interactions still require qualification and containment before release.

This packaging/registration path is source-prepared. Native ASAR/stdio and
update-lifetime qualification, Windows installer compilation/native qualification,
and a desktop registration status/repair surface are incomplete. This is not a claim that the
currently installed desktop app provides the command. No installer, shell
profile or PATH has been changed by this preparation.

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
bun install --frozen-lockfile --ignore-scripts && node node_modules/bun/install.js
bash scripts/ci-rebuild-node-pty.sh                       # CI retries this 3x on flake
bun run codex-protocol:gen
bun run build:web                          # builds the web client and dist/main
node scripts/prepare-server-native.mjs --require-target <target>  # repeat per target
bun run prepare:package-assets             # wsl-helpers + agent-plugins + host PTY owner
bun run prepare:computer-use-helper
node scripts/assemble-server-tarball.mjs --target <target>
ls -lh dist/poracode-server-*.tar.gz dist/server-artifact.json
```

On Windows, `build:electron` prepares the native PTY owner before capturing the
runtime declaration. The build machine needs Rust and the MSVC toolchain;
installed servers consume the verified binary without a compiler. Repeated
asset preparation reuses matching bytes. Partial, future or changed cached
artifacts are preserved and refused. Every advertised Windows target must have
its matching PTY owner; the assembler does not substitute another architecture.

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
for script in install-server-prefix.mjs server-release-install.mjs server-native-overlay.mjs server-host-tools.mjs; do
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

#### Windows (win32-x64)

Requirements: Node.js >= 24.10 (with the `npm` it ships), and `tar.exe` from
`%SystemRoot%\System32` (bsdtar, present on Windows 10 1803+ and Windows 11).
Git for Windows' GNU tar is not used: it reads `C:\x.tar.gz` as `host:file`.
No compiler, Python or Visual Studio is needed; the artifact ships the
`win32-x64` ConPTY prebuilds. The artifact is the same `.tar.gz`
(`poracode-server-<v>-win32-x64.tar.gz`), and the installer is the same
shipped `scripts/install-server-prefix.mjs`. In PowerShell:

```powershell
$ErrorActionPreference = "Stop"
# 1. Verify the bytes before extracting anything. The .sha256 file holds the
#    lowercase hex digest (optionally followed by the file name).
$Tarball = Join-Path (Get-Location) "poracode-server-<v>-win32-x64.tar.gz"
$Expected = ((Get-Content "$Tarball.sha256" -Raw).Trim() -split "\s+")[0]
$Actual = (Get-FileHash -Algorithm SHA256 $Tarball).Hash.ToLowerInvariant()
if ($Actual -ne $Expected.ToLowerInvariant()) { throw "checksum mismatch" }

# 2. Bootstrap the shipped installer with bsdtar into an empty directory.
$Bootstrap = Join-Path $env:TEMP "poracode-bootstrap"
New-Item -ItemType Directory -Force "$Bootstrap\scripts" | Out-Null
$Tar = Join-Path $env:SystemRoot "System32\tar.exe"
foreach ($script in "install-server-prefix.mjs", "server-release-install.mjs",
  "server-native-overlay.mjs", "server-host-tools.mjs") {
  & $Tar -xOzf $Tarball "./scripts/$script" | Set-Content -Encoding utf8NoBOM "$Bootstrap\scripts\$script"
}

# 3. Install. Omitting --prefix uses %LOCALAPPDATA%\Poracode\server.
node "$Bootstrap\scripts\install-server-prefix.mjs" --tarball $Tarball
Remove-Item -Recurse -Force $Bootstrap
node "$env:LOCALAPPDATA\Poracode\server\current\lib\server.cjs" doctor --json
```

`<prefix>\current` is a directory junction (no elevation or Developer Mode
needed). Run the server in the foreground with
`node "$env:LOCALAPPDATA\Poracode\server\current\lib\server.cjs"`, or through
the launcher (`npx poracode`), which resolves the `win32-x64` runtime.

Stop a running server with `node ...\server.cjs stop` (or `poracode stop`):
Windows has no graceful process signal, so this authenticated host-control
request is the supported stop (see §4.4). Do not use `taskkill` or
`Stop-Process`, which terminate without draining or releasing the owner lease.

Start at logon with Task Scheduler (foreground, not a Windows service). Set
`PORACODE_BASE_DIR` explicitly so the task and your interactive shell share one
profile:

```powershell
$Node = (Get-Command node).Source
$Server = "$env:LOCALAPPDATA\Poracode\server\current\lib\server.cjs"
$Action = New-ScheduledTaskAction -Execute $Node -Argument "`"$Server`"" `
  -WorkingDirectory $env:USERPROFILE
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "Poracode server" -Action $Action `
  -Trigger $Trigger -Settings $Settings
# Task Scheduler passes no environment: set PORACODE_BASE_DIR for the account
# (persistent, and read by the task at logon), then sign out and in.
[Environment]::SetEnvironmentVariable("PORACODE_BASE_DIR", "$env:USERPROFILE\.poracode", "User")
```

To stop the task's server, run `stop` (above) rather than ending the task.

Notes:

- **Profile sharing.** The Poracode desktop app and the standalone server on
  the same Windows account use one owner-leased profile; only one process owns
  it at a time. Point the server at a separate `PORACODE_BASE_DIR` if the
  desktop app runs on the same machine.
- **WSL port clashes.** The default remote-access port is shared by a server
  started inside WSL. With WSL mirrored networking, or a WSL server forwarded to
  localhost, two servers cannot bind the same port; set
  `PORACODE_REMOTE_ACCESS_PORT` on one of them.
- **Path length.** Keep the prefix short; `doctor` warns when the prefix plus
  the longest release member approaches the 260-character limit without
  `LongPathsEnabled`.
- The owner-only permission model on Windows is enforced with ACLs (`icacls`)
  on secret and state files.

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

**Stop by command.** `poracode-server stop` (`node lib/server.cjs stop`, or
`poracode stop` through the launcher) finds the authenticated owner of the
selected profile, asks it over host control to run the same drain, and waits for
the owner record to report `phase: "stopped"`. It exits 0 when the server is
stopped or was not running, and non-zero on refusal, an owner too old to support
`shutdown` (stop that one with its service manager), or a missed deadline. It
never signals a PID. This is the only graceful stop on Windows, where a process
signal is a hard kill; on POSIX service managers keep using SIGTERM.

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
bun run build:web                 # builds dist/main + dist/web + resources
bun run server                    # node dist/main/server.cjs (foreground)
bun run dev                       # full desktop app (Electron + renderer)
```

Unset any inherited `PORACODE_*_DIR` resource declarations before a manual run
(§3.1).

## 7. Running and configuration

The remote-listener and service contract is environment-first, with an optional
JSON config file whose fields map onto the same names (precedence per field:
CLI flag > environment > config file > built-in default; `src/server/serverConfig.ts`).

| Variable                                               | Meaning                                                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `PORACODE_BASE_DIR`                                    | Profile namespace (required for a dedicated service profile). The server owns `<dir>.host-v1`.                  |
| `PORACODE_REMOTE_ACCESS_HOST`                          | Bind host for the remote listener (default `127.0.0.1`, loopback only).                                         |
| `PORACODE_REMOTE_ACCESS_PORT`                          | Bind port; unset picks the first free port from 49152.                                                          |
| `PORACODE_REMOTE_BIND_MODE`                            | Named bind: `loopback` (default), `tailnet`, `lan`.                                                             |
| `PORACODE_REMOTE_TLS_CERT` / `_KEY`                    | PEM pair; both together or startup fails. Required for unacknowledged wide binds.                               |
| `PORACODE_ALLOW_PLAINTEXT_LAN`                         | Exactly `1` acknowledges a plaintext LAN/all-interfaces bind. Never file-configurable.                          |
| `PORACODE_SECRET_STORAGE_KEY`                          | Explicit base64 32-byte credential key. Absent → file-backed `headless-file` key inside the owned root.         |
| `PORACODE_REMOTE_RELAY_URL` / `_SECRET`                | Register with a relay for cross-network access.                                                                 |
| `PORACODE_APP_VERSION`                                 | Fallback version when the artifact's `package.json` cannot be read; `dev` is ignored.                           |
| `PORACODE_LOG_LEVEL`                                   | `debug` / `info` / `warn` / `error` (default `info`).                                                           |
| `PORACODE_SHUTDOWN_DRAIN_DEADLINE_MS`                  | SIGTERM drain deadline in ms (default 10000).                                                                   |
| `PORACODE_REMOTE_TRUSTED_PROXIES`                      | Addresses/CIDRs whose `X-Forwarded-For` the rate limiter may honor; dials from them are never treated as local. |
| `PORACODE_*_DIR` / `PORACODE_COMPUTER_USE_HELPER_ROOT` | Explicit resource declarations (§3.1), validated absolute directories.                                          |

`serve` (the default when no command is given) reads the path given with
`--config`, otherwise an existing `<PORACODE_BASE_DIR>/poracode-server.json`,
otherwise the adjacent `<PORACODE_BASE_DIR>.server.json`. Fresh `configure`
writes the adjacent file so setup does not create a legacy profile directory.
Fields: `host`, `port`, `bindMode`, `relayUrl`, `tlsCert`,
`tlsKey`, `trustedProxies`, `logLevel`, `logMaxBytes`, `logMaxFiles`,
`shutdownDrainDeadlineMs`. The file is strict — an unknown field or invalid
value fails startup loudly rather than silently using a default.

```sh
poracode-server [serve] [--config <path>] [--host <host>] [--port <port>] [--trusted-proxies <list>]
poracode-server pair --json [--scope viewer|operator]     # request a pairing URL
poracode-server status --json                             # authenticated describe
poracode-server status --details [--json]                 # running build and admission
poracode-server doctor [--json] [--log-file <path>]       # diagnostics (§8)
poracode-server backup --to <dir> [--json]                # verified backup (§8)
poracode-server init-tls [--json] [--cert <path>] [--key <path>]
poracode-server activate [--json] [--sign-in-again]       # staged import activation
poracode-server upgrade --from <tarball> [--prefix <path>] [--json]   # §9
poracode-server --version | --help
```

`status --details` reads the running owner's version, bundle path, source/hash
identity and admission state through authenticated local control, pinned to the
same owner generation as its description. Its JSON view has `formatVersion: 1`
and `view: "running-owner"`; basic `status --json` keeps its existing shape.
An older owner without detailed status refuses with guidance to use basic status
or doctor. Neither command starts, stops or upgrades an owner. The reported
endpoint and advertised capabilities are owner metadata, not a remote health
probe or proof that an external client can connect.

`--version` prints the immutable artifact version and fails when the metadata
cannot be read; it never invents a version. Startup prints the canonical
namespace, the actual data root, and the listener URLs. The health endpoint is
`GET /.well-known/poracode/environment` and answers JSON with `protocolVersion`,
`hostMode: "helper"`, and `appVersion`. `activate` completes a staged offline
import of a desktop profile (adopting its sealed credentials, or starting fresh
with `--sign-in-again`). Pairing credentials are printed only by explicit
`pair`/`connect` or `pairings create` commands.

### 7.1 Local administration

All commands accept `--base-dir <namespace>`. Provider, account and client
administration target that profile's authenticated running owner; `configure`
edits local saved configuration without starting or connecting to an owner.
Run them on the host, including through SSH. They never replace or
upgrade an older owner implicitly. Existing controls use closed inner admin v1;
additional controls use the specific inner version noted below (v2 through v21).
Every version echoes the requested version; unsupported versions refuse before effects. Outer host-control capabilities
and public remote routes are unchanged.

`providers list` reads saved provider observations without starting the supervisor
or probing providers (local admin v17, JSON formatVersion 1). Cached installation,
authentication and runtime observations may be stale. Missing observations do not
mean a provider is uninstalled. Use `providers list --refresh` for explicit discovery;
repeat the same namespace and optional `--wsl DISTRO` selection. JSON identifies
the environment and observation source/cache state. Saved profiles are current
host-scoped configuration, independent of the selected environment. Credential
values are omitted. Older owners refuse rather than falling back to discovery;
future cache versions require a compatible host before refresh.

```sh
poracode providers list --json
poracode providers list --refresh --json
poracode providers custom add local-agent --config-file command.json --prompt-env TOKEN
poracode providers custom inspect local-agent --json
poracode providers custom configure local-agent --name "Local agent" --enable --json
poracode providers custom remove local-agent --yes --json
poracode projects add . --json
poracode projects list --limit 50 --json
poracode projects inspect <project-id> --json
poracode run --options --project <project-id> --provider <provider-kind>
poracode run --project <project-id> --provider <provider-kind> --model <model-id> --approval-policy <advertised-policy> --sandbox <advertised-mode> "Explain this project"
poracode run --project <project-id> --provider <provider-kind> --model <model-id> --prompt-stdin --format json < prompt.txt
poracode run --standalone --directory . --provider <provider-kind> --model <model-id> --prompt-stdin --format json < prompt.txt
poracode run --session <thread-id> "Continue with the next step"
poracode run --session <thread-id> --prompt-stdin --format json < prompt.txt
poracode setup
poracode setup --no-start
poracode setup --start --provider <provider> --method <method>
poracode setup --start --open --provider <provider> --method <method>
poracode setup --start --profile-env
poracode setup --start --profile <profile-id> --prompt-env <ENV_NAME>
poracode setup --start --new-profile <profile-id> --driver <driver> --prompt-env <ENV_NAME>
poracode setup --start --config server.json --new-profile <profile-id> --driver <driver> --profile-config-file profile.json --prompt-env <ENV_NAME>
poracode providers drivers --json
poracode mcp list --json
poracode mcp disable <server-id>
poracode mcp enable <server-id>
poracode mcp remove <server-id> --yes --json
poracode auth methods <provider>
poracode auth login <provider> --method <method>
poracode auth accounts <provider> --json
poracode auth logout <provider> --credential <credential-id>
poracode providers unset-env <profile-id> OLD_KEY OTHER_KEY
poracode providers configure <profile-id> --prompt-env <ENV_NAME>
poracode providers configure
poracode providers remove <profile-id> --yes
poracode pairings create --preset viewer --label Phone --ttl 15m --qr
poracode pairings create --scope session:read --scope terminal:read --json
poracode pairings list --json
poracode pairings revoke <pairing-id>
poracode clients list --json
poracode clients revoke <client-id>
poracode sessions list --limit 50 --project <project-id> --json
poracode sessions inspect <thread-id> --json
poracode sessions stop <thread-id> --yes --json
poracode sessions rename <thread-id> --title "Investigate startup" --json
poracode sessions archive <thread-id> --yes --json
poracode sessions unarchive <thread-id> --json
poracode sessions done <thread-id> --yes --json
poracode sessions reopen <thread-id> --json
poracode configure --unset port
poracode configure --unset tlsCert --unset tlsKey
poracode configure --log-level debug --log-max-files 3 --shutdown-drain-deadline-ms 15000
poracode configure --trusted-proxies 127.0.0.1,10.0.0.0/8
poracode configure --effective --json
```

`run --session <thread-id>` continues an exact saved structured session on its
owning host (local-admin v19). It retains the provider/profile, provider resume
reference, worktree, configuration, title and existing history. Target and
configuration overrides, including `--options`, are refused with `--session`.
Use `sessions list` to select an ID; no most-recent session is guessed. Reopen or
unarchive first when needed. A busy session refuses without closing its runtime;
use `sessions stop` explicitly before retrying. Missing resume support, changed
execution selections and unsupported stored configuration refuse without a
replacement session or account fallback. Terminal and WSL runs remain unsupported
by this controlled command. Prompt limits, output format, permission refusal,
caller cancellation and confirmed retirement match a new `run`.

Add `--standalone` to a new run, `--options` or exact `--session` continuation to
own the selected profile for that command, then join its shutdown. The same
saved projects, provider profiles, sealed credentials and history are used.
An existing desktop or server owner refuses; the command never adopts, stops or
upgrades it. By default, `run` continues to use the running owner.

Standalone execution starts provider ingress and local authenticated
administration only. It opens no paired HTTP/WebSocket listener, relay or browser,
does not register a browser native host, reconnect saved environments, or start
schedules/PR watches. Listener/TLS/relay deployment configuration is not applied.
Text output is unchanged. JSON uses format 2 with opt-in tool records when the
owner supports local-admin v24; an older owner retains format-1 NDJSON.
Diagnostics remain on stderr. Success requires task/history/runtime retirement and host shutdown;
Ctrl+C, stream loss and authenticated stop use the existing bounded shutdown
drain. The selected structured provider must already be installed and configured.

Use `--directory PATH` instead of `--project ID` for an existing native directory.
Relative paths resolve in the CLI's working directory. The host reuses its
existing registration without replacing the ID, name, scripts or settings, or
registers a new project. A new folder whose name cannot be a project label (such
as a filesystem root) gets `Project`; existing labels remain unchanged. This
applies to `--options` as well as a new task, with or without `--standalone`.
It cannot be combined with `--project`, `--session`
or `--wsl`; WSL paths refuse before registration, with no native fallback.

Directory selection requires closed local-admin v20, so earlier owners refuse
before registration. Both phases use the same authenticated owner generation;
normal project-ID runs retain v15 and exact saved-session preparation retains
v19. A new registration remains if provider/configuration validation or the
subsequent run fails; inspect `projects list` before retrying. Existing disabled
projects refuse without being enabled or replaced. Text output is unchanged;
JSON tool records use format 2 only after local-admin v24 opt-in, while older
owners retain format-1 NDJSON. `--options --format json` includes the selected
project ID. The v20-only directory envelope remains formatVersion 1 with
`scope: "controlled-directory-run"`; its nested run metadata is format 1 for
legacy runs or format 2 after the v24 tool-event opt-in. It adds no public remote
operation or credential domain.

Add `--interactive` with a quoted prompt for terminal review of task permissions
and questions (closed local-admin v23). It requires terminal stdin and stderr;
`--options` and `--prompt-stdin` refuse. Advertised options use explicit numbers,
or comma-separated numbers for multi-select. Empty input never approves. Use
`j` for advanced hidden JSON input (24 KiB maximum). Complex forms require their
adapter's response shape; use a client for guided form entry. Invalid JSON is
not submitted. Provider authentication stays under the separate `auth`
commands. Requests/details go to stderr; text output is unchanged, and JSON
uses negotiated format 2 or legacy format 1. Resolved or replaced prompts close;
stale/duplicate replies refuse. Ctrl+C or caller loss cancels the exact run and
joins terminal writes and runtime retirement. Older owners refuse the v23
preparation wrapper before effects; older supervisors refuse its distinct local
request-custody procedure version 2 before provider launch. A supervisor-issued
single-use token binds each answer to the exact displayed request incarnation,
including when a provider reuses a request ID. No public route, remote grant,
credential domain or outer host-control capability is added.

Add `--file PATH` repeatedly to a project, directory or exact saved-session task,
including with `--standalone` or `--prompt-stdin`. A prompt is still required;
`--options` with files refuses. File paths resolve from the CLI's working
directory, independently of the selected project. The owner accepts at most
16 native regular files, 20 MiB combined, and refuses symlinks, directories and
WSL file paths. This opt-in requires closed local-admin v21; older owners refuse
before file or directory effects, while commands without files retain their
existing versions.

Preparation checks metadata and readability without retaining file bytes. At
start, the owner reads and copies those exact files into its existing attachment
storage. Replaced or changed files refuse; prepare the task again to select the
new contents. Copies use the canonical prompt/history attachment pipeline and
remain with retained sessions if the originals are later edited or deleted.
Existing provider/model support determines whether content is inlined or passed
as a file reference. A directory registration can remain after file validation
or a later task failure; inspect `projects list` before retrying. Text output is
unchanged; tool-enabled JSON runs use format 2, with older-owner fallback to
format 1. No public upload route or credential domain is added.

Custom native ACP registrations use `providers custom` (local-admin v16,
command/JSON version1). `command.json` contains an existing executable and argv,
for example `{"binary":"agent-acp","args":["--stdio"],"cwd":"project"}`.
Optional `capabilities.models`/`modes`, `authMode: "envVar"` with `authEnvVar`,
or `cwd: "fixed"` with an absolute native `fixedCwd` are supported. Environment
values come through hidden prompts or bounded file/stdin JSON and are sealed
in the existing provider settings store; keep credentials out of arguments.
An empty submitted environment value removes that entry. List/inspect return
names and an argument count, never environment values or argument contents.

These commands register configuration without installing a package or launching
a task. After successful writes, the running owner reconciles the affected native
status; discovery can probe that command. A failed reconciliation leaves the saved
configuration intact and records an actionable diagnostic. They are separate from built-in saved profiles and registry-managed
installations. Configure/remove compare the exact inspected revision against
each fresh settings-authority snapshot; concurrent changes refuse. Removal
preserves persisted history and does not stop existing runtimes or log out an
upstream account. Native commands have no WSL fallback, and existing unscoped
or WSL registrations cannot be silently adopted. Use the exact
`acp-generic:<id>` with `auth methods`, supported `auth login`, or `run --options`
after registration. See `providers custom --help` for flags.

`setup` is an interactive configure/start/login journey. It asks whether to start
in the foreground before saving configuration; the default is no. `--start`
selects foreground startup explicitly, `--no-start` saves configuration only,
and `--skip-auth` skips provider login. `--config` selects the same saved file for
configuration and startup. Optional `--provider`, `--method`, `--runtime` and
`--wsl` preserve the exact login target; method/runtime selection requires an
explicit provider. Authentication options conflict with `--no-start` and
`--skip-auth`. Scripts use the individual `configure`, `serve` and `auth login`
commands; setup requires a terminal and does not accept `--json`.

Setup starts without opening a browser by default. Add `--open` to open the
local web app after startup, or `--no-open` to state the server-only choice
explicitly. Both start modes serve the bundled web client. `--open` conflicts
with `--no-start` and never bypasses the explicit start decision. Browser
opening uses the same short-lived handoff as `serve --open`; a failed browser
launch leaves the foreground server running so provider setup can continue.

For saved-profile values, select `setup --start --profile-env` instead of the
provider-login options. It offers saved profiles, asks for environment variable
names, and collects hidden values through the existing sealed writer.
`--profile <id>` and repeated `--prompt-env NAME` select the profile and names
explicitly; either option also selects profile-environment mode. This mode
conflicts with provider/runtime/WSL login options, `--no-start`, and `--skip-auth`.
The values belong to the chosen saved profile across its supported environments;
they are not a separate native/WSL account store. Completion reports configuration
saved, without claiming that an upstream account was authenticated. Registry
installations do not automatically become saved profiles.

For explicit first-time profile creation, use `--new-profile <id> --driver <driver>`
with at least one `--prompt-env NAME`. Supply `--profile-config-file JSON` when
the driver requires configuration. This is separate from the server's `--config`:
setup reads the profile file and runs the selected CLI's declared driver validator
before any setup prompt, configuration write or start. It does not guess credential
roots or convert native/WSL paths. A driver unknown to that CLI refuses explicitly.
Use `providers add` directly for a profile without environment values.
`--profile` and `--new-profile` are mutually exclusive; `--driver` and
`--profile-config-file` cannot retarget an existing profile.

Use `providers drivers` (`--json` optional) against the running owner for supported
saved-profile driver IDs and optional declared credential variable names. These
definitions are separate from the installable `providers catalog` and detected
`providers list`: they do not prove installation, runtime availability or account
authentication. Driver JSON carries `formatVersion: 1` and the explicit
`saved-profile-drivers` scope.

Hidden profile creation requires local-admin v5. Before asking for values, the
owner checks the driver configuration, duplicate ID, supported variable names,
secret persistence and declared dependencies. The check saves nothing and is not
a reservation. The CLI retains the checked configuration during key entry; it
does not reread the file between that check and submission. The final existing
`providers add` writer recomputes against each fresh settings snapshot, seals the
values and rechecks dependencies. A removed or disabled referenced owner refuses
creation, while unrelated edits remain. Older owners refuse before hidden input;
there is no unchecked fallback. Explicit file/stdin creation scripts retain the
original v1 request and the same final validation. Creation does not install a
registry agent or create or authenticate an upstream provider account.

Setup starts through the existing foreground owner path and refuses an already
owned profile. It never stops or adopts that owner; use `auth login` separately
for an existing running profile. It does not install a background service or a
provider. Wider binds still require the normal TLS/security configuration.
After a successful start, keep the terminal open. If login fails, the error is
reported and the foreground server remains running for an explicit retry in
another terminal; no authentication success is announced. Ctrl+C requests its
normal drain. Pair another client with `pairings create` from another terminal
using the same `--base-dir`.

On Windows, the launcher's graceful-stop fallback uses `stop --if-pid <child-pid>`
and the existing owner-generation check. It refuses to stop a different owner;
an older server parser refuses the new local option instead of retrying an
unqualified stop. This guard does not signal a PID or change host-control/admin
versions. Manual `stop` without that guard retains its explicit profile semantics.

Account listing uses the provider adapter's existing public credential inventory.
Use `--wsl <distro>` for its WSL inventory. Runtime-specific account listing is
refused; there is no fallback to another runtime and no universal account switch
or rename command. Provider accounts remain separate from plugin service accounts
and client-access grants. Environment methods use the existing profile environment
or server environment; account listings never return credential values.

Without `--method`, interactive login offers the provider's advertised methods
when selection is required, while respecting its preferred terminal login.
Scripts select the provider and method explicitly. Provider, method and cleanup
calls stay pinned to the same owner generation and exact native/WSL/runtime target.

For profile environment values, repeat `--prompt-env NAME` on `providers add` or
`providers configure`. Input is hidden, kept out of terminal history/output and
temporary JSON files, and sent through the same sealed profile writer used by
`--env-file`. All prompts must finish before the profile update is submitted;
EOF, cancellation or stream failure during prompting saves nothing. This requires a terminal
without `--json`; use `--env-file` for scripts. Choose environment names advertised
by the provider's method. Saving profile environment is separate from creating
or switching an upstream provider account. `--env-file` and `--prompt-env` cannot
be combined. Scripts may instead pipe a JSON object of environment names to
string values into `--env-stdin`, avoiding an intermediate credentials file.
Input is limited to 65536 bytes and 16384 characters per value; the full command
must also fit the existing local-admin request limit. Input/JSON errors are
reported without echoing values and are rejected before contacting the owner.
Choose exactly one of `--env-file`, `--env-stdin`, or `--prompt-env`.
In a terminal, `providers configure` offers existing saved profiles by ID.
`providers configure <id>` without edit flags asks for comma-separated environment
names and hidden values. An explicit edit such as `--name` skips the environment
questions. Scripts and `--json` require the exact profile ID and retain their
explicit flags. The picker never creates a profile, enables a disabled profile,
or selects a different ID when the requested profile is missing. Variable names
and all values must be valid before any update is submitted. For an existing
running server, this command provides profile setup without restarting the owner.
Interactive configuration requires local-admin v3: it prepares the exact saved
profile before asking for values, then verifies an opaque host-lifetime revision
against each fresh settings snapshot before saving. If that profile changes while
input is open, the update refuses; restart the command and review the profile.
Edits to unrelated profiles can rebase without overwriting them. Older owners
refuse before hidden input; the CLI never retries through an unchecked write.
Explicit script edits and other existing v1/v2 commands retain their old requests.
Human inventory commands display summaries; `--json` preserves their
structured results. Run a command group with `--help` for its supported flags,
or append `--help`/`-h` to an individual operation such as
`providers configure`, `auth login`, `clients revoke`, `pairings create` or
`service install` for its exact arguments and identity/revocation limits.
`serve`, `stop`, `status`, `doctor`, `activate`, `backup`, `init-tls` and `upgrade`
also have focused help; required operation flags are not needed to read it.

Use `plugins list` or `plugins refresh` (`--json` optional) to discover or rescan
the supervisor's global bundled/user package roots. The summaries use the same
install/enable defaults as desktop. Declared OS support and saved enable policy
do not prove runtime capability, a live connection or service-account login.
Project plugin roots are outside this global inventory. Existing registry reads
may ensure the writable user plugin directory; refresh does not install or update
a package or refresh a catalog source.

`mcp list` shows saved user-server IDs; `mcp inspect <server-id>` inspects exactly
one unique ID, with no fallback to a display name. Both support `--json` and read
the existing settings store. They return only configuration metadata, variable
and header names, and disabled-tool names. Commands, arguments, paths, URLs,
environment/header values, tokens and secret references are omitted. These
commands do not probe a server or authenticate an account; plugin/built-in MCP
servers remain separate. Missing or duplicate IDs refuse without selecting one.

These inventories require closed local-admin v4. Earlier v1/v2/v3 commands retain
their requests; an older owner refuses the new actions without a fallback or
implicit upgrade. Inventory JSON includes `formatVersion: 1`; scripts should
check it. CLI and owner validate the curated metadata shape before printing, so
unknown fields or future formats refuse instead of returning raw configuration.
Provider accounts and plugin service accounts remain separate.
Use `plugins accounts list <plugin> --json` for that plugin's service-account
metadata. Select an existing connected account with `plugins accounts select
<plugin> --server <name> --account <uuid>`. Sign out its local credentials with
`plugins accounts logout <plugin> --server <name> --account <uuid>`; a terminal
asks for the exact account UUID, while scripts and JSON require `--yes`.
Selection/logout never fall back to another plugin, service or account. Metadata
is retained on logout. Labels are user-assigned, not verified upstream identities.
Account status reflects stored/refreshable credentials, not live service health.
These commands require closed local-admin v10 and use JSON formatVersion 1 with
`plugin-service-accounts` scope. Provider logins remain independent.

`mcp auth status <server-id>` reports whether the exact saved HTTP/SSE server's
user OAuth slot contains usable or refreshable credentials; it does not contact
the MCP server. A negative result means no usable credentials were reported,
rather than proof the credential file is empty. It lists saved IDs sharing that exact URL-keyed slot without
printing the URL or credentials. `mcp auth logout <server-id>` clears that shared
user slot, preserving configuration, plugin accounts, provider logins and running
sessions. A terminal shows the sharing set and asks for the exact server ID;
scripts/JSON require `--yes`. A changed definition or sharing set refuses before
clearing credentials. Configured Authorization headers take precedence and are
not removed by OAuth logout. These commands require local-admin v10 and JSON
formatVersion 1 with `saved-user-oauth` scope. Unknown/private result fields and
mismatched targets refuse without an automatic retry.

Use `mcp auth login <server-id>` for a saved user HTTP/SSE server, or
`plugins accounts login <plugin> --server <name> --label <text>` for an independent
plugin service account. Add `--account <uuid>` to reauthenticate that exact plugin
account instead of creating one. These login commands require closed local-admin
v11 and a compatible supervisor; existing commands retain their earlier versions.
Open the printed authorization URL and keep the command running. Ctrl+C cancels
the owner-side operation and joins its callback/request cleanup. Authorization
headers must be removed explicitly before OAuth login; no credential fallback is
used. A changed saved definition refuses authentication confirmation.

The callback listener runs on the server's loopback interface. Over SSH, forward
the loopback port from the authorization URL's `redirect_uri` to that server
before opening the URL on your own machine. No tunnel or browser is opened
automatically. Login `--json` emits newline-delimited version-1 `start`/`wait`
records with exact operation/target identity; the authorization URL is deliberately
included so a script can present it. JSON failures append the existing
`{ok:false,error}` CLI record to stdout and exit nonzero; human-readable errors
use stderr. Keep
these transient authorization records private. Tokens remain in the existing
sealed MCP store and never appear in CLI output. Catalog/package lifecycle is
separate from service-account login.

Use `mcp enable <server-id>` or `mcp disable <server-id>` to change one saved user
server's configured enabled flag. `mcp remove <server-id>` deletes only its saved
configuration. Use the exact ID from `mcp list`; display names are not selectors.
A terminal requires the exact typed ID for removal, while scripts and `--json`
require `--yes`. IDs are preserved verbatim. Missing or duplicate IDs refuse
without choosing another record.

These changes require closed local-admin v6. Each write derives its intent from
the fresh settings snapshot, preserving unrelated servers, the target's other
fields on enable/disable, future fields and other preferences. Bounded conflicts
or a disappeared target refuse; the CLI does not replay a broad settings snapshot.
Successful JSON carries `formatVersion: 1`, `scope: "saved-user"`, the confirmed
`change`, `serverId` and, for an enable change, `enabled`. No server configuration
or credential values are returned. Unknown result formats or a mismatched target
refuse output without an automatic retry; inspect `mcp list` before retrying.

Providers apply saved configuration when they next resolve it. These commands do
not force a process reload or edit native-provider copies. Running sessions,
per-thread selection, built-in/plugin servers and OAuth credentials have separate
lifecycles. Configuration removal is not service-account logout or revocation.
MCP OAuth login, connection probing and runtime reload remain separate
CLI work; there is no provider-login or URL-keyed credential fallback here.

Create a saved user MCP definition with `mcp add`, or fully replace an existing
one with `mcp configure`. Supply exactly one private UTF-8 JSON file or piped
JSON input, up to 65536 bytes. The object must include the exact positional `id`,
a unique non-reserved `name` and one canonical `transport`:

```json
{
  "id": "tools",
  "name": "tools",
  "transport": { "type": "stdio", "command": "tool-server", "args": [], "env": {} }
}
```

```sh
poracode mcp add
poracode mcp add tools
poracode mcp add tools --config-file ./private-mcp.json
poracode mcp configure tools --config-file ./private-mcp.json --yes --json
```

In a terminal, omit file/stdin input to use guided creation. It asks for a server
ID and unique non-reserved name, then `stdio`, `http` or `sse`. Stdio takes a
literal executable command, arguments as a JSON array, an environment JSON
object and optional working directory. HTTP/SSE takes a URL and headers JSON
object. Transport values are hidden while typing and never printed back. Blank
JSON fields use empty arrays/objects. The final prompt requires the exact ID to
save; cancellation saves nothing. This step does not connect or authenticate the
server. Guided creation first requires a read-only local-admin v9 check of the
exact ID/name and persistent storage. An unsupported owner, failed storage check
or duplicate refuses before any transport values are collected. The check is not
a reservation: the owner rechecks uniqueness and storage in its existing v7
writer at commit time, using the same captured owner generation.

The guide requires a terminal without `--json`. Scripts retain the explicit ID
plus `--config-file` or `--config-stdin` path. Advanced server options use that
full-definition input and retain their existing v7 request. Hidden input protects terminal echo; definitions still
use the same MCP configuration store described below.

For a pipe, replace `--config-file PATH` with `--config-stdin`. Values are never
accepted in argv or returned in command results. The stdio transport accepts
`command`, `args`, `env` and optional `cwd`; HTTP/SSE accepts `url` and `headers`.
Server options are `description`, `enabled`, `timeoutMs` and `disabledTools`.
Use private input with explicit values: redaction markers and internal credential
selectors are refused. Definitions use the existing MCP configuration store;
this is separate from sealed provider-profile values and MCP OAuth tokens.

Configuration is a full replacement of known fields: omitted optional values
take their canonical defaults. A terminal requires typing the exact ID, while
scripts and `--json` require `--yes`. Input is captured once before confirmation.
Closed local-admin v7 prepares public metadata and an opaque host-lifetime
revision before the checked write. Both calls retain the captured owner
generation. The host rechecks the target from each fresh CAS snapshot; a changed
or missing target refuses, while unrelated changes are preserved. Add refuses
existing IDs or duplicate names. Neither command copies stored redacted values,
authenticates an account, probes a connection or reloads a running session.
Successful JSON uses `formatVersion: 2`, `scope: "saved-user"`, `change` (`add` or
`configure`) and `serverId`, without configuration values. Earlier v1–v6 commands
and result formats stay unchanged; old/future owners refuse before effects.

Catalog/package administration requires a selected owner with local-admin v12:

```sh
poracode plugins catalogs list --json
poracode plugins catalogs add --path /absolute/host/catalog --yes --json
poracode plugins catalogs add --url https://example.org/plugins.git --ref main --yes --json
poracode plugins catalogs inspect CATALOG_ID --json
poracode plugins catalogs refresh CATALOG_ID --json
poracode plugins inspect CATALOG_ID ENTRY --json
poracode plugins install CATALOG_ID ENTRY --review-digest SHA256 --yes --json
poracode plugins update CATALOG_ID ENTRY --review-digest SHA256 --yes --json
poracode plugins disable NAME --yes --json
poracode plugins enable NAME --yes --json
poracode plugins remove NAME --yes --json
poracode plugins catalogs remove CATALOG_ID --yes --json
```

These commands use the same supervisor catalog snapshots, reviewed package
digests, installation receipts and scoped account cleanup as desktop. Sources
are local host paths or public HTTPS Git repositories without credentials, query
or fragment. Relative CLI paths resolve against its working directory. Catalog
list reports IDs, sources and entry counts; inspect lists that source's entries.
Refresh updates source metadata, without updating installed packages. Removing
a source keeps installed packages, enable choices and service accounts.

Review package files before trusting their executable commands or MCP tools.
Inspection materializes the package but does not execute or enable it. Public
results omit command arguments, MCP environment/header values and diagnostic
details. Scripts and `--json` require `--yes` for changes and the exact digest
from `plugins inspect` for install/update. In a terminal, install/update prints
review metadata and asks for the exact entry name; other changes confirm their
exact target. A changed digest refuses before copying package files.

New catalog packages default to disabled; existing saved enable and component
choices are retained on install/update. `enable`/`disable` use the existing settings CAS
writer and affect future resolution, preserving running sessions. Always-on
bundled plugins refuse disable; unsupported host platforms refuse enable or
installation. Removal refuses bundled, project, manually placed, linked or
locally edited packages; it removes only catalog-owned user files, their local
service-account credentials and that package's enable policy. Provider accounts,
other packages and history stay separate. If files commit but the settings CAS
refuses, the command reports that partial state and how to inspect/recover;
it does not silently roll back files or report complete success. JSON format 1
echoes the exact command and global scope. Earlier admin versions stay closed;
old/future owners refuse before effects, with no owner restart or fallback.

Profile removal deletes saved configuration, environment values and the same scoped
preferences that desktop removal clears. Provider-managed login files remain;
use the provider's supported `auth logout` before removing its profile to sign out.
Removal preserves conversation history and neighboring profiles,
and refuses newly dangling profile dependencies. Interactive removal requires typing
the profile ID; scripts must pass `--yes`. `unset-env` deletes only the named profile
environment keys. Registry-installed agents are not saved profiles.

`pairings create` issues an independent one-use grant without rotating the desktop
QR. Choose one preset or repeated explicit known scopes. Defaults are operator and
10 minutes; `--ttl` accepts integer `ms`, `s`, `m`, or `h` durations from 1 second
through 24 hours. Labels contain 1–120 characters. The result includes the grant ID,
expiry, scopes and pairing URL. `--qr` writes the QR to stderr; `--json` emits only
JSON to stdout, and the two flags cannot be combined. Use the same `--base-dir`
when listing or revoking. `clients remove` is an alias for revocation, not forgetting
a saved remote-server route.

`configure --unset` removes known saved configuration fields, leaving environment
and explicit startup flags higher in precedence. TLS material must remain a complete
pair. Changes apply on the next explicit start; `configure` does not restart or
reload a running owner. Fresh adjacent configuration and existing in-namespace
configuration keep the precedence described above.

`configure` exposes the existing saved fields with `--bind-mode`, `--tls-cert`,
`--tls-key`, `--relay-url`, `--trusted-proxies` (comma-separated addresses/CIDRs),
`--log-level`, `--log-max-bytes`, `--log-max-files`, and
`--shutdown-drain-deadline-ms`, in addition to `--host`/`--port`.
`--show` reads only saved values. `--effective` returns the independently versioned
`formatVersion: 1` view and resolves the next start using this
invocation's environment and working directory and reports each field's source,
bind warnings/refusal and the requested port. A service may use a different
environment or working directory. Both views hide relay URL credentials, query
values and fragments; inspection output is not a configuration export. Invalid
or non-hierarchical relay URLs are hidden completely. The actual port is chosen when the listener
starts. Use `status` to inspect the running owner. Both views are read-only and
cannot be combined with edits or with each other.

`sessions list` reads this profile's persisted thread catalog through the existing
bounded database page reader. It includes archived/done threads, defaults to 50
entries, and accepts `--limit 1..100`, an opaque `--cursor` and an optional exact
`--project` ID. Continue with `nextCursor` using the same project filter.
`sessions inspect <thread-id>` reads one thread's metadata. Saved status can be
stale; neither read starts a provider or exposes configuration, provider session
identities, credentials or transcript content.

`sessions stop <thread-id>` closes that persisted thread's PTY or structured
runtime through supervisor-confirmed retirement, preserving history and profile
configuration. This closes the runtime rather than only interrupting a turn.
The interactive command requires typing the exact thread ID; scripts and JSON
require `--yes`. Missing threads or unconfirmed retirement are errors; there is
no PID-kill fallback or automatic provider restart. These commands require the
separate closed local-admin v8; older owners refuse before effects. Their JSON
bodies use `formatVersion: 1` and `scope: "persisted-profile"`. Earlier admin
commands retain their existing versions. Client-access revocation remains a
separate `clients revoke` operation.

`sessions rename <thread-id> --title TITLE` changes the saved title (trimmed,
1–500 characters). `sessions archive` and `sessions done` require confirmed
runtime closure before updating metadata; scripts/JSON require `--yes`, and an
interactive terminal asks for the exact thread ID. Done also clears its star.
`sessions unarchive` restores visibility without changing done; `sessions reopen`
clears done without changing archive visibility or restoring the star. Neither
starts or resumes a provider. No transcript is deleted by these commands;
existing automatic archive/history-retention policy still applies.

These metadata changes require closed local-admin v18. Earlier v1–17 commands
retain their schemas and version echoes; older owners refuse new changes without
fallback. JSON formatVersion 1 echoes the change, current saved session metadata
and whether runtime retirement was confirmed. Writes use a fresh atomic row and
preserve configuration, runtime state, ordering and history. A changed execution
identity while closing refuses the metadata change. Inspect the same thread
before retrying a failed or disconnected mutation.

`sessions export <thread-id> [--output FILE|-]` streams one consistent committed
snapshot as JSON (`kind: "poracode-session"`, `formatVersion: 1`,
`scope: "persisted-thread"`). Output defaults to stdout. `--output` publishes a
complete new file only after checksum verification and never overwrites an
existing destination. Its parent directory must already exist. It includes
every persisted structured item and retained
stream, completed turns, context usage, the history notice and saved terminal
scrollback. Scrollback is the existing retained tail, at most 200,000 UTF-16
code units, rather than a full terminal log. Attachment files, provider
configuration and credential stores are excluded; conversation content itself
can contain sensitive data. Review exports before sharing. This is an export
format, not a profile backup or an import command.

Export requires closed local-admin v13; earlier owners refuse before starting
work. One read-only export worker per owner pins a SQLite snapshot, then serves
bounded chunks without starting a provider. The idle lease is two minutes and
the overall deadline is ten minutes. Ctrl+C cancels and joins the worker;
shutdown joins both pending startup and worker/process pipes before releasing
host ownership. A nonzero exit or truncated stdout means the export is
incomplete; use `--output` when a partial stdout stream would be unsuitable.

Shell completion is available through both the npm launcher and the bundled
server CLI, without installing a runtime or contacting a running owner. Print
the script for your shell and source the saved file explicitly:

```sh
poracode completion bash > ./poracode-completion.bash
source ./poracode-completion.bash
```

Use `zsh` or `fish` instead of `bash` for those shells. Bash needs version 4 or
newer; Zsh needs its completion system initialized with `compinit`. For
PowerShell 7:

```powershell
poracode completion powershell | Set-Content -Encoding utf8 ./poracode-completion.ps1
. ./poracode-completion.ps1
```

Generation does not edit shell profiles or install scripts. Loading the printed
script registers completion in that shell session; choose your own persistent
profile location if desired. Suggestions cover supported command/subcommand and
option names, static choices such as pairing scopes, and native shell file-path
completion. Provider/profile/account/client IDs remain explicit; completion does
not discover them or read credential/configuration files. It never starts,
updates, stops or adopts an owner. Repeatable options remain available after use.
Regenerate the script after updating the CLI to include its current commands.

`completion --json` prints the public catalog with `formatVersion: 1`. Generated
scripts use closed query version 1: `completion --query 1 --current=PREFIX --
COMPLETED_WORDS`. The response begins `poracode-completion-v1`, followed by a
`candidates`, `files` or `none` line. Remaining lines are static candidates or,
for inline file options, the known option prefix. No input values are echoed.
Unknown versions refuse before effects; scripts require the exact header. Query
words are processed before profile flag extraction, so completing `--base-dir`
cannot itself select or mutate a profile. Shell adapters pass data as arguments
and never evaluate query responses as code.

### 7.2 Explicit managed user service

```sh
poracode --base-dir /absolute/profile service install --prefix /absolute/installed-prefix
poracode --base-dir /absolute/profile service status --prefix /absolute/installed-prefix --json
poracode --base-dir /absolute/profile service start --prefix /absolute/installed-prefix
poracode --base-dir /absolute/profile service restart --prefix /absolute/installed-prefix
poracode --base-dir /absolute/profile service stop --prefix /absolute/installed-prefix
poracode --base-dir /absolute/profile service uninstall --prefix /absolute/installed-prefix
```

One managed registration is allowed per explicitly selected installed prefix and
is bound to one OS account and profile. Another profile/account refuses; use
explicit separate prefixes for additional profiles. The selected prefix must have
`current` pointing directly into its installed `releases/<releaseId>` directory.
A checkout or the launcher's npm runtime cache is not a managed-service prefix.

Linux uses `systemd --user`. Installation enables the exact generated unit for
user-manager startup without starting it. Availability follows that user's
manager/session; no lingering, elevation or system-wide registration is configured.
The standard `/run/user/<uid>/bus` must be owned by the actual current uid. An
inherited alternate bus address is not selected.

Windows uses a same-user Task Scheduler task with an at-logon trigger and a
versioned, windowless native launcher. Installation enables it without starting
it. It requires an existing interactive user session; this is not an unattended
boot service. Run commands as the selected unelevated user. No password, S4U,
elevation, automatic restart or forced termination is configured. The launcher
joins the native Node host and retains output in `<prefix>/service-startup.log`.
The installed release must contain the matching native launcher artifact;
installation never downloads a helper or substitutes another architecture.

macOS uses a same-user launchd login agent and requires that account's active GUI
session. Installation writes and enables the agent without loading it; explicit
start bootstraps it now, and subsequent GUI logins load it automatically. SSH
administration works while that same user's GUI session exists; without one,
use foreground `serve`. No root boot daemon or background-item approval bypass
is configured. The native job API qualifies its executable, full argument vector,
on-demand policy, session type and PID. Unsupported responses refuse before
effects; the CLI does not parse `launchctl print`. Native enablement overrides
are reported as unknown, rather than inferred from the saved plist. The existing
manual service recipes in section 4 are separate from this registration.

The service runs verified Node from the selected `current` release, an explicit
profile selection, and an optional absolute `--config` path supplied
at installation. Run installation using native Node.js; an Electron-hosted CLI is
refused before registration because its run-as-node mode is not persisted.
With no explicit config, the usual namespace configuration
precedence is evaluated on each start. Shell environment values and credentials
are not copied into the registration or unit. Provider accounts remain in their
existing stores. On Linux and Windows the user manager's environment still applies;
configure saved server settings deliberately. The macOS command clears inherited
environment values, selects the registered profile and native account home, and
uses the standard system, `/usr/local/bin` and `/opt/homebrew/bin` search paths.
Configure provider paths explicitly when a version manager uses other directories.
Start/restart never download, install or update a
release. Automatic crash restart is disabled so an authenticated stop or failed
startup remains stopped until an explicit start.

`service-registration.json` preserves closed format 1 for Linux/macOS and uses a separate
closed format 2 for the Windows launcher's protocol, length and SHA256. Both bind
the selected prefix/profile/account, a non-secret nonce, and
`prepared`/`installed`/`removing` states. Install flushes prepared evidence before
native registration. Loaded source, drop-ins, account and launch policy are
qualified before effects. Future/invalid formats and edited/unowned definitions
are preserved and refused. After an interrupted operation, inspect `service status`
and use `service install --recover --prefix ...` for a matching prepared install,
or `service uninstall --recover --prefix ...` to finish owned removal. Recovery
does not change the saved profile/config target. Uninstall preserves profile data,
history and installed releases.

Windows keeps its registered launcher at a stable prefix-relative path, pinned by
the registration. Normal server upgrades do not replace it. Changing launcher
bytes requires explicit retirement and re-registration; edited or missing bytes
refuse native start/removal rather than being repaired or silently adopted. A
prepared install that never registered a task can be removed with explicit
`uninstall --recover` without manufacturing a running service.

Stop/restart/uninstall require the exact authenticated headless owner, generation,
installed build, free owner lease after retirement, and native process retirement.
On Windows this includes the exact task instance, launcher and native Node child;
an engine PID or friendly task name alone is insufficient. Orphaned or ambiguous
process topology refuses automatic adoption or cleanup.
They refuse desktop owners and standalone processes outside the registration;
there is no PID kill or manager-stop fallback. A missed join prevents restart or
removal and leaves evidence for inspection.

These service mutations and upgrades share the existing fenced atomic prefix lock
format 1, with no additional registration lock or host-lease replacement. Explicit
upgrade/recovery selects the registered stable current target instead of direct
spawning and retains the existing candidate admission/build checks. With no
registration the previous shipped-systemd/direct upgrade path is unchanged.
Use a CLI containing these registration controls to manage or upgrade this prefix:
older CLIs do not read this optional registration and cannot qualify its service
or profile. Registration support does not retroactively make older tools safe for
this workflow; do not use them to mutate a registered prefix.

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

For live local diagnostics, run `poracode logs --follow` with the same
`--base-dir` as the server. `--lines 1..1000` selects the initial tail (default
100 lines, within 64 KiB); `--log-file PATH` selects another regular local
file. This reads files only: it does not start or contact an owner, open the
database, or prove a server is running. Symlink files are refused. Following
waits for complete lines, notices file replacement/truncation, and exits on
Ctrl+C/SIGTERM. While waiting for a missing file it does not start a server.

`logs --json` emits newline-delimited objects with `formatVersion: 1`,
`view: "local-log"`, `kind: "line" | "notice"`, and `text`. Text uses the same
diagnostic redaction as doctor; arbitrary secrets in application prose may
remain, so review before sharing. Partial leading tail fragments and lines
larger than 64 KiB are omitted with notices. This bounded diagnostic view is
not a complete log export and does not recover missed rotated files.
Reading/output failures exit nonzero and report on stderr, including with
`--json`, so a closed output pipe is never used to report its own error.

Local administration also works with a running desktop owner. Select the
app's exact profile namespace using `--base-dir`; provider configuration/auth,
clients, independent pairing grants, plugin/MCP and session commands use the
existing backend and stores. Main keeps the owner lease and native key
adoption; its fenced backend serves the authenticated administration listener
and joins cancelled work before closing. No second database writer is opened.
An older owner without administration refuses and stays running.

Desktop attach through legacy `pair`/`connect`, standalone `stop`/`upgrade`,
and service management remain separate. Use `pairings create` for an independent
client grant. That does not enable LAN access, change the endpoint, or rotate
the Settings QR; other devices still need the desktop's supported remote-access
configuration and a reachable route.

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

The standalone server is built for **macOS (darwin-arm64, darwin-x64)**,
**Linux glibc (linux-x64, linux-arm64)**, and **Windows (win32-x64)**, with musl
target keys (`linuxmusl-*`) resolved at runtime by glibc detection; a target is
published only when its release-matrix leg produced and qualified it. Windows
x64 is built and qualified natively on a Windows runner (win32-arm64 is not
advertised). Node.js >= 24.10 is the floor. The Windows install path and
service recipe are in §3.3; WSL projects are reached through the Windows host
(`wsl.exe`), not by running this server inside a distro. Unsupported targets
fail closed.

Qualification is per frozen artifact. The target install itself is the §3.3
recipe (the artifact's own shipped installer, no checkout); the source checkout
only supplies the harness that exercises that installed prefix:

```sh
# 1. Install the frozen bytes with the artifact's own shipped installer per
#    §3.3, then run the end-to-end loop from the checkout (doctor, boot, health,
#    pair, one PTY thread turn, SIGTERM drain with lease release, then an
#    upgrade of the same prefix and second drain). On Windows the drain is
#    the authenticated `stop` command and the turn runs in ConPTY.
node scripts/server-install-qualification.mjs --tarball <tarball> \
  --prefix <prefix> --artifact <server-artifact.json>

# 2. Qualify the publishable launcher against the same bytes (real npm pack,
#    empty external cwd, verified cache install, doctor through the bin).
node scripts/poracode-cli-qualification.mjs --runtime-tarball <tarball>

# 3. Required-mode real-artifact upgrade integration (fails instead of skipping).
PORACODE_REQUIRE_SERVER_IT=1 bun run vitest run --configLoader runner \
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
