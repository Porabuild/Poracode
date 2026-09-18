import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { agentStatusSchema, type AgentStatus } from "../../../src/shared/contracts";
import {
  applyGitStatePatch,
  gitProjectKey,
  gitTargetKey,
  emptyGitStateSnapshot,
  pullRequestBranchKey,
  pullRequestKey,
  type GitStateSnapshot,
} from "../../../src/shared/gitState";
import {
  buildRemoteGitTargetInterests,
  MAX_REMOTE_GIT_TARGET_INTERESTS,
} from "../../../src/shared/gitStateInterestPolicy";
import {
  PORACODE_REMOTE_PROTOCOL_VERSION,
  remoteGitStateEventSchema,
  remoteGitSummariesEventSchema,
  remoteWebSocketClientMessageSchema,
  remoteWebSocketServerMessageSchema,
} from "../../../src/shared/remote/protocol";
import { gitStateSnapshotWireSchema } from "../../../src/shared/remote/contract/gitStateWire";

const here = fileURLToPath(new URL(".", import.meta.url));
const fixturePath = join(here, "fixtures/replay-git-state-parity-tape.json");

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
const replayableEventSchema = z.discriminatedUnion("type", [
  threadResetSchema,
  threadExitedSchema,
  agentStatusUpdatedSchema,
  windowsAgentStatusesSchema,
  wslAgentStatusesSchema,
  remoteGitSummariesEventSchema,
  remoteGitStateEventSchema,
]);
type ReplayableEvent = z.infer<typeof replayableEventSchema>;

interface ThreadState {
  readonly transcript: string;
  readonly pendingSteerId: string | null;
  readonly terminalWatchIntent: boolean;
  readonly terminalBaseline: { readonly generation: string; readonly outputLength: number };
}

interface Tape {
  readonly protocolVersion: number;
  readonly lifecycle: { readonly transitions: readonly Transition[] };
  readonly agentStatus: {
    readonly identityFormula: readonly string[];
    readonly neverLoaded: { readonly windows: boolean; readonly wsl: boolean };
    readonly events: readonly AgentStatusStep[];
  };
  readonly gitSummaries: { readonly events: readonly SummaryStep[] };
  readonly gitState: GitStateTape;
  readonly gitInterests: GitInterestTape;
  readonly sequencing: {
    readonly outOfBandTypes: readonly string[];
    readonly messages: readonly SequenceStep[];
  };
}

interface Transition {
  readonly message: unknown;
  readonly before: Readonly<Record<string, ThreadState>>;
  readonly expectedAfter: Readonly<Record<string, ThreadState>>;
  readonly assertions: readonly string[];
}

interface AgentStatusStep {
  readonly message: unknown;
  readonly expected: {
    readonly updated: readonly string[];
    readonly windows: readonly string[];
    readonly wsl: readonly string[];
    readonly loaded: { readonly windows: boolean; readonly wsl: boolean };
  };
}

interface SummaryStep {
  readonly message: unknown;
  readonly expectedThreadIds: readonly string[];
}

interface GitStatePatchStep {
  readonly message: unknown;
  readonly expected: {
    readonly disposition: "applied" | "ignored";
    readonly revision: number;
    readonly targetKeys: readonly string[];
  };
}

interface GitStateTape {
  readonly keys: Readonly<Record<string, string>>;
  readonly initialSnapshot: unknown;
  readonly patches: readonly GitStatePatchStep[];
  readonly expectedFinalSnapshot: unknown;
}

interface InterestThread {
  readonly id: string;
  readonly projectId: string;
  readonly worktreePath?: string;
  readonly status:
    | "inactive"
    | "launching"
    | "working"
    | "idle"
    | "finished"
    | "needs_approval"
    | "needs_reply"
    | "error";
  readonly archived: boolean;
  readonly updatedAt: string;
}

interface GitInterestTape {
  readonly threads: readonly InterestThread[];
  readonly selectedThreadId: string;
  readonly expectedPassiveTargetInterests: readonly unknown[];
  readonly messages: readonly { readonly message: unknown }[];
  readonly explicitPullRequestUiInterest: unknown;
}

