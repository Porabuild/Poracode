---
name: web-app-verification
description: "Prove a web change actually works by exercising the flow in Poracode's browser and collecting visual, console, and network evidence."
---

# Web App Verification

A change is not verified because the code looks right or the build passed. Drive the real flow and report what the app did.

## Set the baseline

Call `browser.enable` once, then open the exact target the user named — their local dev URL, their preview
deployment. Do not substitute a different URL or a web search when the page is unreachable; say it is unreachable.

Capture the starting state with `browser.snapshot` plus the current URL, and clear the console with a reload so
pre-existing noise is not mistaken for your change. Note any errors that survive the reload — those are the baseline,
not your regression.

## Exercise the flow

Walk the path a user would take, one action at a time, using the refs from the snapshot rather than coordinates. After
each navigation or state-changing action, wait for the expected URL, text, or element before continuing.

Test the boundaries the change actually touched: the empty state, the error path, the second submit. A single happy
path proves very little.

## Collect the evidence

For every claim you intend to make, hold one artifact:

- **Visual** — a screenshot when layout, spacing, or appearance is part of the requirement.
- **Console** — `browser.console` after the flow, separating new errors from the baseline.
- **Network** — failed or unexpected requests from `browser.requests`, with status codes.

## Verdict

State plainly what you verified, what you observed, and what you could not check — a flow behind a login you do not
have, a path that needs data you cannot create. "Works" without evidence is not a verdict.

Call `browser.disable` before you stop or hand back to the user.
