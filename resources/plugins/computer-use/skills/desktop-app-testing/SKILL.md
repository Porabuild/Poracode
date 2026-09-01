---
name: desktop-app-testing
description: "Walk a native app through a flow with Poracode's desktop control and verify each step from the window itself."
---

# Desktop App Testing

Driving a desktop app is slow, exclusive, and visible — the real mouse and keyboard belong to you while it runs. Plan the run before taking control, and prove each step from the window rather than from the fact that a click was dispatched.

## Plan before you take over

List apps and windows and pick the exact target. Write down the steps you intend to perform and what each one should
produce on screen. Launch the app yourself if it is not running; do not improvise against whatever window happens to be
in front.

Prefer ordinary Win32 desktop apps when the task offers a choice. Some Store/WinUI apps recreate their window handles
during activation, so a stale window object silently sends input nowhere.

## Run the flow

Call `computer_use.enable` immediately before the first interactive step, and keep it enabled for the whole run so the
overlay stays up and the user knows the machine is busy.

For each step: `get_window_state`, act, then `get_window_state` again and compare. Coordinates come from the newest
screenshot and are relative to the window's top-left, title bar included. Prefer named controls and keyboard shortcuts
over pixels wherever the app exposes them.

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
