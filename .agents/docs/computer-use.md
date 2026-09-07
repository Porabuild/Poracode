# Computer Use

Poracode's built-in `computer_use` MCP server is owned by the Electron main process. A bundled Rust helper performs native window discovery, passive capture, accessibility queries, and input. The renderer only enables the capability for a thread and displays status; it never starts native automation processes.

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

- `src/main/computer-use/ComputerUseMcpIngress.ts` owns authentication, enabled-thread scope, dispatch, and activity events.
- `src/main/computer-use/mcp/` owns tool schemas, argument normalization, result formatting, and agent instructions.
- `src/main/computer-use/drivers/` owns the helper host, compatibility handshake, binary lookup, and tightly limited legacy fallback.
- `src/main/computer-use/ComputerUseActivityTracker.ts` reduces overlapping session/action events to `hidden`, `badge`, or `takeover` overlay state.
- `src/main/computer-use/ComputerUseDesktopOverlay.ts` owns the per-display overlay windows and scoped Escape shortcut.
- `src/main/computer-use/ComputerUseWakeLock.ts` holds a single display-sleep blocker while that state is not `hidden` (see [Keep awake](#keep-awake)).
- `src/shared/contracts/computerUse.ts` is the TypeScript side of the helper compatibility boundary.
- `native/computer-use-helper/` contains the Rust protocol host and the Windows, macOS, and Linux backends.
- `scripts/prepare-computer-use-helper.mjs` builds and stages platform binaries under `resources/computer-use-helper/`.

Main-process startup supplies the helper root and a persistent state directory. Packaged apps use `process.resourcesPath/computer-use-helper`; `pnpm dev` stages a Cargo development build under `resources/computer-use-helper-dev`. Explicit preparation and packaging keep release builds under `resources/computer-use-helper`. Linux portal restore data is stored under the app's computer-use state directory, not in the repository.

## Protocol and compatibility

The helper uses newline-delimited JSON over stdin/stdout. Each request is `{id, action, input}`. Each response is either `{id, ok:true, result}` or `{id, ok:false, error, code}`. Responses may arrive out of order because input and passive requests use separate lanes; request ids are the only correlation mechanism. Logs belong on stderr.

The protocol version is mirrored by:

- `COMPUTER_USE_HELPER_PROTOCOL_VERSION` in `src/shared/contracts/computerUse.ts`
- `PROTOCOL_VERSION` in `native/computer-use-helper/src/protocol/version.rs`

Change both constants and the protocol fixture whenever an action input, result, capability, error, or envelope changes incompatibly. Bump the bundled computer-use plugin version for every deployed helper behavior change. The helper version comes from its Cargo package version and is recorded in the staged manifest so stale binaries are detectable.

The public helper actions are `hello`, `list_apps`, `list_windows`, `get_window`, `get_window_state`, `activate_window`, `click`, `press_key`, `type_text`, `scroll`, `drag`, `launch_app`, `find_elements`, `invoke_element`, and `set_element_value`, plus host-level `cancel` and `shutdown`. Interactive MCP tools accept `observe` to return a post-action text tree, screenshot, or both without another agent round trip. The MCP-only `perform` tool runs a bounded deterministic sequence of background element, value, key, or text actions against one window, stops on any refusal/error/foreground delivery. Both are composed in the main process and do not alter the helper wire protocol.

`list_apps` without a query stays compact and returns running apps with targetable windows. Passing `query` also searches the host's installed-app catalog and returns launchable ids: Windows Start apps, macOS application bundles, or Linux desktop entries.

## Delivery and refusal contract

Coordinate and element actions are transport-successful only when their structured result says so:

- A successful result has `ok:true` and `delivery`. `delivered` is `background` or `foreground`; `route` is `accessibility`, `message`, `event`, or `input`; `verified` is `confirmed`, `unverified`, or `unchanged`. Optional `target` and `notes` explain the actual native route.
- A refused result has `ok:false` and `refused {code, reason, hint}` but is still an ordinary helper response. Callers must not convert a background refusal to foreground input silently.
- Transport errors are reserved for malformed requests, stale windows, timeouts, cancellation, protocol mismatch, capture failures, permission failures that prevent passive work, and internal failures.
- Native Wayland coordinate and key input require explicit `mode:"foreground"` for the consented RemoteDesktop portal. Background requests return `background_unavailable` before portal setup or focus changes.

Background is the default for click, key, text, scroll, drag, and `launch_app`. `activate_window` and explicit `mode:"foreground"` are takeover operations.

`launch_app` takes the same `mode` as the input tools. A background launch does not bring the app forward and reports `delivery {delivered:"background", route:"launch"}`, so activity shows the badge instead of the takeover border. A host that cannot launch without activating still launches and reports `delivered:"foreground"` rather than refusing. macOS waits for the new window's frame to repeat across two 50 ms polls (capped at ~1 s) before returning it, so the returned geometry is post-animation and later element actions do not report a spurious `element_moved`.

Window resolution is strict wherever `stableWindowIds` is advertised: an id that no longer exists is a `window_unavailable` error, not a silent retarget of the app's largest window. The single tolerated recovery is a window the app recreated under the exact same title, and only when that title is unambiguous within the app. Pass the window's `title` to `get_window` to make that recovery reachable.

## Overlay levels

- `hidden`: no enabled session or active action.
- `badge`: a computer-use session or background action is active. The overlay is click-through and does not own keyboard focus.
- `takeover`: a foreground action is active. Every display gets the takeover border and Escape interrupts the participating thread(s). Escape is temporarily suppressed while a requested key chord itself is being sent.

Activity resolves delivery from the requested mode before dispatch. Explicit foreground operations keep the takeover border and Escape shortcut active for the whole operation. A result that unexpectedly escalates from background to foreground still emits a foreground safety notification.

## Helper build and quality gates

The Rust toolchain, formatter, and linter components are pinned in `native/computer-use-helper/rust-toolchain.toml`; formatting policy is in `rustfmt.toml`, lint policy is in `Cargo.toml`, and dependency/advisory policy is in `deny.toml`.

```bash
pnpm run prepare:computer-use-helper
cd native/computer-use-helper
cargo fmt --all -- --check
cargo clippy --all-targets --all-features --locked -- -D warnings
cargo test --all-features --locked
RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features --locked
cargo deny check
```

The staging script builds the host platform by default. Packaging passes `--require` and builds all release architectures for that operating system. `--check` validates the staged binary and manifest without rebuilding.

## Fallback behavior

The composite driver degrades only when the helper binary is missing, cannot spawn, has an invalid handshake, or has an incompatible protocol. It warns once. Runtime action, capture, and permission errors never switch drivers.

On Windows and macOS, the legacy driver remains available for explicit foreground actions and passive operations after startup degradation. Background calls return `background_unavailable`, and element tools return `capability_unavailable`. Linux has no legacy fallback and reports the helper as unavailable.

## Platform notes

| Platform             | Background routes                                                                                         | Capture                                                                           | Accessibility | Important limits                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows              | UI Automation with `AutoSetFocus=false` first, then window messages; explicit foreground uses `SendInput` | `PrintWindow`, then Windows Graphics Capture; otherwise capture failure           | UI Automation | Modifier-key chords, elevated targets, and secure desktops are refused in background; some UI hosts require semantic actions.                                                                                                                                                                                                                                                                                                         |
| macOS                | AX actions first, then process-targeted CoreGraphics events; explicit foreground uses the HID event tap   | ScreenCaptureKit on current macOS, legacy CoreGraphics on older supported systems | AXUIElement   | Accessibility and Screen Recording require manually granted TCC access; capability checks never open permission prompts. Chromium/Electron coordinate gestures without a semantic AX action require foreground input. While the screen is locked, foreground is refused, window capture is blank, and macOS reduces the window's accessibility tree to an app proxy with only the menu bar; control must wait for the user to unlock. |
| Linux X11/XWayland   | Core X11 events; explicit foreground uses XTEST                                                           | XComposite when redirected; otherwise capture failure                             | AT-SPI        | Decoration coordinates and targets without the required core-event selections are refused; modern XI2-only toolkits normally require element tools or foreground input.                                                                                                                                                                                                                                                               |
| Linux native Wayland | AT-SPI semantic actions; explicit foreground coordinate input uses the portal                             | Screenshot portal cropped to AT-SPI bounds                                        | AT-SPI        | Portal permission and a shared monitor are required; raw background coordinate injection is not available by design.                                                                                                                                                                                                                                                                                                                  |

### macOS locked screen

The helper reads the console session through `CGSessionCopyCurrentDictionary()`. The session counts as locked when `CGSSessionScreenIsLocked` is set or when `kCGSessionOnConsoleKey` is false (fast user switching or the login window). `hello` reports it as `screenLocked`.

While locked, background routes still target the process and never reach the lock screen, so the OS accepts them — but nothing can observe whether they worked. Foreground is refused with the `screen_locked` code — `mode:"foreground"` input, `activate_window`, and a foreground `launch_app` — because HID events posted to the session would be typed into the password field. Passive `get_window_state` results and background delivery notes carry a `screen_locked` note. **The correct response to a locked macOS desktop is to stop and ask the user to unlock it, not to retry.**

**macOS strips window content from the accessibility tree while locked.** Measured on macOS 25.6 with Calculator and Mail: `AXWindows` still returns one element, but that element reports `AXRole = AXApplication`, recurses into itself, and exposes only the shared menu bar. The window's own controls are gone, `AXFocused` cannot be set (so `type_text` and `press_key` refuse with `background_unavailable`), and `AXWindow` on a cached element no longer matches the target window (so `invoke_element` refuses with `stale_snapshot`). Background coordinate events are still accepted by the OS, but their effect cannot be observed, so a locked Mac is not controllable in practice.

**Window matching falls back to a unique title.** A locked console makes `_AXUIElementGetWindow` return `kAXErrorFailure` and reports every AX window at `(0, 0)`, so neither the window-id nor the title-plus-bounds branch of `same_window` can identify a target. `find_window` therefore has a last resort: when exactly one of the app's AX windows carries the requested title — or the app exposes exactly one AX window and the request carried no title — **and** the window server lists exactly one layer-0 window for that pid, that window is accepted. Any ambiguity keeps resolution strict and still returns `window_unavailable`. Without this, every AX-backed action on a locked Mac fails with `window_unavailable` before it can even report the more accurate reason above.

**Capture is impossible while locked, and `get_window_state` degrades instead of failing.** macOS does not render window content behind the login window: ScreenCaptureKit fails immediately with "Failed to start stream due to audio/video capture failure" and `CGWindowListCreateImage` returns a fully blank image. The macOS capture path checks `screen_locked()` first and returns a `capture_failed` error explaining the desktop is locked and recommending `include_text`, rather than spending ~150 ms proving it and reporting a misleading audio/video reason. When `get_window_state` was asked for text as well, the dispatcher turns a `capture_failed` or `permission_denied` capture into `screenshots: []` plus a `capture_failed: <message>` note and still returns the accessibility tree; a screenshot-only request still errors, and cancellation never degrades into a partial observation. The degraded result is a diagnostic, not a workaround: while locked the returned tree carries no window content either.

### Keep awake

Because a locked desktop is uncontrollable and unobservable, the only practical way to let an agent work unattended is to stop the idle lock from happening. `ComputerUseWakeLock` (`src/main/computer-use/ComputerUseWakeLock.ts`) holds a single Electron `powerSaveBlocker.start("prevent-display-sleep")` — the IOKit `PreventUserIdleDisplaySleep` assertion, which also holds off the idle screensaver and the lock that follows it — for as long as the reduced activity state is not `hidden`. Main wires it to `ComputerUseDesktopOverlay`'s `onActivityState`, so it engages with the badge and releases with it, and disposes it on quit. The `computerUseKeepAwake` shared setting (default `true`) gates it live: turning it off releases a held blocker immediately. Manual locking is unaffected, and `enable` reports `keepAwake: true` when the blocker is held so the agent knows the session will not be cut short — and that it must call `disable` to let the display sleep again. The mechanism is platform-agnostic; only the motivation is macOS-specific.

For non-timeout ScreenCaptureKit failures on an unlocked desktop, the helper tries the legacy CoreGraphics path once and adds a `screen_capture_kit_failed: <message>` note without retiring ScreenCaptureKit; only a callback timeout marks it unhealthy for the rest of the process.

Run the platform matrix in `native/computer-use-helper/README.md` on real macOS and Linux hardware before claiming those runtime paths are verified.

## Adding or changing an action

1. Add the provider-agnostic tool schema and instructions under `src/main/computer-use/mcp/`, then extend `ComputerUseDriver` and its helper/composite implementations.
2. Add the wire input/result type and dispatcher branch in the Rust helper. Keep OS-specific parsing and behavior inside the relevant backend.
3. Return an accurate delivery or refusal; never claim background delivery for an input route that can affect the user's foreground device.
4. Update the protocol constants and fixture if the wire contract is incompatible, and audit the helper/plugin versions under the versioning rules.
5. Add protocol, driver, backend, activity-overlay, and platform integration coverage appropriate to the change.
6. Run the TypeScript, Rust, dependency, packaging, and real-platform gates above. Localize every renderer-facing string in all catalogs.
