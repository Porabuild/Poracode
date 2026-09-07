---
name: computer-use
description: Inspect and operate native Windows, macOS, or Linux applications through Poracode's desktop-control tools. Use for visual workflows that require real windows; prefer Browser for web pages and a purpose-built connector or API when one can complete the task directly.
---

# Computer Use

Use Poracode's `computer_use` MCP for tasks that require interacting with desktop applications or native windows. Do not use it for a web page when Browser or Chrome is the intended surface, or for a semantic operation that a safer purpose-built connector can perform.

Tree conventions, `delivery.verified`, refusals, and platform recovery live in the `computer_use` MCP instructions. Do not re-derive them here.

## Workflow

1. Pick the exact window with `list_apps` or `list_windows`. Call `computer_use.api` only for capability or permission status. If the app is not running, `list_apps` with `query` then `launch_app`.
2. Inspect with `get_window_state` (`include_text:true`; `include_screenshot:false` unless you need pixels or coordinates). Prefer `invoke_element` or `set_element_value` over coordinates.
3. Call `computer_use.enable` immediately before the first control action and keep it enabled across uninterrupted related steps.
4. Act, then verify from the window. Prefer `observe:"text"`; use `"screenshot"` or `"both"` for visual checks. Reuse `observation.state`. Continue only after a successful `delivery`; follow a `refused` hint.
5. Use `perform` only for a deterministic background element/value/key/text sequence against one window, with one final observation. After a partial failure, inspect before continuing; do not replay the batch.
6. Use `mode:"foreground"` and `activate_window` only when the user asked for a takeover, and tell them immediately before taking over the real pointer and keyboard. A refusal is never the licence: a `background_unavailable` refusal means follow the hint to `find_elements` plus `invoke_element` or `set_element_value`. If no background route can do the job, stop and tell the user what you need instead of taking their desktop.
7. Call `computer_use.disable` before asking the user for input, waiting on an external event, or finishing.

## Boundaries

- Background actions leave the user's foreground window, pointer, and keyboard alone. Foreground actions take over the desktop.
- Locked desktops, secure prompts, operating-system permission dialogs, passwords, and authentication surfaces require the user.
- Do not type or expose secrets unless the user supplied them for that exact purpose.
- Confirm before destructive changes or external communication unless the user already authorized the exact action.

## Output

Report the application and window used, the verified final state, and any step requiring user interaction. Do not claim completion from input dispatch alone.
