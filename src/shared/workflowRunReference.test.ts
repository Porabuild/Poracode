import { describe, expect, it } from "vitest";
import fixture from "../../protocol/remote/v3/fixtures/client-workflow-liveness.json";
import {
  isWorkflowRunLive,
  workflowRunSchema,
  WORKFLOW_STALE_PROGRESS_MS,
} from "./contracts/workflowTranscript";
import { workflowRunReference } from "./workflowRunReference";

describe("canonical workflow transport references", () => {
  it.each(fixture.references)("$id", (entry) => {
    expect(workflowRunReference(entry.metadata)).toEqual(entry.expected ?? undefined);
  });
});

describe("shared workflow liveness clock", () => {
  it("pins the native policy to the PWA progress deadline", () => {
    expect(fixture.progressDeadlineMs).toBe(WORKFLOW_STALE_PROGRESS_MS);
  });
  it.each(fixture.liveness)("$id", (entry) => {
    expect(isWorkflowRunLive(workflowRunSchema.parse(entry.run), { now: entry.now })).toBe(
      entry.expected,
    );
  });
});
