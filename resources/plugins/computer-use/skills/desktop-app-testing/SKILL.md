---
name: desktop-app-testing
description: "Walk a native Windows, macOS, or Linux app through a flow with Poracode's desktop control and verify each step from the window itself."
---

# Desktop App Testing

Drive the app in the background when its platform and controls allow it. Plan the run before acting, and prove each step from the window rather than from the fact that input was dispatched.

## Plan the run

List apps and windows and pick the exact target. If the app is not running, search installed apps with `list_apps`
`query` and pass the returned id to `launch_app`. Write down the steps you intend to perform and what each one should
produce on screen; do not improvise against whatever window happens to be in front.

Call `computer_use.api` only when capability or permission status is needed. List apps and windows, then call
`get_window_state` on the selected window with `include_text:true`. Add `include_screenshot:false` for semantic checks;
request a screenshot for visual checks or coordinates. Its element ids are directly actionable; pass the returned
`accessibility.snapshotId` as `find_elements.snapshot_id` when filtering the same tree. Search results return a top-level
`snapshotId` for reuse. Some apps recreate windows during navigation or
activation, so refresh a stale window instead of reusing its old id.

## Run the flow

Call `computer_use.enable` immediately before the first control step and keep it enabled for the uninterrupted run.
Background work shows a small badge; foreground takeover shows the border and enables Escape interruption except while a key chord is being sent.

For each step: inspect, act, inspect again, and compare. Prefer `observe:"text"` for semantic checks, or use
`"screenshot"` or `"both"` for visual checks. Reuse the returned `observation.state` for the second inspection instead of
requesting it again. Prefer `invoke_element` or `set_element_value`.
Coordinates are a fallback, come from the newest screenshot, and are relative to the window's top-left with the title
bar included.

Use `perform` when several background element, value, key, or text actions are deterministic from the same inspected
state, with one final observation. It stops on refusal, error, or unexpected foreground delivery. After a partial
failure, inspect completed steps and current state before continuing; do not replay the whole batch. Do not batch coordinates or steps whose target depends on an intermediate result.

Read `delivery` or `refused` after every action. Do not silently turn a background refusal into foreground input. Use
`mode:"foreground"` only when the user requested takeover or the refusal recommends it, and warn the user immediately
beforehand. A `background_unavailable` refusal requires explicit foreground mode or a supported semantic action.

Use the window object returned by the last interactive call. When a tool reports the window is gone, re-list and
re-resolve rather than retrying blind.

## Judge the result

A step passed when the window shows what you predicted — the dialog closed, the row appeared, the field holds the value.
Input dispatched with no visible change is a failure, not a pass, and so is a screenshot you did not actually look at.

Stop at anything the user owns: locked desktops, OS permission prompts, password fields, payment or account
confirmations. Ask instead of typing through them.

## Report

Name the app and window, list the steps with their verified outcome, and show the screenshot for anything visual. Call
out the steps you could not complete and why, then `computer_use.disable` so the machine goes back to the user.
