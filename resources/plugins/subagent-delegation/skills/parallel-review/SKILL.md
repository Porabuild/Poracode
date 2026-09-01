---
name: parallel-review
description: "Get independent reviews of the same work from several agents, then reconcile their findings into one verified verdict."
---

# Parallel Review

Several agents reading the same diff for different risks catch more than one agent reading it once. The value comes from independence — separate lanes, separate prompts, no shared conclusions — and from you verifying what comes back.

## Split by dimension, not by file

Give each reviewer one lens: correctness and regressions, security and trust boundaries, performance, tests, API or
schema compatibility. Overlapping lenses produce three copies of the same easy finding and no coverage of the hard one.

Pick lenses that fit the change. A migration deserves a compatibility reviewer; a parser deserves an input-handling
one.

## Brief them independently

Every prompt is self-contained: what changed, where to look, which lens is theirs, and what a finding must include —
file, line, concrete failure scenario, not a style preference. Do not paste your own conclusions; a reviewer told what
you already believe will agree with you.

Keep review lanes read-only. Reviewers report; they do not edit the tree, and their prompt must not authorize writes.

Submit the lanes together in one `spawn_agent` call so they actually run in parallel, and tag them for review so
routing can pick suitable providers.

## Reconcile what returns

Wait once at the synchronization point, then treat every finding as a claim to check, not a fact. Open the file and
confirm the failure is real and reachable. Confident agents report bugs that the surrounding code already prevents.

Two reviewers agreeing is not evidence — they may share a blind spot or a wrong assumption. Two disagreeing is useful:
work out which one read the code correctly.

Drop what does not survive verification. A review that forwards every claim wastes the user's time more than no review.

## Output

One ranked list of verified findings, most severe first, each with the file, the failure it causes, and the evidence
you checked yourself. Say which dimensions were covered and which reviewer came back empty — an empty lane is a result.
