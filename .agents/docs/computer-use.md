# Computer Use

Read this only when changing the built-in `computer_use` MCP server, its Rust
helper, the overlay, or the bundled computer-use plugin. It records the
contracts and the platform behavior behind them; the code and tests are the
source of truth for details.

Poracode's `computer_use` MCP server runs in the host process. A bundled Rust
helper performs native window discovery, passive capture, accessibility
queries, and input. The renderer only enables the capability for a thread and
displays status; it never starts native automation processes.

## Architecture and file map

```text
agent MCP client
  -> ComputerUseMcpIngress (authenticated loopback MCP server)
  -> toolRegistry / dispatch / toolArgs
  -> CompositeComputerUseDriver
       -> HelperComputerUseDriver -> persistent NDJSON Rust helper
       -> legacy Windows/macOS driver, only when helper startup/handshake fails
  -> ComputerUseActivityTracker -> ComputerUseDesktopOverlay
```

- `src/host/computer-use/ComputerUseMcpIngress.ts` — authentication,
  enabled-thread scope, dispatch, activity events. Composed by
  `src/host/hostServices/composeHostServices.ts`.
- `src/host/computer-use/mcp/` — tool schemas (`toolSpecs.ts`), argument
  normalization, result formatting, agent instructions (`instructions.ts`).
- `src/host/computer-use/drivers/` — helper host, compatibility handshake,
  binary lookup, and the limited legacy fallback (`composite.ts`).
- `src/host/computer-use/ComputerUseActivityTracker.ts` — reduces overlapping
  session/action events to `hidden`, `badge`, or `takeover` overlay state.
- `src/main/computer-use/ComputerUseDesktopOverlay.ts` — per-display overlay
  windows, the scoped Escape shortcut, and the badge's exit button. The badge
  window hugs the chip and takes mouse events; the exit link is intercepted in
  `setWindowOpenHandler`, so the badge page stays a sandboxed `data:` URL with
  no preload.
