import { describe, expect, it } from "vitest";
import {
  browseHostDirectoryResultSchema,
  detectSetupScriptResultSchema,
  ghCheckAvailableResultSchema,
  ghGetPrForBranchResultSchema,
  gitCommitResultSchema,
  gitProjectSnapshotResultSchema,
  importSkillsResultSchema,
  mcpOauthBeginResultSchema,
  mcpProbeResultSchema,
  prDataSchema,
  readProjectFileResultSchema,
  skillScanResultSchema,
} from "../../contracts";
import { subAgentSubscribeResultSchema, workflowGetRunResultSchema } from "../../ipc/schemas";
import { omittedResultSchema, remoteProcedureCallEnvelopeSchema } from "../../ipc/resultCodec";

describe("remote procedure result fixtures", () => {
  it("validates representative handler-shaped results", () => {
    expect(gitCommitResultSchema.parse({ hash: "abc123", message: "fix: parse" }).hash).toBe(
      "abc123",
    );
    expect(
      gitProjectSnapshotResultSchema.parse({
        status: null,
        branches: null,
        worktrees: null,
        ghAvailable: null,
      }).status,
    ).toBeNull();
    expect(ghCheckAvailableResultSchema.parse({ available: true }).available).toBe(true);
    expect(ghGetPrForBranchResultSchema.parse(null)).toBeNull();
    expect(
      prDataSchema.parse({
        number: 12,
        state: "open",
        title: "Ship remote contract",
        url: "https://github.com/acme/app/pull/12",
        baseBranch: "main",
        isDraft: false,
        updatedAt: "2026-08-12T00:00:00.000Z",
      }).number,
    ).toBe(12);
    expect(
      browseHostDirectoryResultSchema.parse({
        path: "/Users/dev",
        parentPath: "/Users",
        homePath: "/Users/dev",
        entries: [{ name: "src", path: "/Users/dev/src", type: "directory" }],
        truncated: false,
      }).parentPath,
    ).toBe("/Users");
    expect(
      readProjectFileResultSchema.parse({
        path: "README.md",
        status: "ready",
        modifiedAtMs: 1,
        content: "# hi",
        lineEnding: "lf",
      }).status,
    ).toBe("ready");
    expect(detectSetupScriptResultSchema.parse({}).setupScript).toBeUndefined();
    expect(
      skillScanResultSchema.parse({
        skills: [],
        effectiveSkillIds: [],
        invocation: null,
        issues: [],
        canLinkToGlobal: false,
      }).invocation,
    ).toBeNull();
    expect(importSkillsResultSchema.parse({ imported: [] }).imported).toEqual([]);
    expect(
      mcpProbeResultSchema.parse({
        status: "available",
        latencyMs: 12,
        environment: { runtime: "host", projectScoped: false },
        toolCount: 2,
      }).status,
    ).toBe("available");
    expect(mcpOauthBeginResultSchema.parse({ status: "authorized" }).status).toBe("authorized");
    expect(workflowGetRunResultSchema.parse({ run: null }).run).toBeNull();
    expect(subAgentSubscribeResultSchema.parse({ history: [] }).history).toEqual([]);
  });

  it("rejects missing-vs-null and invalid enum/number mutations", () => {
    expect(ghGetPrForBranchResultSchema.safeParse(undefined).success).toBe(false);
    expect(
      prDataSchema.safeParse({
        number: 12,
        state: "OPEN",
        title: "x",
        url: "https://example.com",
        baseBranch: "main",
        isDraft: false,
        updatedAt: "2026-08-12T00:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      gitCommitResultSchema.safeParse({ hash: "abc", message: "m", stashReapplied: null }).success,
    ).toBe(false);
    expect(
      readProjectFileResultSchema.parse({
        path: "a",
        status: "ready",
        modifiedAtMs: 1.25,
      }).modifiedAtMs,
    ).toBe(1.25);
    expect(
      readProjectFileResultSchema.safeParse({
        path: "a",
        status: "ready",
        modifiedAtMs: Number.POSITIVE_INFINITY,
      }).success,
    ).toBe(false);
    expect(
      readProjectFileResultSchema.safeParse({
        path: "a",
        status: "ready",
        modifiedAtMs: -1,
      }).success,
    ).toBe(false);
    const voidEnvelope = remoteProcedureCallEnvelopeSchema(omittedResultSchema);
    expect(voidEnvelope.safeParse({ result: null }).success).toBe(false);
    expect(JSON.parse(JSON.stringify({ result: undefined }))).toEqual({});
  });
});
