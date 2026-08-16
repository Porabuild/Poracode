import { describe, expect, it } from "vitest";
import { buildParitySnapshot } from "./harness/paritySnapshot.ts";
import {
  loadCanonicalParityTape,
  parityTapeCaseIds,
  validateParityTape,
} from "./harness/parityTape.ts";
import { protocolFixturePath } from "./harness/paths.ts";
import { readFileSync } from "node:fs";

describe("canonical replay/Git parity tape", () => {
  it("loads every named transition family and validates every message", () => {
    const tape = loadCanonicalParityTape();
    const families = new Set(tape.cases.map((entry) => entry.family));

    expect(tape.id).toBe("remote-v3-replay-git-state-parity");
    expect(tape.protocolVersion).toBe(3);
    expect(families).toEqual(
      new Set([
        "lifecycle",
        "agent-status",
        "git-summaries",
        "git-state",
        "git-interests",
        "sequencing",
      ]),
    );
    expect(new Set(parityTapeCaseIds()).size).toBe(tape.cases.length);
    expect(
      validateParityTape(
        JSON.parse(readFileSync(protocolFixturePath("replay-git-state-parity-tape.json"), "utf8")),
      ),
    ).toMatchObject({
      id: tape.id,
      protocolVersion: tape.protocolVersion,
    });
  });

  it("keeps optional parity snapshot fields at an additive test seam", () => {
    const snapshot = buildParitySnapshot(7, {
      gitSummariesByThread: {
        "thread-parity": {
          isRepo: false,
          branch: "",
          totalInsertions: 0,
          totalDeletions: 0,
          ahead: 0,
          behind: 0,
          pr: null,
        },
      },
      gitState: {
        revision: 5,
        projects: {},
        targets: {},
        pullRequests: {},
        pullRequestKeyByBranch: {},
        projectPullRequestLists: {},
      },
      agentCaches: { windows: { loaded: false }, wsl: { loaded: false } },
    });

    expect(snapshot).toMatchObject({
      snapshotSeq: 7,
      gitSummariesByThread: { "thread-parity": { isRepo: false } },
      agentCaches: { windows: { loaded: false } },
    });
  });
});
