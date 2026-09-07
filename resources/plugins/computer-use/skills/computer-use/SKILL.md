---
name: computer-use
description: Inspect and operate native Windows, macOS, or Linux applications through Poracode's desktop-control tools. Use for visual workflows that require real windows; prefer Browser for web pages and a purpose-built connector or API when one can complete the task directly.
---

# Computer Use

Use Poracode's `computer_use` MCP for tasks that require interacting with desktop applications or native windows. Do not use it for a web page when Browser or Chrome is the intended surface, or for a semantic operation that a safer purpose-built connector can perform.

## Workflow

1. Use `list_apps` or `list_windows` to select the exact target. Call `computer_use.api` only when you need capability or permission status. If the app is not running, call `list_apps` with `query` and pass the returned app id to `launch_app`.
2. Call `get_window_state` with `include_text:true`. For semantic tasks, also pass `include_screenshot:false` to skip image capture and encoding; request a screenshot when you need visual evidence or coordinates. Element ids in the tree are directly actionable. To filter that same tree, pass the returned `accessibility.snapshotId` as `find_elements.snapshot_id`; subsequent search results return a top-level `snapshotId` for reuse. Prefer `invoke_element` or `set_element_value` when the app exposes the needed control.
3. Call `computer_use.enable` immediately before the first control action and keep it enabled across uninterrupted related steps.
4. When no suitable element exists, derive frame-relative coordinates from the latest screenshot. Refresh the state after the window moves, resizes, or is recreated.
5. Read every interactive result. Continue only after a successful `delivery`; respond to a structured `refused` result using its reason and hint. Background is the default and must not be silently retried as foreground.
6. Use `mode:"foreground"` only when the user requested takeover or a refusal recommends it. Tell the user immediately before taking over the real pointer and keyboard. A `background_unavailable` refusal means the action needs explicit foreground mode or a supported semantic action.
7. Prefer `observe:"text"` when accessibility can verify the change; use `"screenshot"` or `"both"` for visual checks. Reuse the returned `observation.state` instead of immediately requesting the same state again. Otherwise verify each meaningful change with a fresh window state. Re-list a stale window or refresh a stale element snapshot instead of retrying blindly.
8. Use `perform` only for a deterministic sequence of background element, value, key, or text actions against one window, with one final observation. For example, three independent field values known from the inspected form can be set in one batch with `observe:"text"`, replacing three action calls and three inspection calls. It stops on refusal, error, or unexpected foreground delivery; keep state-dependent or coordinate actions separate. After a partial failure, inspect the completed steps and current state before continuing; do not replay the whole batch.
9. Call `computer_use.disable` before asking the user for input, waiting on an external event, or finishing.

## Boundaries

- Background actions leave the user's foreground window, pointer, and keyboard alone. Foreground actions take over the desktop.
- Locked desktops, secure prompts, operating-system permission dialogs, passwords, and authentication surfaces require the user.
- Do not type or expose secrets unless the user supplied them for that exact purpose.
- Confirm before destructive changes or external communication unless the user already authorized the exact action.

## Output

Report the application and window used, the verified final state, and any step requiring user interaction. Do not claim completion from input dispatch alone.
