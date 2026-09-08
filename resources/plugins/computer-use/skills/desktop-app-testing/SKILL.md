---
name: desktop-app-testing
description: "Walk a native Windows, macOS, or Linux app through a flow with Poracode's desktop control and verify each step from the window itself."
---

# Desktop App Testing

Follow the computer-use skill for enable/disable, background-only, and how to read a result. This skill is the test plan: predict, drive, prove.

## Plan the run

List apps and windows and pick the exact target. If the app is not running, search installed apps with `list_apps`
`query` and pass the returned id to `launch_app`. Write down the steps you intend to perform and what each one should
produce on screen; do not improvise against whatever window happens to be in front.

Call `get_window_state` on the selected window with `include_text:true` before the first step. Some apps recreate
windows during navigation, so refresh a stale window instead of reusing its old id.

## Run the flow

Call `computer_use.enable` immediately before the first control step and keep it enabled for the uninterrupted run.

For each step: inspect, act, inspect again, and compare. Prefer `observe:"text"`; reuse `observation.state` for the
second look. Do not batch coordinates or steps whose target depends on an intermediate result.

Use `mode:"foreground"` and `activate_window` only when the user asked for a takeover, and warn the user immediately
beforehand — a refusal is not that permission. A `background_unavailable` refusal means follow the hint to
`invoke_element` or `set_element_value`, and if none fits, say so rather than taking over the desktop.

## Judge the result

A step passed when the window shows what you predicted — the dialog closed, the row appeared, the field holds the value.
Input dispatched with no visible change is a failure, not a pass, and so is a screenshot you did not actually look at.

Stop at anything the user owns: locked desktops, OS permission prompts, password fields, payment or account
confirmations. Ask instead of typing through them.

## Report

Name the app and window, list the steps with their verified outcome, and show the screenshot for anything visual. Call
out the steps you could not complete and why, then `computer_use.disable` so the machine goes back to the user.