interface SequenceStep {
  readonly message: unknown;
  readonly expected: {
    readonly disposition:
      | "ready"
      | "applied"
      | "duplicate"
      | "gap"
      | "authoritative-resync"
      | "out-of-band";
    readonly cursor: number;
  };
}

function fixture(): Tape {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as Tape;
}

function parseReplayableMessage(message: unknown): ReplayableEvent {
  const envelope = remoteWebSocketServerMessageSchema.parse(message);
  if (envelope.type !== "event") throw new Error("Expected a sequenced event envelope.");
  return replayableEventSchema.parse(envelope.event);
}

function statusIdentity(status: Pick<AgentStatus, "kind" | "envKind" | "envDistro">): string {
  return [status.kind, status.envKind ?? "", status.envDistro ?? ""].join("|");
}

function snapshotWithDefaults(snapshot: unknown): GitStateSnapshot {
  return gitStateSnapshotWireSchema.parse(snapshot) as GitStateSnapshot;
}

function symbolicKeys(keys: Readonly<Record<string, string>>, names: readonly string[]): string[] {
  return names.map((name) => keys[name]!);
}

describe("remote v3 replay/Git-state parity tape", () => {
  it("uses protocol v3 without introducing a version boundary", () => {
    const tape = fixture();
    expect(tape.protocolVersion).toBe(PORACODE_REMOTE_PROTOCOL_VERSION);
  });

  it("parses lifecycle transitions and preserves their native-facing assertions", () => {
    const tape = fixture();
    const events = tape.lifecycle.transitions.map((transition) => {
      const event = parseReplayableMessage(transition.message);
      expect(transition.before).toHaveProperty(
        event.type === "thread-reset" || event.type === "thread-exited" ? event.threadId : "",
      );
      expect(transition.expectedAfter).toHaveProperty(
        event.type === "thread-reset" || event.type === "thread-exited" ? event.threadId : "",
      );
      return event;
    });

    expect(events.map((event) => event.type)).toEqual([
      "thread-reset",
      "thread-reset",
      "thread-exited",
      "thread-exited",
    ]);
    expect(
      events.filter((event) => event.type === "thread-reset").map((event) => event.threadId),
    ).toEqual(["thread-target", "thread-other"]);
    expect(
      events.filter((event) => event.type === "thread-exited").map((event) => event.exitCode),
    ).toEqual([17, null]);

    const targetReset = tape.lifecycle.transitions[0]!;
    expect(targetReset.expectedAfter["thread-target"]).toMatchObject({
      transcript: "",
      pendingSteerId: null,
      terminalWatchIntent: true,
      terminalBaseline: { generation: "generation-fresh-target", outputLength: 0 },
    });
    expect(targetReset.expectedAfter["thread-other"]).toEqual(targetReset.before["thread-other"]);

    const targetExit = tape.lifecycle.transitions[2]!;
    expect(targetExit.expectedAfter["thread-target"]).toMatchObject({
      transcript: targetExit.before["thread-target"]!.transcript,
      pendingSteerId: null,
      terminalWatchIntent: true,
    });
    expect(targetExit.expectedAfter["thread-other"]).toEqual(targetExit.before["thread-other"]);

    const nullExit = tape.lifecycle.transitions[3]!;
    expect(nullExit.expectedAfter["thread-other"]).toMatchObject({
      transcript: nullExit.before["thread-other"]!.transcript,
      pendingSteerId: null,
    });
    expect([...targetReset.assertions, ...targetExit.assertions, ...nullExit.assertions]).toEqual(
      expect.arrayContaining([
        "clear-only-thread-target",
        "preserve-transcript-on-exit",
        "clear-pending-steer-on-exit",
        "preserve-terminal-watch-intent-with-fresh-baseline",
      ]),
    );
  });

  it("merges agent updates by the exact environment identity and replaces loaded lists", () => {
    const tape = fixture();
    expect(tape.agentStatus.identityFormula).toEqual(["kind", "envKind", "envDistro"]);
    expect(tape.agentStatus.neverLoaded).toEqual({ windows: false, wsl: false });
    const merged = new Map<string, AgentStatus>();
    let windows: AgentStatus[] = [];
    let wsl: AgentStatus[] = [];
    let windowsLoaded = tape.agentStatus.neverLoaded.windows;
    let wslLoaded = tape.agentStatus.neverLoaded.wsl;

    for (const step of tape.agentStatus.events) {
      const event = parseReplayableMessage(step.message);
      if (event.type === "agent-status-updated")
        merged.set(statusIdentity(event.status), event.status);
      if (event.type === "windows-agent-statuses") {
        windows = event.statuses;
        windowsLoaded = true;
      }
      if (event.type === "wsl-agent-statuses") {
        wsl = event.statuses;
        wslLoaded = true;
      }
      expect({
        updated: [...merged.keys()],
        windows: windows.map(statusIdentity),
        wsl: wsl.map(statusIdentity),
        loaded: { windows: windowsLoaded, wsl: wslLoaded },
      }).toEqual(step.expected);
    }

    expect([...merged.keys()]).toEqual([
      "codex|posix|",
      "codex|windows|",
      "codex|wsl|Ubuntu",
      "codex|wsl|Debian",
    ]);
    expect(windows).toEqual([]);
    expect(wsl).toEqual([]);
    expect({ windows: windowsLoaded, wsl: wslLoaded }).toEqual({ windows: true, wsl: true });
    expect(new Set([...merged.keys()].map((key) => key.split("|")[0]))).toEqual(new Set(["codex"]));
  });

  it("treats compact Git summaries as full replacements", () => {
    const tape = fixture();
    let summaries: Record<string, unknown> = {};
    const snapshots: Record<string, unknown>[] = [];
    for (const step of tape.gitSummaries.events) {
      const event = parseReplayableMessage(step.message);
      if (event.type !== "remote-git-summaries") throw new Error("Expected a Git summaries event.");
      summaries = event.summaries;
      snapshots.push(summaries);
      expect(Object.keys(summaries).sort()).toEqual([...step.expectedThreadIds].sort());
    }
    expect(snapshots[1]).toEqual({});
    expect(Object.keys(summaries)).toEqual(["thread-summary-c"]);
    expect(summaries["thread-summary-c"]).toMatchObject({ branch: "release/naïve-路径", pr: null });
  });

  it("applies real Git-state patch revisions and reaches the exact final snapshot", () => {
    const tape = fixture();
    const projectRef = { hostId: "desktop-fixture", projectId: "project-alpha" };
    expect(tape.gitState.keys.project).toBe(gitProjectKey(projectRef));
    expect(tape.gitState.keys.targetMain).toBe(
      gitTargetKey({ ...projectRef, worktreePath: "/repo/main" }),
    );
    expect(tape.gitState.keys.pullRequest).toBe(pullRequestKey({ ...projectRef, prNumber: 42 }));
    expect(tape.gitState.keys.oldBranch).toBe(pullRequestBranchKey(projectRef, "feature/old"));
    expect(tape.gitState.keys.currentBranch).toBe(
      pullRequestBranchKey(projectRef, "feature/current"),
    );

    let snapshot = snapshotWithDefaults(tape.gitState.initialSnapshot);
    expect(snapshot).toEqual(emptyGitStateSnapshot());
    for (const step of tape.gitState.patches) {
      const event = parseReplayableMessage(step.message);
      if (event.type !== "remote-git-state") throw new Error("Expected a Git-state event.");
      const previous = snapshot;
      snapshot = applyGitStatePatch(snapshot, event.patch);
      expect(snapshot.revision).toBe(step.expected.revision);
      expect(Object.keys(snapshot.targets)).toEqual(
        symbolicKeys(tape.gitState.keys, step.expected.targetKeys),
      );
      expect(snapshot === previous).toBe(step.expected.disposition === "ignored");
      const omittedMapsPreserved =
        snapshot.projects === previous.projects &&
        snapshot.targets === previous.targets &&
        snapshot.pullRequests === previous.pullRequests &&
        snapshot.pullRequestKeyByBranch === previous.pullRequestKeyByBranch &&
        snapshot.projectPullRequestLists === previous.projectPullRequestLists;
      expect(event.patch.revision === 4 ? omittedMapsPreserved : true).toBe(true);
    }

    expect(snapshot).toEqual(snapshotWithDefaults(tape.gitState.expectedFinalSnapshot));
    expect(snapshot.pullRequestKeyByBranch).not.toHaveProperty(tape.gitState.keys.oldBranch);
    expect(snapshot.pullRequestKeyByBranch).toHaveProperty(
      tape.gitState.keys.currentBranch,
      tape.gitState.keys.pullRequest,
    );
  });

  it("uses the real bounded target policy and keeps review bundles explicit", () => {
    const tape = fixture();
    const passive = buildRemoteGitTargetInterests(tape.gitInterests.threads, {
      selectedThreadId: tape.gitInterests.selectedThreadId,
    });
    expect(passive).toEqual(tape.gitInterests.expectedPassiveTargetInterests);
    expect(passive).toHaveLength(MAX_REMOTE_GIT_TARGET_INTERESTS);
    expect(passive.every((interest) => interest.kind === "target")).toBe(true);
    expect(passive.every((interest) => !("includeReviewBundle" in interest))).toBe(true);
    expect(
      passive.filter(
        (interest) =>
          interest.kind === "target" &&
          interest.projectId === "project-alpha" &&
          interest.worktreePath === "/repo/shared",
      ),
    ).toHaveLength(1);
    expect(passive.some((interest) => interest.projectId === "project-zeta")).toBe(false);

    const parsedMessages = tape.gitInterests.messages.map(({ message }) =>
      remoteWebSocketClientMessageSchema.parse(message),
    );
    expect(new Set(parsedMessages[0]!.interests.map((interest) => interest.kind))).toEqual(
      new Set(["target", "pull-request", "project-pull-requests"]),
    );
    const pullRequestInterest = parsedMessages[0]!.interests.find(
      (interest) => interest.kind === "pull-request",
    );
    expect(pullRequestInterest).toEqual(tape.gitInterests.explicitPullRequestUiInterest);
    expect(parsedMessages[1]).toEqual({ type: "git-state-interests", interests: [] });
    expect(parsedMessages[0]!.interests.filter((interest) => interest.kind === "target")).toEqual(
      passive,
    );
  });

  it("keeps the cursor on ready, duplicates, gaps, and all declared out-of-band messages", () => {
    const tape = fixture();
    const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8")) as {
      webSocket: {
        readonly serverMessages: readonly string[];
        readonly outOfBandMessages: readonly string[];
      };
    };
    expect(new Set(tape.sequencing.outOfBandTypes)).toEqual(
      new Set(manifest.webSocket.outOfBandMessages),
    );
    expect(
      tape.sequencing.outOfBandTypes.every((type) =>
        manifest.webSocket.serverMessages.includes(type),
      ),
    ).toBe(true);

    let cursor = 0;
    for (const step of tape.sequencing.messages) {
      const message = remoteWebSocketServerMessageSchema.parse(step.message);
      const isOutOfBandMessage = [
        "browser-state",
        "browser-frame",
        "browser-mirror-status",
        "terminal-output",
        "terminal-watch-result",
      ].includes(message.type);
      expect(tape.sequencing.outOfBandTypes.includes(message.type)).toBe(isOutOfBandMessage);
      let disposition: SequenceStep["expected"]["disposition"];
      if (message.type === "ready") {
        disposition = "ready";
      } else if (message.type === "event") {
        parseReplayableMessage(message);
        if (message.seq === cursor + 1) {
          cursor = message.seq;
          disposition = "applied";
        } else if (message.seq <= cursor) {
          disposition = "duplicate";
        } else {
          disposition = "gap";
        }
      } else if (message.type === "resync-required") {
        cursor = message.seq;
        disposition = "authoritative-resync";
      } else {
        disposition = "out-of-band";
      }
      expect({ disposition, cursor }).toEqual(step.expected);
    }
    expect(cursor).toBe(5);
  });
});
