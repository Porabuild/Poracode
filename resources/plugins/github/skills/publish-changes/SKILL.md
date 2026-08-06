---
name: "Publish Changes"
description: "Commit work, push a branch, and open a pull request with an accurate description."
---

# Publish Changes

Get finished work onto a branch and into a pull request.

## Before committing

Committing and pushing are the user's call. Do them when asked, not because the work looks done.

Check the current branch first. If it is the default branch, create a new one instead of committing to it.

Review what is actually staged. Never `git add -A` over a tree you have not looked at — stray artifacts, local config,
and secrets get committed that way. Stage the files you changed on purpose.

## The commit

Write a message that says what changed and why, in the style already used in the repository's history. Match its
existing conventions rather than importing your own.

Do not skip hooks or bypass signing. If a hook fails, fix what it caught.

## The pull request

The description should let a reviewer understand the change without reading every line of the diff: what it does, why,
and anything that needs a decision. Note what you did not do — deliberate omissions, follow-ups, known gaps.

Do not describe tests as passing unless you ran them and saw them pass. If something is unverified, say which part and
why.

Opening a PR is outward-facing. Show the user the title and body before you create it.

## After

Report the branch name and the PR URL. If CI starts and fails, `ci-debug` covers the diagnosis.
