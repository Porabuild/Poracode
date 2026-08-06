---
name: outlook-calendar
description: "Read an Outlook calendar, find meeting times, and create or move events through the Microsoft 365 MCP server."
---

# Outlook Calendar

Work with the user's Outlook calendar through the connected `outlook` MCP server.

## Time zones

Get this right or everything else is wrong. Establish the user's time zone before reading or writing anything, and
state times in it. When a meeting involves other people, say the time in each relevant zone rather than assuming
everyone shares the user's.

Watch for all-day events and multi-day events — they do not behave like timed blocks when you are looking for a gap.

## Reading

Report the schedule as blocks of committed time and gaps between them, not as a list of API records. Include what the
user asked for and skip the rest.

Declined and tentative events are not the same as accepted ones. Say which is which when it affects availability.

## Finding times

A gap on the calendar is not automatically a good time. Respect working hours, leave room around back-to-back
meetings, and flag when the only options are early, late, or over lunch.

When you propose slots, give a few concrete options with dates and times, not a description of your search.

## Writing

Creating, moving, or cancelling an event notifies other people. That is outward-facing: confirm the exact time,
duration, title, and attendee list with the user before you do it, every time.

Moving a meeting the user does not organize can be disruptive — say so before doing it rather than after.

Never decline or accept an invitation on the user's behalf unless they asked for that specific response.

## Report

State what you found or what you changed, with times in the user's zone. If you could not find a workable slot, say
that plainly and show the constraint that blocked it.
