# poracode

Run the Poracode standalone server, TUI, or one-shot prompt from a
version-pinned, checksum-verified runtime artifact.

Provider, client, pairing, plugin/MCP and session administration can also use an
already-running desktop owner: select its exact profile with `--base-dir`.
These commands use the app's backend, settings and credential stores. They do
not start a second writer or stop/adopt the app. Use `pairings create` for an
independent client grant; legacy `pair`/`connect` desktop attach remains refused.
Server start/stop/upgrade and service commands retain their standalone scope.

```sh
npx poracode@<version>                 # TUI in a terminal; serve without opening when non-interactive
npx poracode@<version> tui [DIRECTORY] # explicitly open the TUI
npx poracode@<version> -p "PROMPT"     # one-shot prompt
npx poracode@<version> serve           # server only, without opening a browser
npx poracode@<version> serve --open    # server + explicitly open the web app
npx poracode@<version> --open          # retain the web-app shortcut
npx poracode@<version> setup --start --open # guided configuration, server + web app, provider setup
npx poracode@<version> pair --json     # request a pairing URL from the running owner
npx poracode@<version> doctor --json   # read-only diagnostics
npx poracode@<version> logs --follow # redacted local server log; Ctrl+C stops following
npx poracode@<version> status --details --json # running owner's build and admission
npx poracode@<version> run --standalone --directory . --provider <provider> --model <model> "Explain this directory"
npx poracode@<version> --version
```

For a persistent command, install the same version with
`npm install --global poracode@<version>`, then run `poracode` or `poracode serve`.
Bare invocation opens the TUI when both stdin and stdout are terminals; otherwise
it retains the foreground-server behavior and does not open a browser. Use
`poracode serve --open` (or `poracode --open`) for the web app; `--no-open` means
server only. This does not install the Electron desktop app or a managed service.

The TUI and `-p`/`--print` use the existing profile and provider runtime. If no
owner is running, they start a detached `serve` process and wait for its local
control endpoint. The owner remains running after the TUI exits; stop it with
`poracode stop` and the same `--base-dir`. Provider/model/effort and the
approval/sandbox values actually used for the thread default from the TUI
selection in `<profile>/tui/last-model.json`; absent safety defaults require
explicit `--approval-policy`/`--sandbox` values.

The TUI saves one session per profile in `<profile>/tui/session.json` and
reuses it on every launch (concurrent TUIs share it); if the host rejects it,
the CLI pairs once, relaunches, and revokes only that exact previous session.
`clients list` and `clients revoke SESSION_ID` still manage entries.

Browser opening uses an independent one-minute operator pairing grant without
rotating the desktop QR or logging its token. If opening fails, the server keeps
running; use `pair --json` with the same profile for a fresh link.

`run --directory` registers an existing native folder or retains its saved project
identity/settings (local-admin v20); `--options` can register it too. The provider
must already be installed and configured. `--standalone` owns the selected profile
only for this task and joins shutdown; an existing owner refuses. Omit that flag
to use the running owner. A registration can remain if the subsequent task fails;
inspect `projects list` before retrying. No WSL fallback is selected.

Add repeatable `--file PATH` to a new or saved-session task (local-admin v21).
Paths resolve from the CLI's working directory: up to 16 native regular files,
20 MiB combined. Symlinks, directories, WSL files and `--options` with files
refuse. A prompt is still required. The owner checks files during preparation
and copies them at start; changed files refuse. Copies remain with session
history and use the existing provider/model attachment support.

Add `--interactive` with a quoted prompt to review task permissions and questions
in the terminal (local-admin v23). Both stdin and stderr must be terminals;
`--options` and `--prompt-stdin` cannot be combined with this flag. Choose an
advertised option number, or comma-separated numbers for multi-select. Empty
input never approves. Advanced structured replies use `j` followed by hidden
JSON input, at most 24 KiB. Complex forms need the adapter's response shape;
use a client for guided form entry. Invalid JSON is not submitted. Provider authentication still uses the separate `auth`
commands. Requests appear on stderr; stdout text/NDJSON formats stay unchanged.
Resolved/replaced prompts are closed, stale replies refuse, and Ctrl+C cancels
the exact run with confirmed cleanup.

Pin the version: there is no mutable `latest` runtime URL and no unverified
download path.

## How it works

- This package contains **no server code and no native modules**. It resolves
  the runtime tarball pinned to its own version in `runtime-manifest.json`,
  downloads it from the matching GitHub release, verifies its sha256, installs
  it atomically into a versioned cache, and then executes the artifact's server
  CLI.
- The cache lives at `<PORACODE_BASE_DIR or ~/.poracode>/runtime/<version>/<target>`,
  separate from profile data. A verified install is reused without network
  access. `PORACODE_RUNTIME_CACHE_DIR` overrides the cache root.
