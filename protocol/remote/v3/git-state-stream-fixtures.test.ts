import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { gitStateInterestSchema } from "../../../src/shared/gitState";
import {
  remoteGitStateEventSchema,
  remoteGitSummariesEventSchema,
  remoteWebSocketClientMessageSchema,
  remoteWebSocketServerMessageSchema,
} from "../../../src/shared/remote/protocol";

const contractDirectory = dirname(fileURLToPath(import.meta.url));

interface GitStateFixture {
  readonly client: unknown;
  readonly server: readonly unknown[];
}

function fixture(): GitStateFixture {
  return JSON.parse(
    readFileSync(join(contractDirectory, "fixtures/git-state-stream.json"), "utf8"),
  ) as GitStateFixture;
}

describe("remote v3 git-state stream fixtures", () => {
  it("covers every interest discriminator in one canonical client message", () => {
    const parsed = remoteWebSocketClientMessageSchema.parse(fixture().client);
    if (parsed.type !== "git-state-interests") {
      throw new Error("Expected git-state-interests fixture");
    }
    expect(parsed.interests.map((interest) => interest.kind)).toEqual([
      "target",
      "pull-request",
      "project-pull-requests",
    ]);
    for (const interest of parsed.interests) {
      expect(gitStateInterestSchema.parse(interest)).toEqual(interest);
    }
  });

  it("validates summary and patch events inside contiguous sequenced envelopes", () => {
    const parsed = fixture().server.map((message) =>
      remoteWebSocketServerMessageSchema.parse(message),
    );
    expect(parsed.map((message) => (message.type === "event" ? message.seq : -1))).toEqual([
      41, 42,
    ]);
    const events = parsed.flatMap((message) => (message.type === "event" ? [message.event] : []));
    expect(remoteGitSummariesEventSchema.parse(events[0])).toEqual(events[0]);
    expect(remoteGitStateEventSchema.parse(events[1])).toEqual(events[1]);
  });

  it("enforces the 500-interest bound and exact variant constraints", () => {
    const interest = { kind: "project-pull-requests", projectId: "project-1" } as const;
    expect(
      remoteWebSocketClientMessageSchema.parse({
        type: "git-state-interests",
        interests: Array.from({ length: 500 }, () => interest),
      }),
    ).toBeDefined();
    expect(() =>
      remoteWebSocketClientMessageSchema.parse({
        type: "git-state-interests",
        interests: Array.from({ length: 501 }, () => interest),
      }),
    ).toThrow(/expected array to have <=500 items/);
    expect(() =>
      gitStateInterestSchema.parse({ kind: "pull-request", projectId: "project-1", prNumber: 0 }),
    ).toThrow(/expected number to be >0/);
    expect(() =>
      gitStateInterestSchema.parse({ kind: "target", projectId: "", worktreePath: "/repo" }),
    ).toThrow(/expected string to have >=1 characters/);
  });
});
