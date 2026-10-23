# Launcher and session internals

Details behind the commands in `SKILL.md`. Read when a launch, reuse, teardown,
or attachment behaves unexpectedly, or when recording isolated-build evidence.

Contents: [Isolated runtime](#isolated-runtime) ·
[Detached launches](#detached-launches) · [Teardown](#teardown) ·
[Session reuse and selection](#session-reuse-and-selection) ·
[Session records](#session-records) · [Usage collection](#usage-collection) ·
[Native-bridge mock gates](#native-bridge-mock-gates) ·
[PowerShell](#powershell)

## Isolated runtime

The smoke runner and the managed launcher allocate distinct free dev-server and
CDP ports (override with `--vitePort` / `--port`; explicit values are verified
free), create and commit a disposable fixture project, seed an isolated
database, and start Electron with an isolated profile and a session-owned
compiled runtime. Main, backend, supervisor, preload, workers, native
dependencies, resources, and renderer assets are snapshots, so checkout rebuilds
cannot change a lazy child or chunk load and concurrent runs share no runtime
files or ports. Managed launches never reclaim an occupied port or rebuild
another session's runtime.

The frozen renderer keeps the DEV test bridge for deterministic controls. This
is development integration evidence, not a production or performance build.
`--rendererViteHMR` (either launcher) makes only the renderer follow the
checkout through Vite; the session records that mode, so do not describe an HMR
run as a frozen candidate.

The default app-readiness deadline is 180 seconds; pass
`--startupTimeoutSeconds <n>` for slow cold starts (scenario timeouts are
unchanged). A cold renderer transform can take about a minute on a busy Windows
checkout. `state: "starting"` still owns the launch, so wait for `READY` or a
concrete failure instead of starting another app.

Native helper compilation uses a session-owned Cargo target directory.
Installed production dependencies (including lazy `createRequire` paths) are
copied and validated with the staged `ensure-native-deps.mjs --electron-native`
before the artifact hash is recorded. Managed launches clear inherited
helper/plugin/native-module overrides so those paths cannot silently select a
checkout artifact. Session staging creates temporary build links and replaces
them with copied runtime dependencies before launch.

## Detached launches

`poracode-cdp.mjs launch --new --root <unique root>` returns only after `READY`
and prints the `sessionFile`, ports, URL, owner PIDs, and launch time. `--new`
plus a fresh unique root is required so parallel agents cannot reuse or stop
each other's apps. It skips the welcome gate and waits for a mounted root plus
the preload and DEV bridges. Once `READY`, individual CDP actions should finish
in milliseconds; they do not inherit the cold-start budget.

## Teardown

`poracode-cdp.mjs stop` succeeds only after the owner has joined its process
groups, closed both ports, removed its isolated build, and marked
`session.json` stopped. On POSIX, a child that outlives its wrapper receives
escalated signals; an unverified group is left untouched and teardown fails with
artifacts retained. Ctrl-C in the owning terminal uses the same teardown path,
but some Windows PTY hosts report exit 1 even after a clean teardown — do not
infer failure from that exit code. `stop` allows 60 seconds by default;
`--timeout <seconds>` changes the deadline without weakening the checks.

A successful stop removes `runtime/` and leaves the rest of the session
directory (profile, fixture, artifacts). A failed or killed teardown leaves the
frozen runtime, about 2.6 GB. After cited evidence is copied to `tmp/`, delete
that session root once its owner PID is gone. See
[Safety and teardown](../SKILL.md#safety-and-teardown).

## Session reuse and selection

The launcher reuses an existing healthy session only when its source bytes and
renderer mode still match the checkout. Source edits or toggling
`--rendererViteHMR` require stopping the old session or passing `--new`.
`info --session <path>` still inspects an older baseline. Use `--new` for
same-checkout concurrency only when that is the behavior under test.

When more than one session exists, every helper refuses to guess; pass the
exact `--session <session.json>` printed by the launcher. `ports.json` is report
metadata, not an attachment instruction. Helpers accept an explicit complete
port + URL pair only for deliberate unmanaged-app diagnosis; they reject either
value alone and have no default-port fallback.

## Session records

`<run-id>/session.json` (schema 2) records the unique token, lifecycle,
checkout, URL/ports, base directory, `outDir`, owner PIDs, runtime source SHA,
dirty status, source/artifact hashes, paths, and renderer mode.
`runtime-manifest.json` keeps the build identity after teardown removes
`runtime/`. Schema 1 sessions remain inspectable and stoppable but cannot serve
as isolated-build evidence. Before recording final evidence, check the running
session's retained files:

```sh
node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs verify-runtime --session "<session.json>"
```

## Usage collection

Managed launches disable provider usage collection in both modes so background
quota polling cannot read provider credentials through the OS keychain and
trigger access dialogs (Chromium's mock keychain does not intercept a provider's
`security` subprocess). Real-mode provider turns still authenticate normally.
For a deliberate live usage test, set `PORACODE_DISABLE_USAGE_COLLECTION=0` on
the launcher; that may require keychain access.

## Native-bridge mock gates

Renderer mock gates load optional modules through the bundled `__poracodeDev`
loaders. Never import `/src/...` URLs from CDP scripts; frozen renderer
snapshots do not serve Vite's source namespace.

The quick-composer mock gate uses the separate version-2
`__poracodeSmokeNative` bridge, registered only for an unpackaged development
app with mock agents and restricted to the current main window's top frame. It
drives the real native overlay and submits through its normal IPC path,
intercepting provider launch at main-renderer thread creation. Its `mocked`
result does not acknowledge the real quick-composer gate: global shortcut/tray
invocation, OS dragging/reopening, dismissal motion, and a real provider-backed
handoff still need the manual workflow.

For a mock shutdown check, the same bridge exposes `closeMainWindow()` (the real
native close, respecting close-to-tray) and `quitApp()`. Check `version === 2`
first, invoke through `poracode-cdp.mjs eval --await`, then verify process exit,
owner teardown, and any diagnostic end records — dispatch or a closed CDP target
alone does not prove shutdown. Do not use HTML `window.close()`: Electron's
sandboxed renderer can destroy the window without firing the native close
callback. These probes do not cover OS menu/shortcut paths or replace managed
owner cleanup.

## PowerShell

Invoke CDP actions directly with the call operator; never through
`Start-Process` or a temporary wrapper script. Keep selectors with spaces in
variables or quoted positional values, and pipe multi-line or quote-heavy
JavaScript to `eval -` so PowerShell does not rewrite it:

```powershell
$cdp = ".agents/skills/interactive-testing/scripts/poracode-cdp.mjs"
$session = "<session.json path printed by the launcher>"
$selector = '[data-composer-input-anchor] [contenteditable="true"]'
& node $cdp type $selector "latency probe" --session $session --commandTimeoutMs 2000
@'
(() => ({ title: document.title, windowKind: document.documentElement.dataset.windowKind }))()
'@ | & node $cdp eval - --session $session --commandTimeoutMs 2000
```
