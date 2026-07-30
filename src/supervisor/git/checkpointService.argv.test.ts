import { describe, expect, it } from "vitest";
import { buildCheckpointCommitInput } from "./checkpointService";

describe("buildCheckpointCommitInput", () => {
  it("sends large checkpoint metadata over stdin instead of argv", () => {
    const metadata = {
      threadId: "thread-1",
      checkpointItemId: "assistant-1",
      changedFiles: Array.from({ length: 5_000 }, (_, index) => ({
        path: `generated/${index.toString().padStart(5, "0")}-${"x".repeat(80)}.txt`,
        status: "modified",
      })),
    };

    const invocation = buildCheckpointCommitInput("tree", "parent", metadata);

    expect(invocation.args).toEqual(["commit-tree", "tree", "-p", "parent", "-F", "-"]);
    expect(invocation.args.join(" ").length).toBeLessThan(100);
    expect(invocation.input.length).toBeGreaterThan(500_000);
    expect(invocation.input).toContain('"changedFiles"');
  });
});
