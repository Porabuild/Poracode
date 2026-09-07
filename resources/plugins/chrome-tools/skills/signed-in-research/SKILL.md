---
name: signed-in-research
description: "Gather information from pages that only load behind the user's own Chrome login, without touching anything else in their session."
---

# Signed-in Research

The user's Chrome carries their real accounts. Use it when a page needs that login — an internal dashboard, a
paywalled doc, an admin console — and read only what was asked for.

## Confirm the surface first

Call `chrome.status`. A disconnected extension means the answer is "connect Chrome", not a silent switch to the
isolated browser, which has none of these logins.

Ask yourself whether the login is actually required. If the page is public, Poracode's own browser is the safer surface
and leaves the user's session untouched.

## Reach the page

Open the URL the user gave you. Attach to an existing tab with `chrome.attach` only when they asked you to work
in a tab they already have open — never because it happens to be authenticated already.

If the page redirects to a login wall, stop and say so. Do not attempt credentials, and do not go hunting through other
tabs for a session that works.

## Read narrowly

Pull the specific values, table, or passage the question needs, using `chrome.snapshot` or `chrome.find`.
Stay on the requested site. Other tabs, unrelated pages, and the user's history are not context you get to collect.

Leave cookies and storage alone unless the task genuinely requires them and Chrome data access is enabled.

Reading is safe; clicking often is not. In a signed-in console, buttons send invitations, cancel subscriptions, and
delete records. Confirm before any action that writes, sends, or removes.

## Report

Give the answer with the URL and page title it came from, and quote the part that carries it. Say which pages you could
not reach and why — a login wall, an expired session, a permission error — instead of filling the gap from memory.

Call `chrome.disable` when you finish or pause for the user.
