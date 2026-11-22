---
name: device-control
description: Use Poracode's built-in Devices tools to open, inspect, and test an iOS Simulator (including the foldable iPhone Duo) or Android Emulator inside the Poracode panel for the current thread.
---

Use Poracode's Devices panel and tools for simulator and emulator work. Never launch the standalone Simulator app, Xcode Device Hub, or a separate emulator window for interactive testing, and never present a simulator you booted outside the panel as panel testing. Shell access to `xcrun simctl` is fine for setup and app lifecycle (create/install/launch), but the device the user sees and the one your tools drive is the one attached to this thread in the panel.

The Devices plugin is enabled by default and can be disabled in Plugins; when it is disabled the tools refuse and say so. Tools are scoped to the current thread's host and attached device — they cannot borrow another thread's session, run shell commands, control the host desktop, or power off a device.

Device operations live under the `devices` domain of the `poracode` MCP gateway — never call them as bare top-level tool names. Discover schemas with `poracode_discover({ domain: "devices" })`, invoke read-only operations (`list_devices`, `screenshot_device`, `inspect_device`) via `poracode_read({ operation, params })`, and invoke mutating operations (`open_device`, `control_device`) via `poracode_run({ operation, params })`.

## Opening a device in the panel

1. Call `poracode_read({ operation: "list_devices" })` to discover this host's iOS Simulators and Android Emulators, their running state, and prerequisites. It does not attach anything.
2. Call `poracode_run({ operation: "open_device", params: { deviceId } })` with a `deviceId` from `list_devices` (add `access: "view"` only when you will not send input; the default is `control`). This attaches the device to this thread and opens it in the user's Poracode panel so you work side by side. A stopped device is started only with `control` access (the default) — `view` does not start it, so use `control` for a stopped device. You do not need to ask the user to pick a device first.
3. If the user already attached a device in the panel, `screenshot_device` / `inspect_device` (via `poracode_read`) and `control_device` (via `poracode_run`) act on that same session — do not open a second one.

## Tools

| Tool                | What it does                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `list_devices`      | Inventory + prerequisites per platform, including iPhone Duo runtime diagnostics. Discovery only.                                |
| `open_device`       | Attach a discovered device for this thread (starts it when stopped and access is `control`); opens it in the panel.              |
| `screenshot_device` | Current pixels of the attached device's active display. Returns an image and a `frameId`.                                        |
| `inspect_device`    | Accessibility hierarchy: iOS idb JSON, Android UIAutomator XML. Completeness depends on the app.                                 |
| `control_device`    | Bounded actions on the attached control-mode device: `start`, `tap`, `swipe`, `text`, `key` (home/back/enter/backspace), `fold`. |

Input rules:

- Before `tap`/`swipe`, capture a fresh screenshot and pass its `frameId` with normalized 0..1 coordinates in image space. After a stale-frame error, rotation, or fold, recapture — old frameIds and coordinates no longer describe the screen.
- Text input accepts printable ASCII on Android; iOS has no Back key.
- Screenshots come from the currently lit display. The inactive display of a two-screen device renders black, so a black frame usually means the other posture/display is active, not a crash.

## iPhone Duo (foldable)

A device with `foldable: true` in `list_devices` is an iPhone Duo simulator: one device with an outer (cover) display and a larger inner display, joined by a hinge.

Prerequisites (all reported by `list_devices` diagnostics):

- A macOS host on Apple silicon with Xcode 27.1 or later.
- The separate iPhone Duo iOS runtime. The Duo does not run on the general iOS runtime other iPhones use. If `foldableRuntimeAvailable` is false, tell the user to install it in Xcode → Settings → Components (about 8 GB). Do not download runtimes yourself.
- Meta `idb` and `idb_companion` for input and accessibility, same as other iOS simulators.

Getting a Duo when none exists (`foldableDeviceExists: false`):

- Preferred: tell the user the Devices panel has a "Create iPhone Duo" action when the runtime is installed.
- Or, with the runtime present, create one from the shell and then `open_device` it: find the Duo-capable runtime identifier with `xcrun simctl list runtimes -j` (the runtime whose `supportedDeviceTypes` includes iPhone Duo — creating against the general runtime fails as incompatible), then `xcrun simctl create "iPhone Duo" com.apple.CoreSimulator.SimDeviceType.iPhone-Duo <runtimeId>`.

Folding with `control_device` (`{kind: "fold", angle}`):

- `angle` is the hinge angle in degrees: `0` closed (outer display, a 466×678 pt phone), `90` half-open, `180` fully open (inner display, 669×951 pt). Other angles are allowed; which display is lit at intermediate angles depends on the direction you came from, so always read the returned `controls.hingeAngle` and `controls.activeDisplay` instead of assuming.
- A fold takes seconds to settle; the tool returns after the device confirms the angle. Afterwards take a fresh screenshot before judging layout or tapping.
- Test every app in at least these poses: closed on the outer display; open in portrait ("book", vertical fold); open in landscape ("laptop", horizontal fold — the unfolded display rotates with the app; there is no separate orientation control for the Duo, so drive landscape with an app or scene that supports it); and half-open. Relaunch the app per pose when you need a clean layout pass, and also fold/unfold mid-session to catch state that only breaks on resize.
- The classic Duo bug is a canvas or layout sized once from a fixed phone size. Size from the view's current bounds (or `GeometryReader`) and re-derive whenever the fold changes — never from `UIScreen.main`.

Adapting an existing app for Duo:

- Offer Apple's own guidance before inventing your own checklist: Xcode 27.1+ ships an App Resizability skill for coding agents. With the user's approval, export/inspect it via `xcrun agent skills export` and follow it rather than paraphrasing it from memory.
- Its recurring findings: sizing from `UIScreen.main` instead of the view, branching layout on `userInterfaceIdiom`, assuming symmetric safe areas, assuming a fixed size-class pair, and app- instead of scene-lifecycle assumptions. Make only fixes the user approves, then verify each one on the Duo in the panel (fold through the poses above).

Duo-specific caveats:

- iOS accessibility frames may keep the outer display's 466×678 pt coordinate space while the device is unfolded. After folding, trust fresh screenshots over `inspect_device` coordinates.
- Display numbers are host details, not an API: never hardcode them; the tools already target the lit display.

## Platform prerequisites and failures

- iOS requires a macOS host with Xcode; input and accessibility additionally require Meta idb and idb_companion (without them the device is view-only). Android requires SDK Emulator/platform-tools and an existing AVD.
- Report missing prerequisites plainly from the `list_devices` platform status and diagnostic. Do not change host security settings, install system components, or stop unrelated devices to work around them.
- Physical phones are not part of this workspace.

## Reporting

Distinguish live video, snapshots, and a static UI fixture. Report actual tool results and errors, the device and posture you tested, and which display was active; never present fixture pixels as a live simulator test.
