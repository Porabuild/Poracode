---
name: desktop-app-testing
description: "Walk a native Windows, macOS, or Linux app through a flow with Poracode's desktop control and verify each step from the window itself."
---

# Desktop App Testing

Drive the app in the background when its platform and controls allow it. Plan the run before acting, and prove each step from the window rather than from the fact that input was dispatched.

## Plan the run

List apps and windows and pick the exact target. Write down the steps you intend to perform and what each one should
produce on screen. Launch the app yourself if it is not running; do not improvise against whatever window happens to be
in front.

Call `computer_use.api` if needed, then list apps and windows and call `get_window_state` on the selected window with
`include_text:true`. Some apps recreate windows during navigation or activation, so refresh a stale window instead of
reusing its old id.

## Run the flow

Call `computer_use.enable` immediately before the first control step and keep it enabled for the uninterrupted run.
Background work shows a small badge; foreground takeover shows the border and enables Escape interruption except while a key chord is being sent.

For each step: inspect, act, inspect again, and compare. Prefer `find_elements` with `invoke_element` or
`set_element_value`. Coordinates are a fallback, come from the newest screenshot, and are relative to the window's
top-left with the title bar included.

Read `delivery` or `refused` after every action. Do not silently turn a background refusal into foreground input. Use
`mode:"foreground"` only when the user requested takeover or the refusal recommends it, and warn the user immediately
beforehand. Native Wayland's consented portal is the exception: it reports foreground delivery and
`wayland_portal_fallback` explicitly.

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
