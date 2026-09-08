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
- `native/computer-use-helper/src/backend/macos/` splits the macOS backend by concern: `chromium.rs` owns the single test for whether a window belongs to a Chromium shell (see [Chromium shells](#chromium-shells)), and `ax/` is one module per job — `ax/mod.rs` the AX client FFI, window identity and the public entry points, `ax/snapshot.rs` the batched attribute read and bounded tree walk, `ax/press.rs` turning a coordinate or a request into an acted-on element and observing the result, `ax/webcontent.rs` getting a browser to expose its page and detecting that it has not.
- `src/main/computer-use/ComputerUseActivityTracker.ts` reduces overlapping session/action events to `hidden`, `badge`, or `takeover` overlay state.
- `src/main/computer-use/ComputerUseDesktopOverlay.ts` owns the per-display overlay windows, the scoped Escape shortcut, and the background badge's exit button: the badge window hugs the chip and takes mouse events, and the exit link is intercepted in `setWindowOpenHandler`, so the badge page stays a sandboxed data: URL with no preload.
- `src/main/computer-use/ComputerUseWakeLock.ts` holds a single display-sleep blocker while that state is not `hidden` (see [Keep awake](#keep-awake)).
- `src/shared/contracts/computerUse.ts` is the TypeScript side of the helper compatibility boundary.
- `native/computer-use-helper/` contains the Rust protocol host and the Windows, macOS, and Linux backends.
- `scripts/prepare-computer-use-helper.mjs` builds and stages platform binaries under `resources/computer-use-helper/`.

## Plugin layers

The bundled `computer-use` package has three agent-facing surfaces. They are not loaded together except on an `@Computer Use` mention.

| Surface                                | When the agent sees it                                                                                                        | What belongs there                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP instructions + tool schemas        | Every thread that has the `computer_use` server attached (composer toggle, mention, or a provider that always-on attaches it) | The result contract: background-only before takeover, how to read `delivery` / `refused` / `verified`, tree conventions, browser recovery, scroll platform split, enable/disable, locked screen. Names the plugin `coreSkill` and tells the agent to load it before the first control action. The contract must still work if the agent does not. `api` returns that same skill name. |
| Core skill `computer-use`              | `@Computer Use` mention (slash-command chip + MCP on), a catalog pick, or after MCP initialize/api told the agent to load it  | When to use these tools vs Browser/API, the inspect → enable → act → verify → disable loop, boundaries, and how to report. Not a second copy of the tree or verified contract.                                                                                                                                                                                                        |
| Supporting skill `desktop-app-testing` | Catalog pick or an explicit ask to walk an app through a flow                                                                 | The test plan: predict, drive, prove, report. Points at the core skill for the tool contract.                                                                                                                                                                                                                                                                                         |

Enabling the plugin in Settings only makes those skills available and does **not** attach the MCP. The `+` menu Computer Use toggle attaches the MCP (and therefore the instructions) without inserting the core-skill chip; the instructions tell the agent to load that skill by name. Built-in tool plugins never force their server on just because the package is installed — the per-thread composer toggle stays the enablement truth.

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

Background is not just the default, it is the only mode the agent may choose for itself, so the guidance has to keep it reachable. Two rules follow from that:

- **A refusal names background routes and nothing else.** `Refusal::BACKGROUND_RECOVERY_HINT` and `ELEMENT_SCROLL_HINT` list the semantic route and then defer to the user; neither mentions `mode:"foreground"` or `activate_window`. That is stronger than ordering them: a blind evaluation showed that once an agent had tried every route a hint listed, the takeover was the only unused string left in it, and that read as the sanctioned next step. `tests/protocol_roundtrip.rs` locks the absence inside the helper's hints. The MCP layer enforces the weaker ordering rule that `src/main/computer-use/mcp/instructions.test.ts` locks — the background-only rule must appear before any takeover mention, because the instructions must still describe takeovers to bound them — and the tool descriptions in `toolSpecs.ts` name `mode:"foreground"` as a documented parameter. `drivers/composite.ts` is the one place a recovery message may still name `mode:"foreground"` as the only remaining route, stated there as a degraded state to raise with the user, and the bundled skills under `resources/plugins/computer-use/skills/` carry the same rule.
- **Never claim a delivery the app dropped.** A background route that the target ignores must refuse. Reporting `delivered:"background"` for input that vanished is worse than refusing: the agent sees success, sees no change, and escalates to `activate_window` plus foreground input to make progress.

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

| Platform             | Background routes                                                                                         | Capture                                                                           | Accessibility | Important limits                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows              | UI Automation with `AutoSetFocus=false` first, then window messages; explicit foreground uses `SendInput` | `PrintWindow`, then Windows Graphics Capture; otherwise capture failure           | UI Automation | Modifier-key chords, elevated targets, and secure desktops are refused in background; some UI hosts require semantic actions. Background input to a Chromium class chain carries `chromium_synthetic_input_may_be_ignored`; a snapshot whose page container is still empty waits up to 750 ms for the page and notes `page_not_exposed` when it never arrives.                                                                                                                   |
| macOS                | AX actions first, then process-targeted CoreGraphics events; explicit foreground uses the HID event tap   | ScreenCaptureKit on current macOS, legacy CoreGraphics on older supported systems | AXUIElement   | Accessibility and Screen Recording require manually granted TCC access; capability checks never open permission prompts. Chromium/Electron coordinate gestures without a semantic AX action are refused in background (see [Chromium shells](#chromium-shells)). While the screen is locked, foreground is refused, window capture is blank, and macOS reduces the window's accessibility tree to an app proxy with only the menu bar; control must wait for the user to unlock. |
| Linux X11/XWayland   | Core X11 events; explicit foreground uses XTEST                                                           | XComposite when redirected; otherwise capture failure                             | AT-SPI        | Decoration coordinates and targets without the required core-event selections are refused; modern XI2-only toolkits normally require element tools or foreground input. An AT-SPI focus request is skipped when the window is already active, so no `in_app_focus_changed` note is reported; a snapshot whose page container is still empty waits up to 750 ms for the page and notes `page_not_exposed` when it never arrives.                                                  |
| Linux native Wayland | AT-SPI semantic actions; explicit foreground coordinate input uses the portal                             | Screenshot portal cropped to AT-SPI bounds                                        | AT-SPI        | Portal permission and a shared monitor are required; raw background coordinate injection is not available by design.                                                                                                                                                                                                                                                                                                                                                             |

### Chromium shells

A Chromium shell differs from an ordinary Cocoa app in two ways that decide whether background control is possible at all: it ignores process-targeted CoreGraphics mouse events, and it withholds its web content from the accessibility tree until an assistive client asks for it. `src/backend/macos/chromium.rs` owns the test and both the snapshot and input paths use it.

Recognition is structural, not a list of browser names. Every Chromium distribution — Chrome, Brave, Edge, Vivaldi, Opera, Arc, any rebranded fork — and every Electron app ships the crashpad helper inside or beside its main framework, because it comes from the Chromium build rather than from the vendor:

```text
Brave Browser.app/Contents/Frameworks/Brave Browser Framework.framework/Helpers/chrome_crashpad_handler
Poracode.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler
```

The bundle is read once per application path and cached, and the read is authoritative: a bundle this host could inspect has already answered the question, so the name list below is consulted only when there is no bundle to read. Treating it as an extra vote misclassifies an ordinary app whose name splits into a browser word (`Arc Welder.app`). A name list is the fallback for a window whose bundle cannot be read, because `WindowInfo::app` degrades to an executable path or the CoreGraphics owner name; it matches whole words so `Arc` is recognized and `Monarch` is not. Do not turn the fallback into the primary test — a rebranded fork keeps the crashpad helper and drops the name, which is exactly the case that used to break.

`build_snapshot` asks the process for its web content (`AXManualAccessibility` and `AXEnhancedUserInterface`) **before** the first walk, once per pid. Waiting for an empty tree does not work: a Chromium window always describes its own browser chrome, so the tree is never empty, only its page is. After the walk, `content_missing` re-asks and re-walks when the tree is a lone node or holds a web area with no children — a shell this host failed to recognize, or a walk that raced a page still being built — and `await_web_content` polls the web area for up to 750 ms because Chromium answers the request asynchronously through the renderer. A walk that was truncated is left alone entirely: it is breadth-first and its results are sorted into pre-order, so truncation drops a frontier whose members land scattered through the list rather than at its end, and a childless web area in a truncated tree may simply be one whose children were cut.

Windows and Linux run the same wait through the shared `elements/page.rs`, without the macOS-only activation write: each backend supplies its own page roles (UIA `document`; AT-SPI canonical `documentweb`/`documentframe`), a walk that comes back with a lone node or a childless page container is repeated on the same 750 ms budget, a page that never arrives is recorded per process for 10 s, and while the tree stays empty the snapshot reports the note `page_not_exposed`. The structural predicate is deliberately a property of the tree, so a browser this host does not recognize recovers the same way a recognized one does — at the cost of one bounded wait per interval for an app that genuinely has no accessibility content.

Electron can initially expose only native window groups, with no `webarea` at all. Electron 44 debounces platform accessibility activation for two seconds. For a recognized Chromium shell, the first complete walk without a web area therefore polls the resolved window for up to 2.5 seconds without resending the activation write. Populated and truncated trees skip this wait; a window that still has no page is rate limited by the existing 10-second absent-page cache. On the macOS dev app, a cold read returned the full tree in 2.13 seconds and the next 19 reads took 30–75 ms.

Without the request, a browser page exposes a childless `webarea` and nothing inside it is addressable, which leaves coordinates as the only route — and Chromium drops background coordinate input. With it, page content arrives with `invoke`, `toggle`, and `set_value` actions that work without focusing or raising the window.

The request is per process and remembered for `WEB_REQUEST_TTL` (60 s); the empty-tree retry is remembered separately for `RETRY_CONTENT_TTL` (2 s). Both logs are keyed by pid and macOS reuses pids, so the expiry is what stops a browser that restarts into a familiar pid from being treated as already handled — and reading a log never refreshes its stamp, or the expiry would slide forever for a window being polled. The retry's expiry is short on purpose: the passive and input lanes run concurrently, so a click that spends the retry while a page is still building must not leave the `find_elements` call the agent makes next with nothing to find and no way to ask again. Only the _write_ is rate limited — waiting for a page and walking again has no side effect on the app, so a caller that arrives while another lane is mid-retry still gets the page rather than the empty tree the record would otherwise hand it. A retry is recorded only once the ask actually went through, and only when the tree holds a web area with no children or the window belongs to a recognized Chromium shell — `AXEnhancedUserInterface` is a process-wide accessibility mode known to disturb window geometry in some hosts, so a window that merely reports no children (which is every window while the console is locked) does not justify writing it into an arbitrary third-party app.

**Chromium does not answer accessibility hit tests.** Measured on Brave 152: `AXUIElementCopyElementAtPosition` returns the application menu bar for _every_ point in the window — tab strip, toolbar, and page alike. `press_at_position` therefore has two routes, in this order. First the **app's own hit test**, which is the whole answer for an ordinary Cocoa app: it knows the z-order, so it names the control the user would have hit, and if that control exposes no press action then the point is not on a control and the call returns without building anything. Second the **window's tree** (`press_candidate`), only for a Chromium shell whose hit test is unusable — the call failed, or the element it named belongs to another window. Any other app whose hit test fails falls through to a real pointer event, which sees z-order; the tree cannot, and would otherwise press a control sitting behind a sheet. The tree route is further guarded: a candidate must be enabled, on-screen, have area, contain the point, expose a press action, and cover no more than a quarter of the window frame, because a pane-sized candidate means the point landed on dead space rather than on a control. The deepest candidate wins, with area breaking ties. Neither route reports `verified:"confirmed"`: a press is a semantic action whose visible result is often nowhere near the coordinate, and the only honest baseline would have to be sampled inside the press itself, after a walk that can spend 750 ms waiting for a page — so these deliveries are `unverified`, meaning accepted with nothing observable from here. Their results carry the note `coordinate_resolved_by_tree` and name the element in `delivery.target`, because the press went to a specific control rather than to whatever a pointer event would have hit — including in a window that is fully occluded, which a real click could not reach. Only a single left click takes either route: a press carries no button or repeat count, so a right, double, or middle click goes straight to events instead of being quietly downgraded to a left press. On a Chromium window that means those gestures are refused, and the refusal says which check actually ran — claiming "no element was found under this coordinate" for a gesture that never consulted either route would be a finding the call never made. A right click carries `Refusal::CONTEXT_MENU_HINT` — `invoke_element` with action `"context_menu"` is the background route for a menu, and a hint that pointed at the generic press route instead would be a dead end.

### Background keyboard raises the target window inside its app

A background keystroke is posted to the process, and the process routes it to whatever window it has focused. Reaching a different window means making the target the app's focused window, and macOS raises it within that app when that happens — measured with two overlapping Brave windows, the target moved in front of its sibling. It is not an app activation: the frontmost app keeps the user's focus, and no HID event is posted. But it does reorder that app's windows, so:

- The delivery carries the note `in_app_focus_changed` whenever the app's focused window actually changed.
- `ax::window_already_focused` is checked first, so typing repeatedly into the window an app is already on performs no focus write at all (measured 4 ms against 38 ms for the focus-changing path).
- The MCP instructions steer text entry to `set_element_value`, which needs no focus, and tell the agent not to alternate keys between two windows of the same app.

`AXFocused` alone is not a way around this. Setting it without `AXMain` leaves `AXFocusedWindow` unchanged, so the keystrokes would still go to the app's previously focused window — a silent misdelivery, which is worse than a visible raise. Linux mirrors the skip: `focus_window` reads AT-SPI's `Active`/`Focused` state first, and a window that is already active gets no focus write and no `in_app_focus_changed` note.

### Element actions verify what they can observe

`invoke_element` reported `verified:"confirmed"` unconditionally, which certified no-ops: `AXScrollToVisible` on a scroll container returns success and moves nothing, and three independent blind evaluations each spent five to eight calls on that before nearly concluding that only a takeover was left. What each action can honestly claim:

| Action                | Observed                                 | Verdict                                  |
| --------------------- | ---------------------------------------- | ---------------------------------------- |
| `scroll`              | the scrolled element's origin moves      | `confirmed` / `unchanged`                |
| `toggle`              | the element's value changes              | `confirmed` / `unchanged`                |
| `expand` / `collapse` | `AXExpanded` reaches the requested state | `confirmed` / `unchanged`                |
| `invoke`, `select`    | focus, value, or name changes            | `confirmed` / `unverified`               |
| `context_menu`        | nothing local to watch                   | `unverified`                             |
| `set_element_value`   | the value becomes the requested one      | `confirmed` / `unchanged` / `unverified` |

`unverified` means accepted with nothing observable — read the state back rather than repeating the action, because a second `invoke` fires it twice. If a bundled `observe:"text"` already shows the effect, that read is the check. A `toggle` that reached a plain button through the `Invoke` fallback reports `unverified` for the same reason: it pressed something real, and calling that `unchanged` would send the agent looking elsewhere. `invoke` / `select` spend `confirmed` only when focus, value, or name actually changed; no local change stays `unverified`, never `unchanged`.

Every baseline is sampled **before** the action, including the one inside `scroll_into_view`, which reads the candidate's origin immediately before asking it to scroll. Reading it afterwards is a race that only looks correct against a slow accessibility server: a native control that flips synchronously would be compared against its own post-action state and reported `unchanged`. The observation loop is bounded by `EFFECT_OBSERVE_TIMEOUT` and checks the request's cancel token, because a batch queues one of these per step and each one holds the input lane.

`scroll` also resolves its own target. `AXScrollToVisible` sits on a row's anonymous wrapper rather than on the text leaf an agent can search for, and refusing on the leaf is what sent every evaluation hunting for a container that cannot scroll. `scroll_into_view` walks up from the requested node — bounded, staying inside the window — until something accepts the request; the ancestor that scrolls contains the target, so revealing it reveals the target. The result adds the note `scrolled_ancestor` when the element that moved was not the one named, and the action is exempt from the "element must advertise this action" gate for the same reason.

Tree text is billed as tokens. Chromium hangs `set_value` on groups, toolbars, and buttons that cannot take a value, so the renderer treats `set_value` as ambient the same way it treats `scroll` and `context_menu`: omitted from the line, and ignored when deciding whether an anonymous wrapper can collapse. `find_elements` lists advertised actions; on macOS the result also includes `scroll`, because `invoke_element` walks ancestors even when AX omitted it. A node with width or height ≤ 1 is printed as `clipped` instead of with clip-edge bounds, because those bounds are not a click target. Consecutive clipped leaf siblings collapse to a count (`... 52 clipped text siblings`); their ids stay in the snapshot. When a `webarea` or `document` sits beside browser chrome (`toolbar` / `tablist` / `menubar`, including chrome wrapped in groups), the text starts at the page and omits that chrome. Chromium/Electron windows on macOS always prefer the page, even when chrome is anonymous groups with no toolbar role. Use `find_elements` by name for a chrome control or a hidden row.

### Accessibility trees report asynchronously

An accessibility tree is the app's own report, not a live read of its state. Measured on Brave: `invoke_element` returns in 2 ms while `find_elements` keeps answering with the pre-action values for another 350-460 ms, and two consecutive read-backs can each show the previous state.

An agent that reads straight back sees "nothing happened" after an action that worked, concludes background control is broken, and escalates to a takeover. `OBSERVATION_SETTLE_MS` in `src/main/computer-use/mcp/dispatch.ts` therefore waits 500 ms before an `observe` capture — the measured Chromium lag is 350-460 ms, and 400 ms sat inside that range. The MCP instructions tell the agent to re-read once rather than treat an unchanged tree as failure. The wait is only paid when the caller asked for an observation, where it replaces a whole round trip; `ToolContext.observationSettleMs` (and the matching ingress option) exists so tests do not sit through it.

MCP action results omit the helper's `mode:"interactive"` / window-state `mode:"passive"` lane labels. Testers read `interactive` as a foreground hint next to `mode:"foreground"`. The takeover signal is `delivery.delivered`. A perform batch keeps its top-level `mode:"batch"` — a structural marker for its per-step result shape, not a lane label. The helper wire is unchanged.

### macOS effect verification

`verify:"effect"` compares a 32-point square around the action point before and after the action, on all three platforms. macOS scales the point into backing pixels first, because its capture is Retina while the action point is in window points.

It runs inside the event path (`input::pointer`), not around it. The baseline has to be sampled immediately before the events are posted: the accessibility route ahead of it can spend a tree walk and up to 750 ms waiting for a browser to publish a page, and a baseline taken before all that straddles a caret blink and confirms input that was dropped. It is confined to that path for a second reason — an element action's visible result is often nowhere near the coordinate, so a region compare would report `unchanged` for a press that worked. Element actions verify themselves instead.

Do not widen this back to the whole window frame. A window is full of pixels that change on their own — a blinking text caret, a clock, a spinner, a video — so a whole-frame hash reports every dropped action as `verified:"confirmed"`, and an agent that cannot distinguish delivery from silence escalates to a takeover to make progress.

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
3. Return an accurate delivery or refusal; never claim background delivery for an input route that can affect the user's foreground device, and never claim it for a route the target silently drops.
4. Keep the background path reachable in the wording: a refusal hint, a tool description, and the MCP instructions all name the semantic recovery before they name `mode:"foreground"`.
5. Update the protocol constants and fixture if the wire contract is incompatible, and audit the helper/plugin versions under the versioning rules.
6. Add protocol, driver, backend, activity-overlay, and platform integration coverage appropriate to the change.
7. Run the TypeScript, Rust, dependency, packaging, and real-platform gates above. Localize every renderer-facing string in all catalogs.
