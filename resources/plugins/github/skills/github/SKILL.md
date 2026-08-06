---
name: "GitHub"
description: "Inspect repositories, review pull requests, triage issues, and follow CI through the GitHub MCP server."
---

# GitHub

Work with GitHub through the connected `github` MCP server. Prefer its tools over shelling out to `gh` or `git` —
they return structured data and work without a local checkout.

## Before you start

Confirm the server is connected. If its tools are unavailable, say so and stop rather than silently falling back to
guesswork; the user connects it from **Settings → Plugins → GitHub**.

Establish the target repository once, from the user's words or the current project's `origin` remote, and reuse it.
Do not guess an owner or repo name.

## Reading

- Read the pull request or issue body **and** its comments before forming an opinion. Review threads carry the
  decisions; the description is often stale.
- For a PR, read the diff before the discussion. Someone's summary of a change is not the change.
- Quote file and line when you reference code, so the user can jump to it.

## Writing

Anything that other people will see — a comment, a review, a label change, a merge — is outward-facing. Confirm the
exact text and target with the user before posting, unless they have already told you to go ahead. Approval to post one
comment is not approval to post the next one.

Never merge, close, or force-push on the user's behalf without them asking for that specific action.

## Reporting

Give the answer, not a transcript of your API calls. When you list PRs or issues, include number, title, author, and
current state, and lead with whatever the user actually asked about.

## Related skills

`review-follow-up` for working through review feedback, `ci-debug` for failing checks, `publish-changes` for
committing and opening a PR.
