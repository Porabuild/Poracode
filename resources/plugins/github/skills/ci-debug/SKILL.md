---
name: "CI Debug"
description: "Diagnose a failing GitHub Actions check by reading the real logs and finding the first true failure."
---

# CI Debug

Find out why a check is failing, from evidence rather than from the check's name.

## Find the real failure

Start from the check run, get its job, and read the **log**. A job summary tells you something failed; the log tells
you what.

Scan for the _first_ failure, not the loudest one. A long red log is usually one root cause followed by cascading
noise — later errors are often just the same failure surfacing again downstream.

Note the step, the command, and the exact error text. Copy the error verbatim; do not paraphrase it into something
that sounds cleaner than it was.

## Separate the failure from the change

Before blaming the diff, check whether the same job fails on the base branch or on unrelated recent runs. Flaky and
pre-existing failures look identical to real ones in a single run.

Say explicitly which of these you concluded:

- the change caused it,
- it was already broken,
- it is flaky (and what evidence supports that),
- you could not tell from the available logs.

"I could not tell" is a legitimate answer. An invented root cause is not.

## Environment differences

When something passes locally and fails in CI, compare the things that actually differ: OS and runner image, tool and
dependency versions, environment variables and secrets, working directory, and whether the job runs against a merge
commit rather than the branch head.

## Fix and verify

Propose the narrowest fix that addresses the root cause. Re-run only the failed jobs when you can. If a re-run is
needed to confirm a flake, say that is what you are doing and why.

## Report

Lead with the root cause and the evidence line from the log. Then the fix. If the fix is unverified because CI has not
re-run yet, say so.
