import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { agentStatusSchema } from "../../../src/shared/contracts";
import {
  remoteGitStateEventSchema,
  remoteGitSummariesEventSchema,
  remoteWebSocketServerMessageSchema,
} from "../../../src/shared/remote/protocol";

const contractDirectory = dirname(fileURLToPath(import.meta.url));

const threadResetSchema = z.object({
  type: z.literal("thread-reset"),
  threadId: z.string().min(1),
});
const threadExitedSchema = z.object({
  type: z.literal("thread-exited"),
  threadId: z.string().min(1),
  exitCode: z.number().int().nullable(),
});
const agentStatusUpdatedSchema = z.object({
  type: z.literal("agent-status-updated"),
  status: agentStatusSchema,
});
const windowsAgentStatusesSchema = z.object({
  type: z.literal("windows-agent-statuses"),
  statuses: z.array(agentStatusSchema),
});
const wslAgentStatusesSchema = z.object({
  type: z.literal("wsl-agent-statuses"),
  statuses: z.array(agentStatusSchema),
});

const replayableStateEventSchema = z.discriminatedUnion("type", [
  threadResetSchema,
  threadExitedSchema,
  agentStatusUpdatedSchema,
  windowsAgentStatusesSchema,
  wslAgentStatusesSchema,
  remoteGitSummariesEventSchema,
  remoteGitStateEventSchema,
]);

interface FixtureCase {
  readonly id: string;
  readonly event: unknown;
}

function fixture(): readonly FixtureCase[] {
  const value = JSON.parse(
    readFileSync(join(contractDirectory, "fixtures/replayable-state-events.json"), "utf8"),
  ) as { readonly events: readonly FixtureCase[] };
  return value.events;
}

describe("remote v3 replayable state-event fixtures", () => {
  it("covers every still-unported replayable type with null-exit semantics", () => {
    const parsed = fixture().map((entry) => replayableStateEventSchema.parse(entry.event));
    expect(parsed.map((event) => event.type)).toEqual([
      "thread-reset",
      "thread-exited",
      "thread-exited",
      "agent-status-updated",
      "windows-agent-statuses",
      "wsl-agent-statuses",
      "remote-git-summaries",
      "remote-git-state",
    ]);
    expect(new Set(parsed.map((event) => event.type))).toEqual(
      new Set([
        "thread-reset",
        "thread-exited",
        "agent-status-updated",
        "windows-agent-statuses",
        "wsl-agent-statuses",
        "remote-git-summaries",
        "remote-git-state",
      ]),
    );
    const exits = parsed.filter((event) => event.type === "thread-exited");
    expect(exits.map((event) => event.exitCode)).toEqual([0, null]);
  });

  it("keeps every event valid inside the sequenced WebSocket envelope", () => {
    for (const [index, entry] of fixture().entries()) {
      const envelope = { type: "event", seq: index + 1, event: entry.event };
      expect(remoteWebSocketServerMessageSchema.parse(envelope)).toEqual(envelope);
    }
  });

  it("materializes authoritative agent capability defaults", () => {
    const events = fixture().map((entry) => replayableStateEventSchema.parse(entry.event));
    const update = events.find((event) => event.type === "agent-status-updated");
    if (!update || update.type !== "agent-status-updated") {
      throw new Error("Missing agent-status-updated fixture");
    }
    expect(update.status.capabilities).toMatchObject({
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "server",
      presentationMode: "gui",
    });

    const wsl = events.find((event) => event.type === "wsl-agent-statuses");
    if (!wsl || wsl.type !== "wsl-agent-statuses") {
      throw new Error("Missing wsl-agent-statuses fixture");
    }
    expect(wsl.statuses).toEqual([]);
  });

  it("rejects malformed lifecycle, agent, summary, and patch payloads", () => {
    expect(() => threadResetSchema.parse({ type: "thread-reset", threadId: "" })).toThrow(
      /expected string to have >=1 characters/,
    );
    expect(() =>
      threadExitedSchema.parse({ type: "thread-exited", threadId: "t", exitCode: 1.5 }),
    ).toThrow(/expected int/);
    expect(() =>
      agentStatusUpdatedSchema.parse({
        type: "agent-status-updated",
        status: { kind: "codex", label: "", installed: true },
      }),
    ).toThrow(/expected string to have >=1 characters/);
    expect(() =>
      remoteGitSummariesEventSchema.parse({
        type: "remote-git-summaries",
        summaries: { t: { isRepo: true, branch: "main", totalInsertions: -1 } },
      }),
    ).toThrow(/expected number to be >=0/);
    expect(() =>
      remoteGitStateEventSchema.parse({ type: "remote-git-state", patch: { revision: 0 } }),
    ).toThrow(/Invalid Git state patch/);
  });
});
