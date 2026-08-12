---
name: computer-use
description: Inspect and operate native Windows or macOS applications through Poracode's desktop-control tools. Use for visual workflows that require real windows; prefer Browser for web pages and a purpose-built connector or API when one can complete the task directly.
---

# Computer Use

Use Poracode's `computer_use` MCP for tasks that require interacting with desktop applications or native windows. Do not use it for a web page when Browser or Chrome is the intended surface, or for a semantic operation that a safer purpose-built connector can perform.

## Workflow

1. Call `computer_use.api` when you need the API map, then list applications and windows and select the exact target.
2. Capture `computer_use.get_window_state` before coordinate input. Use its returned window object and screenshot coordinates; refresh the window if it moved, resized, or became stale.
3. Call `computer_use.enable` immediately before the first interactive action. Keep the session enabled across uninterrupted related steps.
4. Prefer accessibility text, named controls, and reliable keyboard shortcuts. When coordinates are necessary, derive them from the latest screenshot rather than guessing.
5. Use small actions and inspect the window again after each meaningful change. Re-resolve the window after application navigation that may recreate it.
6. Call `computer_use.disable` before asking the user for input, waiting on an external event, or finishing.

## Boundaries

- Interactive actions take control of the real mouse and keyboard and bring the target window to the foreground. Avoid unnecessary actions and do not operate a different application.
- Locked desktops, secure prompts, operating-system permission dialogs, passwords, and authentication surfaces require the user.
- Do not type or expose secrets unless the user supplied them for that exact purpose.
- Confirm before destructive changes or external communication unless the user already authorized the exact action.

## Output

Report the application and window used, the verified final state, and any step requiring user interaction. Do not claim completion from input dispatch alone.
