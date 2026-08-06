import { describe, expect, it, vi } from "vitest";
import type { JudgeExperimentSnapshotPayload } from "@/shared/contracts";
import { captureExperimentResponseSnapshot } from "./experimentResponseSnapshot";

const payload: JudgeExperimentSnapshotPayload = {
  experimentId: "experiment-1",
  projectLocation: { kind: "posix", path: "/repo" },
  baseCommit: "a".repeat(40),
  agentKind: "codex",
  mode: "responses",
  prompt: "Research the question",
  candidates: [
    { threadId: "thread-1", branch: "one", ownerToken: "owner-1" },
    { threadId: "thread-2", branch: "two", ownerToken: "owner-2" },
  ],
  responses: [
    { threadId: "thread-1", response: "First answer" },
    { threadId: "thread-2", response: "" },
  ],
};

describe("captureExperimentResponseSnapshot", () => {
  it("uses persisted chat first and terminal scrollback as a fallback", () => {
    const onCaptured = vi.fn<(candidate: { threadId: string; characters: number }) => void>();
    const snapshot = captureExperimentResponseSnapshot(
      payload,
      (threadId) => (threadId === "thread-2" ? "Terminal answer" : "unused"),
      onCaptured,
    );

    expect(snapshot.candidates).toEqual([
      { threadId: "thread-1", diff: "First answer" },
      { threadId: "thread-2", diff: "Terminal answer" },
    ]);
    expect(snapshot.hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(onCaptured).toHaveBeenCalledTimes(2);
  });

  it("fails without reading Git when no chat response is available", () => {
    expect(() => captureExperimentResponseSnapshot(payload, () => "")).toThrow(
      "No chat response is available for experiment candidate thread-2.",
    );
  });
});
