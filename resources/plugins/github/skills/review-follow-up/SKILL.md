---
name: review-follow-up
description: "Work through pull request review feedback: sort what is actionable, fix it, and reply accurately."
---

# Review Follow-up

Turn review comments on a pull request into landed changes.

## Collect the feedback

Read every review thread, not just the top-level review summaries. Include threads marked resolved only if the user
asks — a resolved thread usually means it is already handled.

Sort each comment into one of three buckets and say which is which:

- **Actionable** — a concrete change is being requested.
- **Question** — the reviewer wants an explanation, not a diff.
- **Note** — an observation with no change implied.

## Work the actionable ones

Fix them in the code, not in the reply. Group related comments so you make one coherent change rather than several
overlapping ones.

If you disagree with a comment, say so to the user with your reasoning and let them decide. Do not silently skip it,
and do not implement something you believe is wrong without flagging it.

If a comment is ambiguous enough that two readings lead to different code, ask rather than guess.

## Reply

Reply once per thread, after the change exists. State what you changed and where. Do not claim a comment is addressed
until the code is actually written.

Replies are outward-facing: show the user the text before posting.

## Report

List what you changed, what you answered without changing, and what you deliberately left — with the reason. If some
feedback is still open, say that plainly instead of implying the review is fully handled.
