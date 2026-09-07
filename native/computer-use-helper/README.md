# Poracode computer-use helper

This crate is Poracode's bundled native host for background desktop inspection and control on Windows, macOS, and Linux. It communicates only through newline-delimited JSON on stdin/stdout; diagnostics go to stderr.

## Protocol

Start a persistent host with an optional state directory:

```bash
poracode-computer-use --state-dir /path/to/private/app-state
```

Send one request per line:

```json
{ "id": 1, "action": "hello", "input": { "protocolVersion": 1, "clientVersion": "poracode" } }
```

The response is either `{ "id", "ok": true, "result" }` or `{ "id", "ok": false, "error", "code" }`. Responses may be out of order. `cancel` cooperatively cancels an active request; `shutdown` closes the host. Run `poracode-computer-use --hello` for a one-shot capability/permission handshake or `--version` for the helper version.

Interactive results contain either `delivery` or `refused`. Background failures are structured refusals and never silently fall through to foreground input. Native Wayland coordinate and key input require explicit `mode:"foreground"`; background requests are refused before portal setup or focus changes.

`launch_app` takes the same `mode` as the input actions and defaults to `background`. On macOS a background launch uses `open -g`, does not take the user's focus, and reports `delivery {delivered:"background", route:"launch"}`; the returned window frame is polled until it repeats across two 50 ms samples (capped at ~1 s) so it is not a mid-animation frame. Windows and Linux accept `mode` but their launchers always activate, so they report `delivered:"foreground"` rather than refusing.

Window resolution is strict on backends that advertise `stableWindowIds`: an id that is gone returns `window_unavailable` instead of retargeting the app's largest window. A window recreated under the exact same title is the one accepted recovery, and only when the title is unambiguous within that app.

On macOS the handshake reports `screenLocked`, read from `CGSessionCopyCurrentDictionary()` (`CGSSessionScreenIsLocked`, or `kCGSessionOnConsoleKey` false). `mode:"foreground"` input, `activate_window`, and a foreground launch are refused with the `screen_locked` code so HID events cannot reach the lock screen's password field. While the desktop is locked macOS exposes no window content or controls: every capture path returns a blank image, so `get_window_state` reports a `capture_failed` note instead of a screenshot, and the target's accessibility tree collapses to an app proxy exposing only the menu bar. Background coordinate events are still accepted by the OS, but their effect cannot be observed, so a locked Mac is not controllable in practice — passive results carry a `screen_locked` note and the agent should wait for the user to unlock.

`list_apps` returns running targetable apps by default. Its optional `query` searches installed Start apps on Windows, `.app` bundles on macOS, and `.desktop` entries on Linux; returned ids can be passed directly to `launch_app`.

## Build and checks

The repository pins Rust and the standard `rustfmt` and Clippy components in `rust-toolchain.toml`.

```bash
cargo build --locked
cargo fmt --all -- --check
cargo clippy --all-targets --all-features --locked -- -D warnings
cargo test --all-features --locked
RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features --locked
cargo deny check
```

From the repository root, `pnpm run prepare:computer-use-helper` builds and stages the current host binary. Release packaging builds Windows x64/arm64, Linux x64-musl, or a macOS x64+arm64 universal binary and validates its `--hello` response.

## Manual QA matrix

For each row, test window discovery, passive capture while partly and fully occluded, `get_window_state(include_text:true)`, element lookup/action/value changes, background click/text/key/scroll/drag, effect verification, explicit foreground takeover, Escape interruption, window recreation, minimized/refused behavior, and permission-denied behavior. Keep another editor focused and type in it during background steps; its focus, pointer, and keystrokes must remain undisturbed.

| Platform             | Applications / environments                                                                   | Required evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows              | Classic Notepad, Store Notepad, Explorer, a WPF app, a Qt app, VS Code, Chrome, Edge/WebView2 | Log the foreground HWND every 250 ms; background actions must not select the target. Exercise UIA with `AutoSetFocus` disabled, window-message, WGC, and structured-refusal paths.                                                                                                                                                                                                                                                                                                                                                                                           |
| macOS                | Finder, TextEdit, Safari, Chrome, Terminal                                                    | With TCC grants absent, verify the helper reports permission denial without opening a prompt. After granting Poracode access manually, verify AX actions do not raise the window, the active keyboard layout drives shortcuts, ScreenCaptureKit captures an occluded window, and foreground uses the takeover border. Confirm a `mode:"background"` `launch_app` leaves the frontmost app unchanged, and that a locked screen refuses foreground with `screen_locked`, returns no screenshot with a `capture_failed` note, and yields only the app-proxy accessibility tree. |
| Linux X11/XWayland   | GTK3, GTK4, Qt, Electron under a compositing and a non-compositing window manager             | Verify event coordinates, structured refusal when the target has not selected the required core events, XComposite versus `x_root` reporting, AT-SPI trees, and that XTEST is used only for explicit foreground input.                                                                                                                                                                                                                                                                                                                                                       |
| Linux native Wayland | GNOME, KDE, and Sway                                                                          | Verify AT-SPI semantic actions, persisted portal consent, selected-monitor coordinate mapping, Screenshot portal cropping, foreground delivery plus `wayland_portal_fallback`, and a structured refusal when the portal is unavailable.                                                                                                                                                                                                                                                                                                                                      |

Linux X11/XWayland routing is covered in CI under `dbus-run-session` and Xvfb. macOS TCC, native Wayland portals, real XWayland compositor behavior, and application compatibility still require hardware/VM runs; cross-compilation alone is not runtime proof.
