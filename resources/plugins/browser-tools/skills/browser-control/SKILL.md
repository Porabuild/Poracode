---
name: browser-control
description: Open, inspect, interact with, and verify websites or local web apps in Poracode's isolated browser. Use for visible page state, navigation, screenshots, console or network evidence, and end-to-end UI testing; do not use it for semantic service operations when a purpose-built connector is available.
---

# Browser Control

Use Poracode's `browser` MCP when the task depends on a rendered page, visible interaction, or local web app. If the request is really about structured data or a service operation and a purpose-built connector is available, use that connector instead. An explicit request for Poracode's browser wins.

## Workflow

1. Call `browser.api` when you need the current API map, then call `browser.enable` once before the first browser action.
2. Reuse a relevant tab from `browser.list_tabs`; otherwise open the exact URL the user supplied or the known local target. Do not guess a remote site or substitute web search when authentication blocks the requested page.
3. Establish the baseline with the current URL plus `browser.snapshot` or `browser.find`. Prefer accessible roles, names, and returned element refs over brittle selectors or coordinates.
4. Use `perform` for a bounded sequence of known actions: `{steps:[{action:"fill",ref:"@e1",text:"Ada"},{action:"click",ref:"@e2"},{action:"wait",text:"Saved"}]}`. It stops on failure and returns one final compact snapshot (`observe:"none"` omits it). Use `fill` for replacement and `type` for appending. Split batches at decisions, new targets, and navigation; do not replay completed steps after failure.
5. Include a condition `wait` at the end of a batch for asynchronous changes, then inspect its returned observation. After navigation, wait for the expected URL, text, or element and inspect the resulting state. For web-app verification, also check relevant console errors and failed network requests.
6. Capture a screenshot when visual layout or appearance is part of the requirement.
7. Call `browser.disable` before asking the user for input, waiting on an external event, or finishing.

## Boundaries

- The in-app browser is isolated from the user's personal Chrome profile. Do not assume it contains existing logins, cookies, or extensions.
- Never inspect cookies or storage unless the task requires it and the user authorized that data access.
- A successful click is not proof of success. Verify the user-visible or application state it was meant to produce.
- Pause before purchases, submissions, messages, deletions, or other irreversible external actions unless the user explicitly authorized that exact action.

## Output

Report the tested URL and flow, the final observed state, and the evidence used. Separate visual, console, and network findings, and state any step that could not be verified.
