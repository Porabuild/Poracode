---
name: computer-use
description: Inspect and operate native Windows, macOS, or Linux applications through Poracode's desktop-control tools. Use for visual workflows that require real windows; prefer Browser for web pages and a purpose-built connector or API when one can complete the task directly.
---

# Computer Use

Use Poracode's `computer_use` MCP for tasks that require interacting with desktop applications or native windows. Do not use it for a web page when Browser or Chrome is the intended surface, or for a semantic operation that a safer purpose-built connector can perform.

## Workflow

1. If the Mac reports a locked screen, call `computer_use.enable` once before inspection so the host can use Locked Computer Use when enabled; if it stays locked, ask the user to unlock. Pick the exact window with `list_apps` or `list_windows` (`list_apps` with `query` searches installed apps to pass to `launch_app`). Call `computer_use.api` only for capability or permission status.
2. Inspect with `get_window_state` (`include_text:true`; `include_screenshot:false` unless you need pixels or coordinates). Prefer `invoke_element` or `set_element_value` over coordinates. Pass `accessibility.snapshotId` as `find_elements.snapshot_id` to filter that tree without rebuilding it; `find_elements` returns `snapshotId` for reuse.
3. Call `computer_use.enable` immediately before the first control action and keep it enabled across uninterrupted related steps.
4. Act, then verify from the window. Prefer `observe:"text"`; use `"screenshot"` or `"both"` for visual checks. Reuse `observation.state` and keep using the window you hold until a result hands you a new one. Continue only after reading `delivery` or `refused`.
5. Use `perform` only for a deterministic background element/value/key/text sequence against one window, with one final observation. After a partial failure, inspect completed steps and current state before continuing; do not replay the whole batch.
6. Use `mode:"foreground"` and `activate_window` only when the user asked for a takeover, and tell them immediately before taking over the real pointer and keyboard. A refusal is never the licence: a `background_unavailable` refusal means follow the hint to `find_elements` plus `invoke_element` or `set_element_value`. If no background route can do the job, stop and ask the user for a takeover instead of taking one.
7. Call `computer_use.disable` before asking the user for input, waiting on an external event, or finishing.

## Tree conventions, scrolling, and verification

- **Omitted default actions**: The tree omits common actions to stay small — `scroll`, `context_menu` and `set_value` on every node, `click` on every node, and `invoke` on button, link and menuitem — so a line with no `actions=` is not inert. `find_elements` reports each node's advertised list (on macOS that includes `scroll` because `invoke` walks ancestors).
- **Webareas & clipped nodes**: When a webarea sits beside browser chrome the text starts at the page and omits that chrome; consecutive clipped siblings collapse to a count. Use `find_elements` by name for a chrome control or hidden row — their ids stay in the snapshot. A node marked `clipped` has no area: `invoke_element` action `"scroll"` to reveal it; do not click it.
- **Scrolling**: On macOS, `invoke_element` action `"scroll"` on the node you want revealed — the host walks up to whatever can actually scroll and notes `scrolled_ancestor` when it was not the node you named (scrolling the container itself reports `verified:"unchanged"`). On Windows and Linux, use a node whose `find_elements` actions list includes `scroll`.
- **Checkboxes, radios, text, keys**: Toggle a checkbox or radio with `invoke_element` action `"toggle"` — `set_element_value` is for text. `type_text` and `press_key` raise an unfocused window inside its app (note `in_app_focus_changed`); prefer `set_element_value`, and never ping-pong keys between two windows of the same app.
- **Browser / Electron windows**: Ignore raw background mouse events. The host resolves a background click against the accessibility tree (`delivery.target`, note `coordinate_resolved_by_tree`) and refuses when nothing pressable sits there and always for right/double/middle click. Recover with `find_elements` + `invoke_element` / `set_element_value`, or use the `browser` MCP server.
- **Async tree lag**: An accessibility tree is the app's asynchronous report: after a background element action a browser can answer with pre-action state for up to half a second. Re-read once; never escalate on it.
- **`delivery.verified`**: Describes what the host could observe, not success/failure. `"confirmed"` means it watched the effect. `"unchanged"` means nothing moved — pick a different element rather than repeating or escalating. `"unverified"` means accepted with nothing local to check (normal for buttons that do not publish state); if a bundled observation already shows the effect, treat that as the check and do not retry, because a second invoke would fire it twice.
- **Coordinates**: Window-frame relative from the latest screenshot; divide by the screenshot's `scale`. Refresh stale windows or snapshots when instructed.

## Boundaries

- Background actions leave the user's foreground window, pointer, and keyboard alone. Foreground actions take over the desktop.
- A locked desktop requires the user, unless Locked Computer Use is on and the host unlocked the Mac for this turn. If an action is still refused with `screen_locked`, or a result carries a `locked_use_` note, stop and ask the user to unlock. The user's Prevent screen lock setting only stops idle locking; never change it yourself.
- Secure prompts, operating-system permission dialogs, passwords, and authentication surfaces require the user.
- Do not type or expose secrets unless the user supplied them for that exact purpose.
- Confirm before destructive changes or external communication unless the user already authorized the exact action.

## Output

Report the application and window used, the verified final state, and any step requiring user interaction. Do not claim completion from input dispatch alone.