- A missing target, a checksum mismatch, or an unreachable release fails with
  an actionable error. The manifest in a published version lists exactly the
  target keys its release matrix qualified — the defined standalone machine
  families are `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`, and
  `win32-x64` —
  and anything else fails closed.
- `PORACODE_SERVER_TARBALL` plus `PORACODE_SERVER_TARBALL_SHA256` install a
  local verified tarball instead of downloading (air-gapped or pre-release use).

## Commands

All arguments after the executable are forwarded to the pinned runtime, so the
commands - `serve`, `tui`, `-p`, `pair`, `status`, `doctor`, `backup`, `init-tls`,
`activate`, `stop`, and `upgrade` - behave exactly as documented for the
standalone server. `poracode --help` lists them. `poracode stop` asks the
running server of the selected profile to drain and exit; on Windows it is the
only graceful stop, and the npm-installed `poracode.cmd` shim runs the launcher.

Use `poracode projects list --json` for paged project IDs and locations. Register
an existing directory with `poracode projects add . --json`, then inspect its
metadata with `poracode projects inspect <project-id> --json`. Registration uses
the running profile owner and local-admin v14; it launches no provider and
preserves an existing location's ID and settings. An explicit `--name` updates
its display name. Neither project inventory nor inspection returns configuration
or credentials.

Use `poracode sessions list --json` for bounded saved-thread inventory,
`sessions inspect <thread-id>` for metadata, and
`sessions stop <thread-id> --yes` for supervisor-confirmed runtime retirement.
These require local-admin v8 on the selected running owner and preserve history.
Saved status is not a live process probe. Session controls are separate from
`clients revoke`, which removes a client's access.

Register an existing native ACP command with `providers custom add <id>
--config-file command.json`. The file contains a command definition, for example
`{"binary":"agent-acp","args":["--stdio"],"cwd":"project"}`. Use
`--prompt-env TOKEN` for hidden terminal entry, or `--env-stdin` to read a JSON
object of environment names and string values from a pipe. Values are sealed;
keep credentials out of the command definition and its arguments.

Use `providers custom list` or `providers custom inspect <id>` for metadata and
`providers custom configure <id>` with explicit edit flags. Configure/removal
recheck the exact inspected revision. `providers custom remove <id> --yes`
removes only configuration and preferences, preserving history and existing
runtime processes. These controls require local-admin v16 and use JSON
`version: 1`; they manage native custom registrations separately from registry
installations and built-in profiles. There is no WSL command fallback.
See `providers custom --help` for definition fields and input limits.

Run a plain prompt with an installed structured provider on the running owner:

```sh
poracode run --options --project <project-id> --provider <provider-kind>
poracode run --project <project-id> --provider <provider-kind> --model <model-id> \
  --approval-policy <advertised-policy> --sandbox <advertised-mode> "Explain this project"
poracode run --project <project-id> --provider <provider-kind> --model <model-id> \
  --prompt-stdin --format json < prompt.txt
```

Specify approval/sandbox values when the selected runtime advertises those
controls. `run --help` describes the bounds and refusal behavior. This command
requires local-admin v15; it does not start or upgrade an owner. Text output is
collected until completion; JSON streams version-1 NDJSON with explicit
replacement records. Permission requests stop this noninteractive run without
approval. Success requires a completed turn, settled provider background work,
committed history and confirmed runtime retirement. History remains available
through `sessions`. Exact saved sessions can be continued with `run --session`;
terminal/WSL execution and slash commands require an interactive client.

`poracode mcp add` offers guided terminal setup for stdio, HTTP or SSE servers,
with hidden transport values and exact-ID confirmation. Scripts use
`mcp add <server-id> --config-file <private-json>` or `--config-stdin`.
This saves MCP configuration. Use `mcp auth login <server-id>` for OAuth login,
or `plugins accounts login <plugin> --server <name> --label <text>` for a separate
plugin service account. Login requires local-admin v11 on the selected owner;
keep the terminal open until completion or press Ctrl+C to cancel.

`plugins catalogs` lists, adds, inspects, refreshes or removes catalog sources.
Use `plugins inspect <catalog-id> <entry>` before `plugins install` or `update`;
scripts pass its exact `--review-digest` with `--yes`. `plugins enable|disable`
changes future launch policy. `plugins remove` deletes only a catalog-owned,
unmodified user package and its local service credentials. These controls require
local-admin v12; removing a catalog source keeps its installed packages.

## Status

The release workflow publishes this package only when npm publishing is enabled
for the repository. Until a release has published it, `npx poracode@<version>`
is not available from the registry; install the release artifact instead. The
operator runbook (artifact layout, service units, TLS binds, backup, upgrades,
qualification) is
[docs/STANDALONE_SERVER.md](https://github.com/Porabuild/Poracode/blob/main/docs/STANDALONE_SERVER.md).
