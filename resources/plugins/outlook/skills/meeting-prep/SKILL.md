---
name: meeting-prep
description: "Assemble what the user needs before a meeting: the event, the attendees, and the mail thread it came from."
---

# Meeting Prep

An upcoming meeting is an event plus the conversation behind it. Pull both, in that order, and stop when the user has enough to walk in prepared.

## Before you start

The `outlook` MCP server signs in on first use with a device code the user completes in a browser. If its tools are
unavailable or unauthenticated, say so and stop rather than reconstructing the meeting from memory.

## Anchor on the event

Find the event first — it fixes the time, the attendees, and the subject that everything else keys off. Resolve times
in the user's own time zone and say which one you used; a prep summary an hour off is worse than none.

Note what the invite itself carries: agenda in the body, attached documents, the organizer, who has not responded.

## Pull only the connected thread

Search mail for the thread the event came from — the invite subject, the organizer, the named project. Read that
thread. Do not sweep the inbox for anything mentioning the attendees; this is the user's real mailbox, not a corpus.

What matters is what changed since the last message: decisions made, questions left open, commitments the user made
that are now due.

## Prepare, do not act

Prep is read-only by default. Do not send a reply, accept or decline, move the event, or message attendees unless the
user asked for that specific action in this request. Drafting for their review is fine; sending is theirs.

## Report

Lead with the meeting time in the user's zone, the attendees, and the single sentence of what it is about. Then the
open questions and any item the user owes someone. Keep quoted mail short and say plainly when the thread does not
answer something — a gap you name is more useful than a guess.
