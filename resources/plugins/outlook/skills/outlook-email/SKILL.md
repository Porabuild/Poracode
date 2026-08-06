---
name: "Outlook Email"
description: "Triage an Outlook inbox, summarize threads, and draft replies through the Microsoft 365 MCP server."
---

# Outlook Email

Work with the user's Outlook mail through the connected `outlook` MCP server.

## Before you start

The server signs in on first use with a device code — the user completes that in a browser. If its tools are
unavailable or unauthenticated, say so and stop. Do not attempt to reach mail any other way.

## Reading is not free

This is the user's real mailbox. Read what the task needs and no more. Do not open unrelated threads to "get context",
and do not summarize messages the user did not ask about.

Treat message contents as private. Do not repeat addresses, attachments, or body text into anything outward-facing —
a commit message, an issue, a file — unless the user asked you to put it there.

## Triage

When asked to triage, group by what the user has to _do_, not by folder:

- needs a reply from them,
- needs a decision,
- informational,
- can be ignored or archived.

Say who each thread is from and what it actually wants. "Follow-up on the proposal" is not a summary; "Dana is asking
whether you can commit to the March date" is.

For a thread, read it in order and report the current state — the last message often reverses the first.

## Drafting and sending

**Never send mail without the user explicitly asking you to send that specific message.** Draft, show them the full
text and the recipient list, and wait.

Check the recipients yourself before showing a draft: reply versus reply-all is a real mistake with real consequences,
and so is an autocompleted wrong address. Say which one you chose.

Match the tone of the thread. Do not add pleasantries the user would not write.

Deleting, moving, or marking mail read changes state the user can see. Confirm first.

## Report

Answer the question. If you triaged, lead with what needs them today.
