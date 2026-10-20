---
name: device-control
description: Use Poracode's built-in Devices tools to inspect and test an iOS Simulator or Android Emulator attached to the current thread.
---

Use `list_devices` to discover devices on this thread's host and check prerequisites. Use the built-in Devices panel and tools for simulator work rather than starting a separate emulator viewer.

The Devices plugin is enabled by default and can be disabled in Plugins. There is no additional agent-consent prompt. Tools use the current thread's attached device and its view/control mode; they cannot borrow another thread's session. If nothing is attached, ask the user to select a device in this thread's Devices panel. Do not claim that discovering a device opens or starts it.

Use `screenshot_device` for current pixels and `inspect_device` for accessibility. Before `control_device` tap/swipe input, capture a fresh screenshot and pass its `frameId` with normalized 0..1 coordinates. Recapture after a stale-frame or rotation error. Text input accepts printable ASCII on Android; iOS has no Back key. `control_device` can start the attached device or send bounded input; it does not run shell commands, control the host desktop, or power off a device.

iOS requires a macOS host with Xcode; input and accessibility additionally require Meta idb and idb_companion. Android requires SDK Emulator/platform-tools and an existing AVD. Report missing prerequisites without changing host security settings or stopping unrelated devices.

Distinguish live video, snapshots, and a static UI fixture. Report actual tool results and errors; never present fixture pixels as a live simulator test.
