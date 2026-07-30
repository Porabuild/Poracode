---
name: browser-control
description: Navigate, inspect, and test pages with Poracode's isolated in-app browser.
---

# Browser Control

Use Poracode's Browser MCP when the task depends on a website, rendered page, or local web app.

## Workflow

1. List the available browser tabs and reuse the relevant tab when possible.
2. Inspect the current URL and page snapshot before interacting.
3. Prefer semantic queries and targeted reads over coordinate-based actions.
4. After navigation or a state-changing action, wait for the expected page state and verify it.
5. Use screenshots when visual layout is part of the requirement.

The in-app browser is isolated from the user's personal Chrome profile. Do not assume it contains the user's existing logins or extensions.
