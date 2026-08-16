import { readFileSync } from "node:fs";
import type { RemoteScope } from "./constants.ts";
import { loadProtocolManifest } from "./manifest.ts";
import { protocolFixturePath } from "./paths.ts";

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(protocolFixturePath(name), "utf8")) as unknown;
}

export const FIXTURE_THREAD_ID = "thread-fixture-001";
export const FIXTURE_PROJECT_ID = "project-fixture-001";
export const FIXTURE_TERMINAL_ID = "terminal-fixture-001";

export function buildEnvironmentDescriptor(input: {
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
  readonly desktopId: string;
  readonly label: string;
  readonly appVersion: string;
  readonly scopes: readonly string[];
}): Record<string, unknown> {
  const platform =
    process.platform === "darwin" || process.platform === "linux" ? process.platform : undefined;
  const manifest = loadProtocolManifest();
  return {
    protocolVersion: manifest.protocolVersion,
    hostMode: "helper",
    desktopId: input.desktopId,
    label: input.label,
    appVersion: input.appVersion,
    ...(platform ? { platform } : {}),
    auth: {
      policy: "remote-reachable",
      bootstrapMethods: ["one-time-token"],
      sessionMethods: ["bearer-access-token"],
      scopes: [...input.scopes],
    },
    endpoints: {
      httpBaseUrl: input.httpBaseUrl,
      wsBaseUrl: input.wsBaseUrl,
    },
    capabilities: {
      terminalCursorSync: {
        versions: [1],
      },
    },
  };
}

export function buildShellSnapshot(snapshotSeq: number): Record<string, unknown> {
  const fixture = readFixture("shell-snapshot.json") as Record<string, unknown>;
  return { ...fixture, snapshotSeq };
}

export function buildThreadHistory(snapshotSeq: number): Record<string, unknown> {
  const fixture = readFixture("thread-history.json") as Record<string, unknown>;
  return { ...fixture, snapshotSeq };
}

export function buildRuntimeEvent(
  type: string,
  threadId = FIXTURE_THREAD_ID,
): Record<string, unknown> {
  const events = readFixture("runtime-events.json") as Array<Record<string, unknown>>;
  const fixture = events.find((event) => event.type === type);
  if (!fixture) throw new Error(`No authoritative runtime-event fixture for ${type}`);
  return { ...structuredClone(fixture), threadId };
}

export function buildReplayableEvent(
  type: string,
  threadId = FIXTURE_THREAD_ID,
): Record<string, unknown> {
  switch (type) {
    case "thread-runtime-event":
      return {
        type,
        threadId,
        event: buildRuntimeEvent("content.delta", threadId),
      };
    case "thread-runtime-events":
      return {
        type,
        threadId,
        events: [buildRuntimeEvent("content.delta", threadId)],
      };
    case "thread-runtime-events-multi":
      return {
        type,
        batches: [
          {
            threadId,
            events: [buildRuntimeEvent("content.delta", threadId)],
          },
        ],
      };
    case "thread-state":
      return {
        type,
        threadId,
        status: "idle",
        attention: "none",
        canResumeWithConfig: false,
      };
    case "thread-pending-steer":
      return {
        type,
        threadId,
        pending: { id: "steer-fixture-001", prompt: "steer", stagedAt: 1_786_543_200_000 },
      };
    case "thread-reset":
      return { type, threadId };
    case "thread-exited":
      return { type, threadId, exitCode: 0 };
    case "agent-status-updated":
      return {
        type,
        status: {
          kind: "codex",
          label: "Codex",
          installed: true,
          authState: "authenticated",
          capabilities: {},
        },
      };
    case "windows-agent-statuses":
    case "wsl-agent-statuses":
      return { type, statuses: [] };
    case "remote-git-summaries":
      return {
        type,
        summaries: {
          [threadId]: {
            isRepo: true,
            branch: "main",
            totalInsertions: 0,
            totalDeletions: 0,
            ahead: 0,
            behind: 0,
            pr: null,
          },
        },
      };
    case "remote-git-state":
      return { type, patch: { revision: 1 } };
    case "remote-projects-changed": {
      const shell = readFixture("shell-snapshot.json") as { projects: unknown[] };
      return { type, projects: structuredClone(shell.projects) };
    }
    case "remote-threads-changed":
      return { type, threadIds: [threadId] };
    default:
      return { type, threadId };
  }
}

export function allRuntimeEventFixtures(): Record<string, unknown>[] {
  const events = readFixture("runtime-events.json") as Array<Record<string, unknown>>;
  const byType = new Map<string, Record<string, unknown>>();
  for (const event of events)
    if (!byType.has(String(event.type))) byType.set(String(event.type), event);
  return [...byType.values()].map((event) => structuredClone(event));
}

export function allReplayableEventFixtures(): Record<string, unknown>[] {
  return loadProtocolManifest().webSocket.replayableEventTypes.map((type) =>
    buildReplayableEvent(type),
  );
}

export function defaultGrantedScopes(scopes: readonly string[]): readonly RemoteScope[] {
  return scopes as readonly RemoteScope[];
}
