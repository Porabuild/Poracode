---
name: address-pr-feedback
description: Collects, validates, triages, and resolves review feedback on a Poracode pull request, then replies in each thread. Use when asked to "address review comments", "handle PR feedback", "respond to the review", "fix the review threads", or "triage the PR comments". Not for self-review before opening a PR (use deep-review) or for reviewing someone else's PR.
---

# Address PR feedback

The author's response to other people's review. Every item gets a verdict backed by evidence, accepted items get fixed and verified, and every thread gets a reply.

If the user asked only for triage, stop after the triage table: do not edit, push, or post replies.

## 1. Collect everything

Check out the PR branch (`gh pr checkout <n>`) and gather all three feedback channels; reviewers use all of them.

Inline review threads, with resolution state:

```sh
gh api graphql -F owner='{owner}' -F repo='{repo}' -F pr=<n> -f query='
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id isResolved isOutdated path line originalLine
          comments(first: 50) { nodes { databaseId author { login } body url } }
        }
      }
    }
  }
}'
```

If `hasNextPage` is true, page with an `after: <endCursor>` argument; outdated threads have no `line`, so use `originalLine`.

Review summaries and conversation comments:

```sh
gh pr view <n> --json reviews,comments,headRefName,url
```

Skip resolved threads unless a later comment reopens the point. Treat outdated threads as live until you confirm the current code addresses them.

## 2. Validate each item against the code

A reviewer comment is a claim, not a fact. Before accepting:

- Read the current code at the referenced path, not only the diff hunk; the line may have moved.
- For behavioral claims, reproduce: write or run a failing test, or drive the app via `interactive-testing`.
- Check the claim against repo rules (`AGENTS.md`, `.agents/docs/`). A suggestion that breaks provider isolation, i18n, or versioning rules is not accepted as written.

## 3. Triage

Produce one table before changing anything:

| #   | Source (thread/review/comment link) | Claim | Verdict | Evidence / plan |
| --- | ----------------------------------- | ----- | ------- | --------------- |

Verdicts:

- **Accept**: valid, fix as suggested.
- **Accept with different fix**: the problem is real but the suggested change is wrong or narrower than needed; describe the alternative.
- **Reject**: the claim does not hold; cite the code, test, or doc that shows it.
- **Needs owner decision**: product, scope, or design trade-off the author cannot settle alone; state the options.

Ask the user about "Needs owner decision" items before acting on them.

## 4. Fix

- Fix accepted items. Add or update a test wherever behavior changed; the test is the proof for the reply.
- Keep fixes scoped to the feedback. Unrelated improvements go in a separate PR.
- Run the `verify` skill.
- Commit with the `commit` skill conventions and push to the PR branch with a plain `git push`. Do not force-push unless the user asks; it breaks reviewers' "changes since last review" view.

## 5. Reply and re-request

Reply in each thread, using the `databaseId` of the thread's first comment:

```sh
gh api repos/{owner}/{repo}/pulls/<n>/comments/<comment-id>/replies -f body='Fixed in <sha>: <what changed>. Test: <test name or n/a>'
```

- Fixed: `Fixed in <sha>: <what>. Test: <test or n/a>`
- Not changed: `Not changed: <reason and evidence>`

Answer review summaries and conversation comments with one `gh pr comment <n> --body-file <file>` that covers each point.

Do not resolve reviewers' threads or dismiss reviews; the reviewer decides when a point is settled.

Re-request review from each reviewer who left feedback: `gh pr edit <n> --add-reviewer <login>`.

## Done when

- Every unresolved item has a verdict in the triage table.
- Accepted items are fixed, tested where behavior changed, verified, and pushed.
- Every thread has a reply with a SHA or a reason, and reviewers are re-requested.
- The report includes the triage table, pushed SHAs, checks run, and any items awaiting an owner decision.
