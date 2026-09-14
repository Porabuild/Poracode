---
name: parallel-review
description: Get independent reviews of completed work and reconcile the findings into one verified verdict.
---

# Parallel Review

Use the Crossagents core skill once. Review a completed, stable candidate with independent read-only lanes. Choose only lenses justified by risk: correctness/lifecycle, security/trust, tests/compatibility, or simplification/performance; combine lenses for small changes.

Give each reviewer intent, exact files/resources, relevant diff and acceptance criteria. Require file:line, severity, a concrete failure or cost, evidence and the smallest fix. Target 500 words while retaining every critical finding. Reviewers investigate and prove claims; they do not edit, delegate further or narrate their search. Keep their conclusions independent.

Batch lanes in `spawn_agent.tasks` with review tags and compact results. For a known implementation→review dependency, use `run_workflow` to pass reports. Use the core skill's normal waits and collect full results before corrections; only a material cannot-wait correction warrants active steering.

Validate findings against real code and guards; agreement is not proof. Consolidate confirmed fixes, verify changed behavior, and request only a correction-delta review when it affects meaningful behavior or boundaries. Return verified findings (or none), actual checks and remaining limits.