- `src/main/computer-use/ComputerUseWakeLock.ts` — display-sleep blocker (see
  [Keep awake](#keep-awake)).
- `src/shared/contracts/computerUse.ts` — TypeScript side of the helper
  compatibility boundary.
- `native/computer-use-helper/` — Rust protocol host plus Windows, macOS, and
  Linux backends. The macOS backend is split by concern: `chromium.rs` owns the
  Chromium-shell test; `ax/mod.rs` the AX FFI, window identity, and entry
  points; `ax/snapshot.rs` batched attribute reads and the bounded tree walk;
  `ax/press.rs` resolving a coordinate or request into an acted-on element and
  observing the result; `ax/webcontent.rs` getting a browser to expose its
  page. Shared element logic (including the page wait) is in the helper's
  `src/elements/`.
- `scripts/prepare-computer-use-helper.mjs` — builds and stages platform
  binaries under `resources/computer-use-helper/`.

The host supplies the helper root and a persistent state directory. Packaged
apps use `process.resourcesPath/computer-use-helper`; `pnpm dev` stages a Cargo
development build under `resources/computer-use-helper-dev`; release packaging
uses `resources/computer-use-helper`. Linux portal restore data lives in the
app's computer-use state directory, not the repository.

## Plugin layers

The bundled `computer-use` plugin (`resources/plugins/computer-use/`) has three
agent-facing surfaces, loaded together only on an `@Computer Use` mention.

| Surface                                | When the agent sees it                                                                                    | What belongs there                                                                                                                                                                                                                                                                                                             |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MCP instructions + tool schemas        | Every thread with the `computer_use` server attached (composer toggle, mention, or an always-on provider) | The result contract: background-only before takeover, reading `delivery` / `refused` / `verified`, tree conventions, browser recovery, scroll platform split, enable/disable, locked screen. Names the plugin `coreSkill` and says to load it first; must still work if the agent does not. `api` returns the same skill name. |
| Core skill `computer-use`              | `@Computer Use` mention, a catalog pick, or after MCP initialize/`api` told the agent to load it          | When to use these tools vs Browser/API, the inspect → enable → act → verify → disable loop, boundaries, reporting. Not a second copy of the tree or verified contract.                                                                                                                                                         |
| Supporting skill `desktop-app-testing` | Catalog pick or an explicit ask to walk an app through a flow                                             | The test plan: predict, drive, prove, report. Points at the core skill for the tool contract.                                                                                                                                                                                                                                  |

Enabling the plugin in Settings only makes the skills available; it does not
attach the MCP. The `+` menu Computer Use toggle attaches the MCP (and so the
instructions) without inserting the core-skill chip. Built-in tool plugins never
force their server on because the package is installed — the per-thread
composer toggle is the enablement truth.

## Protocol and compatibility

The helper speaks newline-delimited JSON over stdin/stdout. Requests are
`{id, action, input}`; responses are `{id, ok:true, result}` or
`{id, ok:false, error, code}`. Responses can arrive out of order because input
and passive requests use separate lanes, so request ids are the only
correlation. Logs go to stderr.

The protocol version is mirrored by `COMPUTER_USE_HELPER_PROTOCOL_VERSION`
(`src/shared/contracts/computerUse.ts`) and `PROTOCOL_VERSION`
(`native/computer-use-helper/src/protocol/version.rs`). Change both and the
fixture in `native/computer-use-helper/fixtures/` whenever an action input,
result, capability, error, or envelope changes incompatibly. Bump the bundled
computer-use plugin version for every deployed helper behavior change. The
helper version comes from its Cargo package version and is recorded in the
staged manifest so stale binaries are detectable. See also
[Versioned State & Protocols](versioning.md).

Helper actions are defined in
`native/computer-use-helper/src/protocol/actions.rs`. Interactive MCP tools
accept `observe` to return a post-action text tree, screenshot, or both in the
same call. The MCP-only `perform` tool runs a bounded deterministic sequence of
background element, value, key, or text actions against one window and stops on
any refusal, error, or foreground delivery. Both are composed in the host and do
not change the helper wire protocol. `list_apps` without a query returns
running apps with targetable windows; with `query` it also searches installed
apps and returns launchable ids.

## Delivery and refusal contract

- A successful action has `ok:true` and `delivery`: `delivered` is `background`
  or `foreground`; `route` is `accessibility`, `message`, `event`, `input`, or
  `launch`; `verified` is `confirmed`, `unverified`, or `unchanged`. Optional
  `target` and `notes` explain the native route.
- A refused action has `ok:false` and `refused {code, reason, hint}` but is an
  ordinary helper response. Callers must never convert a background refusal into
  foreground input silently.
- Transport errors are reserved for malformed requests, stale windows, timeouts,
  cancellation, protocol mismatch, capture failures, permission failures that
  prevent passive work, and internal failures.
- Native Wayland coordinate and key input require explicit `mode:"foreground"`
  for the consented RemoteDesktop portal; background requests return
  `background_unavailable` before portal setup or focus changes.

Background is the default for click, key, text, scroll, drag, and `launch_app`,
and the only mode an agent may choose on its own; `activate_window` and explicit
`mode:"foreground"` are takeovers. The wording must keep background reachable:

- **A refusal hint names background routes and nothing else.**
  `BACKGROUND_RECOVERY_HINT` and `ELEMENT_SCROLL_HINT` list the semantic route
  and then defer to the user; neither mentions `mode:"foreground"` or
  `activate_window`. Ordering is not enough: once an agent has tried every route
  a hint lists, a takeover left in the text reads as the sanctioned next step.
  The helper's `tests/protocol_roundtrip.rs` locks this. The MCP instructions must state the
  background-only rule before any takeover mention
  (`src/host/computer-use/mcp/instructions.test.ts`), and `toolSpecs.ts`
  documents `mode:"foreground"` as a parameter. `drivers/composite.ts` is the
  one place a recovery message may name `mode:"foreground"` as the only
  remaining route, framed as a degraded state to raise with the user; the
  bundled skills carry the same rule.
- **Never claim a delivery the app dropped.** A background route the target
  ignores must refuse. Reporting `delivered:"background"` for input that
  vanished makes the agent see success, observe no change, and escalate to a
  takeover.

A background `launch_app` does not bring the app forward and reports
`delivered:"background"`, `route:"launch"`; a host that cannot launch without
activating still launches and reports `delivered:"foreground"`. On macOS the
returned window geometry is post-animation, so later element actions do not
report a spurious `element_moved`.

Window resolution is strict wherever `stableWindowIds` is advertised: an id
that no longer exists is `window_unavailable`, not a retarget of the app's
largest window. The one tolerated recovery is a window recreated under the exact
same, unambiguous title; pass the window's `title` to `get_window` to allow it.

## Overlay levels

- `hidden`: no enabled session or active action.
- `badge`: a session or background action is active. The overlay is
  click-through and does not take keyboard focus.
- `takeover`: a foreground action is active. Every display gets the takeover
  border and Escape interrupts the participating thread(s); Escape is suppressed
  while a requested key chord is being sent.

Activity resolves delivery from the requested mode before dispatch. Explicit
foreground operations keep the border and Escape shortcut for the whole
operation. A result that unexpectedly escalates from background to foreground
still emits a foreground safety notification.

## Helper build and quality gates

Toolchain and components are pinned in
`native/computer-use-helper/rust-toolchain.toml`; formatting policy is in
`rustfmt.toml`, lint policy in `Cargo.toml`, dependency/advisory policy in
`deny.toml`.

```bash
pnpm run prepare:computer-use-helper
cd native/computer-use-helper
cargo fmt --all -- --check
cargo clippy --all-targets --all-features --locked -- -D warnings
cargo test --all-features --locked
RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features --locked
cargo deny check
```

The staging script builds the host platform by default. Packaging passes
`--require` and builds all release architectures for that OS; `--check`
validates the staged binary and manifest without rebuilding. Run the platform
matrix in `native/computer-use-helper/README.md` on real macOS and Linux
hardware before claiming those runtime paths are verified.

## Fallback behavior

The composite driver degrades only when the helper binary is missing, cannot
spawn, fails the handshake, or has an incompatible protocol; it warns once.
Runtime action, capture, and permission errors never switch drivers. On Windows
and macOS the legacy driver then serves explicit foreground actions and passive
operations; background calls return `background_unavailable` and element tools
return `capability_unavailable`. Linux has no legacy fallback.

## Platform notes

| Platform             | Background routes                                                                        | Capture                                                                           | Accessibility | Limits                                                                                                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows              | UI Automation (`AutoSetFocus=false`), then window messages; foreground uses `SendInput`  | `PrintWindow`, then Windows Graphics Capture                                      | UI Automation | Modifier chords, elevated targets, and secure desktops are refused in background. Background input to a Chromium window carries `chromium_synthetic_input_may_be_ignored`.                                                                                     |
| macOS                | AX actions, then process-targeted CoreGraphics events; foreground uses the HID event tap | ScreenCaptureKit on current macOS, legacy CoreGraphics on older supported systems | AXUIElement   | Accessibility and Screen Recording need manually granted TCC access; capability checks never open permission prompts. Chromium/Electron coordinate gestures without a semantic AX action are refused in background. See [locked screen](#macos-locked-screen). |
| Linux X11/XWayland   | Core X11 events; foreground uses XTEST                                                   | XComposite when redirected                                                        | AT-SPI        | Decoration coordinates and targets without the needed core-event selections are refused; XI2-only toolkits usually need element tools or foreground input.                                                                                                     |
| Linux native Wayland | AT-SPI semantic actions; foreground coordinate input uses the portal                     | Screenshot portal cropped to AT-SPI bounds                                        | AT-SPI        | Portal permission and a shared monitor are required; raw background coordinate injection is unavailable by design.                                                                                                                                             |

### Browser and Electron windows

A Chromium shell ignores process-targeted mouse events and withholds its web
content from the accessibility tree until an assistive client asks for it.

- **Recognition is structural** (`chromium.rs`): every Chromium distribution and
  every Electron app ships `chrome_crashpad_handler` inside or beside its main
  framework. The bundle read is authoritative and cached per app path. A
  whole-word name list is only a fallback for windows whose bundle cannot be
  read; do not promote it to the primary test, because rebranded forks keep the
  crashpad helper and drop the name.
- **Page exposure:** the snapshot asks the process for its web content
  (`AXManualAccessibility`, `AXEnhancedUserInterface`) before the first walk,
  once per pid, because a Chromium tree is never empty — only its page is. A
  walk that returns a lone node or a childless web area re-asks and re-walks,
  and the page is awaited for up to 750 ms. Truncated walks are left alone, since
  a childless web area there may just be cut. Windows and Linux run the same
  bounded wait through the helper's `src/elements/page.rs` with their own page roles; a page
  that never arrives is cached per process and reported as `page_not_exposed`.
  Electron may first expose no web area at all, so a recognized shell polls up
  to ~2.5 s on the first complete walk.
- **Rate limits:** the web-content request (`WEB_REQUEST_TTL`) and empty-tree
  retry (`RETRY_CONTENT_TTL`) are per-pid with expiry, because macOS reuses
  pids; reading a log never refreshes its stamp. Only the write is rate limited
  — waiting and re-walking has no side effect. The retry is recorded only when
  the ask went through, and only for a childless web area or a recognized
  Chromium shell: `AXEnhancedUserInterface` is a process-wide mode known to
  disturb window geometry, so it is not written into arbitrary apps.
- **Hit tests:** Chromium does not answer AX hit tests (it returns the menu bar
  for every point). `press_at_position` first uses the app's own hit test; only
  for a Chromium shell whose hit test is unusable does it search the window tree
  (`press_candidate`: enabled, on-screen, contains the point, has a press action,
  covers at most a quarter of the frame; deepest wins). Other apps whose hit test
  fails fall through to a real pointer event, which respects z-order. Tree
  presses report `unverified` with note `coordinate_resolved_by_tree` and the
  element in `delivery.target`. Only a single left click takes these routes;
  right/double/middle clicks go to events, and on Chromium are refused with a
  reason naming the check that ran. A right click carries `CONTEXT_MENU_HINT`
  pointing at `invoke_element` action `"context_menu"`.

### Background keyboard focus

A background keystroke goes to the app's focused window, so reaching a different
window means making it that app's focused window, which raises it within the app
(not an app activation; no HID event). The delivery carries
`in_app_focus_changed` when the focused window actually changed;
`window_already_focused` is checked first so repeated typing into the current
window does no focus write. The MCP instructions steer text entry to
`set_element_value` and away from alternating keys between two windows of one
app. Setting `AXFocused` without `AXMain` is not a workaround: keystrokes would
still go to the previously focused window, a silent misdelivery. Linux mirrors
the skip using AT-SPI `Active`/`Focused`.

### Verification

Element actions report only what they can observe:

| Action                | Observed                                 | Verdict                                  |
| --------------------- | ---------------------------------------- | ---------------------------------------- |
| `scroll`              | the scrolled element's origin moves      | `confirmed` / `unchanged`                |
| `toggle`              | the element's value changes              | `confirmed` / `unchanged`                |
| `expand` / `collapse` | `AXExpanded` reaches the requested state | `confirmed` / `unchanged`                |
| `invoke`, `select`    | focus, value, or name changes            | `confirmed` / `unverified`               |
| `context_menu`        | nothing local to watch                   | `unverified`                             |
| `set_element_value`   | the value becomes the requested one      | `confirmed` / `unchanged` / `unverified` |

`unverified` means accepted with nothing observable — read state back instead of
repeating the action, since a second `invoke` fires twice. A `toggle` that
reached a plain button via the `Invoke` fallback reports `unverified`, not
`unchanged`. Every baseline is sampled immediately before the action (including
inside `scroll_into_view`); sampling afterward races synchronous controls. The
observation loop is bounded by `EFFECT_OBSERVE_TIMEOUT` and honors the cancel
token. `scroll` walks up from the requested node to the nearest ancestor that
accepts the request and adds note `scrolled_ancestor` when that differs.

Coordinate `verify:"effect"` compares a 32-point square around the action point
(scaled to backing pixels on macOS), sampled inside the event path immediately
before posting. Do not widen it to the whole window: carets, clocks, and
spinners make a whole-frame hash confirm every dropped action.

Tree text is billed as tokens: `set_value`, `scroll`, and `context_menu` are
treated as ambient and omitted from tree lines (`find_elements` lists advertised
actions; on macOS it includes `scroll`). Nodes ≤ 1 px are printed as `clipped`;
consecutive clipped leaf siblings collapse to a count, with ids kept in the
snapshot. When a web area sits beside browser chrome, the text starts at the
page; Chromium/Electron windows on macOS always prefer the page.

Accessibility trees report asynchronously: Chromium keeps returning pre-action
values for several hundred milliseconds. `OBSERVATION_SETTLE_MS` in
`src/host/computer-use/mcp/dispatch.ts` waits before an `observe` capture, and
the instructions tell the agent to re-read once rather than treat an unchanged
tree as failure. Tests override it via `ToolContext.observationSettleMs`.

MCP action results omit the helper's lane labels (`mode:"interactive"` /
`mode:"passive"`), which testers misread as a foreground hint; the takeover
signal is `delivery.delivered`. A `perform` batch keeps its structural
`mode:"batch"`.

### macOS locked screen

The helper reads the console session via `CGSessionCopyCurrentDictionary()`; it
is locked when `CGSSessionScreenIsLocked` is set or `kCGSessionOnConsoleKey` is
false. `hello` reports `screenLocked`.

A locked Mac is not controllable in practice. Foreground input,
`activate_window`, and foreground `launch_app` are refused with `screen_locked`,
because HID events would land in the password field. Background events are
accepted but unobservable, and macOS strips window content from the
accessibility tree (only an app proxy with the menu bar remains), so
`type_text`/`press_key` refuse with `background_unavailable` and cached element
actions with `stale_snapshot`. Passive results carry a `screen_locked` note.
The correct response is to stop and ask the user to unlock, not to retry.

- Window matching falls back to a unique title (or the app's single AX window
  when no title was requested) when exactly one layer-0 window exists for the
  pid, so actions can report the accurate locked reason instead of
  `window_unavailable`. Any ambiguity stays strict.
- Capture is impossible while locked. The macOS capture path checks
  `screen_locked()` first and returns `capture_failed`. When `get_window_state`
  also asked for text, the dispatcher returns `screenshots: []` plus a
  `capture_failed` note with the tree; a screenshot-only request still errors,
  and cancellation never degrades into a partial observation.
- On an unlocked desktop, a non-timeout ScreenCaptureKit failure retries once
  through legacy CoreGraphics with a `screen_capture_kit_failed` note; only a
  callback timeout marks ScreenCaptureKit unhealthy for the process.

### Keep awake

`ComputerUseWakeLock` holds one `powerSaveBlocker.start("prevent-display-sleep")`
while the activity state is not `hidden`, preventing display-sleep-triggered
locking (screen savers and policies can still lock). It follows the overlay's
`onActivityState`, is disposed on quit, and is gated live by the
`computerUseKeepAwake` setting (default on). `enable` reports `keepAwake: true`
when the blocker is held, so the agent knows it must call `disable` to let the
display sleep.

## Adding or changing an action

1. Add the provider-agnostic tool schema and instructions under
   `src/host/computer-use/mcp/`, then extend `ComputerUseDriver` and its
   helper/composite implementations.
2. Add the wire input/result type and dispatcher branch in the Rust helper. Keep
   OS-specific parsing and behavior inside the relevant backend.
3. Return an accurate delivery or refusal: never claim background delivery for
   a route that can affect the user's foreground device or that the target
   silently drops.
4. Keep background reachable in the wording: refusal hints, tool descriptions,
   and MCP instructions name the semantic recovery before `mode:"foreground"`.
5. Update the protocol constants and fixture if the wire contract changes
   incompatibly, and audit the helper/plugin versions.
6. Add protocol, driver, backend, activity-overlay, and platform integration
   coverage appropriate to the change.
7. Run the TypeScript, Rust, dependency, packaging, and real-platform gates
   above. Localize every renderer-facing string.
