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

The public helper actions are `hello`, `list_apps`, `list_windows`, `get_window`, `get_window_state`, `activate_window`, `click`, `press_key`, `type_text`, `scroll`, `drag`, `launch_app`, `find_elements`, `invoke_element`, and `set_element_value`, plus host-level `cancel` and `shutdown`. Interactive MCP tools accept `observe` to return a post-action text tree, screenshot, or both without another agent round trip. The MCP-only `perform` tool runs a bounded deterministic sequence of background element, value, key, or text actions against one window, stops on any refusal/error/foreground delivery, and rejects portal-prone key/text batches on native Wayland before starting. Both are composed in the main process and do not alter the helper wire protocol.

`list_apps` without a query stays compact and returns running apps with targetable windows. Passing `query` also searches the host's installed-app catalog and returns launchable ids: Windows Start apps, macOS application bundles, or Linux desktop entries.

## Delivery and refusal contract

Coordinate and element actions are transport-successful only when their structured result says so:

- A successful result has `ok:true` and `delivery`. `delivered` is `background` or `foreground`; `route` is `accessibility`, `message`, `event`, or `input`; `verified` is `confirmed`, `unverified`, or `unchanged`. Optional `target` and `notes` explain the actual native route.
- A refused result has `ok:false` and `refused {code, reason, hint}` but is still an ordinary helper response. Callers must not convert a background refusal to foreground input silently.
- Transport errors are reserved for malformed requests, stale windows, timeouts, cancellation, protocol mismatch, capture failures, permission failures that prevent passive work, and internal failures.
- Native Wayland is the documented exception to background delivery: coordinate input uses the consented RemoteDesktop portal, reports `delivered:"foreground"`, and includes `wayland_portal_fallback`.

Background is the default for click, key, text, scroll, and drag. `activate_window`, `launch_app`, and explicit `mode:"foreground"` are takeover operations.

## Overlay levels

- `hidden`: no enabled session or active action.
- `badge`: a computer-use session or background action is active. The overlay is click-through and does not own keyboard focus.
- `takeover`: a foreground action is active. Every display gets the takeover border and Escape interrupts the participating thread(s). Escape is temporarily suppressed while a requested key chord itself is being sent.

Activity resolves delivery before dispatch. Native Wayland AT-SPI windows are classified as foreground before portal input begins, so the takeover border and Escape shortcut remain active for the whole operation. A result that unexpectedly escalates from background to foreground still emits a foreground safety notification.

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

| Platform             | Background routes                                                                                         | Capture                                                                           | Accessibility | Important limits                                                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows              | UI Automation with `AutoSetFocus=false` first, then window messages; explicit foreground uses `SendInput` | `PrintWindow`, then Windows Graphics Capture, then visible-region fallback        | UI Automation | Elevated targets and secure desktops are refused; Chromium-style message input may be refused.                                                                                                                        |
| macOS                | AX actions first, then process-targeted CoreGraphics events; explicit foreground uses the HID event tap   | ScreenCaptureKit on current macOS, legacy CoreGraphics on older supported systems | AXUIElement   | Accessibility and Screen Recording require manually granted TCC access; capability checks never open permission prompts. Chromium/Electron coordinate gestures without a semantic AX action require foreground input. |
| Linux X11/XWayland   | Core X11 events; explicit foreground uses XTEST                                                           | XComposite when redirected, otherwise visible root capture                        | AT-SPI        | Decoration coordinates and targets without the required core-event selections are refused; modern XI2-only toolkits normally require element tools or foreground input.                                               |
| Linux native Wayland | AT-SPI semantic actions; coordinate input uses the foreground portal fallback                             | Screenshot portal cropped to AT-SPI bounds                                        | AT-SPI        | Portal permission and a shared monitor are required; raw background coordinate injection is not available by design.                                                                                                  |

Run the platform matrix in `native/computer-use-helper/README.md` on real macOS and Linux hardware before claiming those runtime paths are verified.

## Adding or changing an action

1. Add the provider-agnostic tool schema and instructions under `src/main/computer-use/mcp/`, then extend `ComputerUseDriver` and its helper/composite implementations.
2. Add the wire input/result type and dispatcher branch in the Rust helper. Keep OS-specific parsing and behavior inside the relevant backend.
3. Return an accurate delivery or refusal; never claim background delivery for an input route that can affect the user's foreground device.
4. Update the protocol constants and fixture if the wire contract is incompatible, and audit the helper/plugin versions under the versioning rules.
5. Add protocol, driver, backend, activity-overlay, and platform integration coverage appropriate to the change.
6. Run the TypeScript, Rust, dependency, packaging, and real-platform gates above. Localize every renderer-facing string in all catalogs.
