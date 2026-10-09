import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { threadSchema, startThreadPayloadSchema } from "../../../src/shared/contracts/thread";
import { remoteEnvironmentDescriptorSchema } from "../../../src/shared/remote/protocol";

const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/workspace-grant-read-projections.json", import.meta.url),
    "utf8",
  ),
) as {
  valid: { id: string; thread: Record<string, unknown> }[];
  invalid: { id: string; fields: Record<string, unknown> }[];
};
const legacy = fixture.valid[0]!.thread;

describe("readonly workspace grant projections", () => {
  it.each(fixture.valid)("retains $id without inferring absent authorization", ({ thread }) => {
    const parsed = threadSchema.parse(thread);
    expect(parsed.additionalDirectories).toEqual(thread.additionalDirectories);
    expect(parsed.workspaceGrantRevision).toEqual(thread.workspaceGrantRevision);
    expect(threadSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it.each(fixture.invalid)("rejects malformed present $id", ({ fields }) => {
    expect(threadSchema.safeParse({ ...legacy, ...fields }).success).toBe(false);
  });

  it("enforces entry and source execution-path limits before deduplication", () => {
    const parse = (additionalDirectories: unknown[]) =>
      threadSchema.safeParse({ ...legacy, additionalDirectories });
    const root = { kind: "posix", path: "/root" };
    expect(parse(Array(16).fill(root)).success).toBe(true);
    expect(parse(Array(17).fill(root)).success).toBe(false);
    expect(parse([{ ...root, path: "😀".repeat(4_096) }]).success).toBe(true);
    expect(parse([{ ...root, path: "x".repeat(4_097) }]).success).toBe(false);
    // Public read projection carries structural bounds only. The host separately
    // enforces the aggregate authorization budget; readers do not infer grants.
    expect(parse(Array(16).fill({ ...root, path: "x".repeat(4_096) })).success).toBe(true);
  });

  it("does not expose saved read fields as a launch input or grant capability", () => {
    expect(Object.keys(startThreadPayloadSchema.shape)).not.toContain("additionalDirectories");
    expect(Object.keys(startThreadPayloadSchema.shape)).not.toContain("workspaceGrantRevision");
    const capabilities = remoteEnvironmentDescriptorSchema.shape.capabilities.unwrap();
    expect(Object.keys(capabilities.shape)).not.toContain("threadWorkspaceGrants");
  });
});
