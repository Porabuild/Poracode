---
name: chrome-control
description: Use the user's real Chrome tabs and signed-in sessions for visible browser workflows. Use when existing authentication, open tabs, cookies, or extensions matter; prefer a purpose-built connector for semantic service operations unless the user explicitly asks for Chrome.
---

# Chrome Control

Use Poracode's `chrome` MCP when a task depends on the user's current Chrome tabs, authenticated sessions, or installed extensions. If a purpose-built connector can complete a semantic service operation, prefer it unless the user explicitly requested Chrome or visual interaction is part of the task.

## Workflow

1. Call `chrome.chrome_status` first. If the extension is disconnected, ask the user to connect it rather than switching surfaces silently.
2. Call `chrome.enable` once before browser actions. Use the background Poracode workspace by default; call `chrome.chrome_attach` only when the user asked to operate an existing tab.
3. Inspect with `chrome.chrome_snapshot` or `chrome.chrome_find` before clicking or typing. Prefer returned element refs and use `chrome_fill` for replacement versus `chrome_type` for appending.
4. Keep every action scoped to the requested site and task. Do not explore other tabs or signed-in content for extra context.
5. After every meaningful action, wait for and verify the resulting URL, text, control state, or screenshot.
6. Call `chrome.disable` before asking the user for input, waiting on an external event, or finishing.

## Boundaries

- Treat tabs, cookies, storage, and signed-in content as sensitive user data. Do not read cookies unless the task requires it and Chrome data access is enabled.
- Never attach to an unrelated existing tab merely because it is already authenticated.
- A successful tool call is not proof that the website accepted the action; verify the visible result.
- Confirm the exact target and payload before purchases, submissions, messages, deletions, account changes, or other irreversible actions unless already authorized.

## Output

Report the target site or tab, what changed, and the final visible evidence. State whether the background workspace or an existing user tab was used, and identify any action left pending for confirmation.
