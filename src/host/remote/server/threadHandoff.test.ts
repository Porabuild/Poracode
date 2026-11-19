import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  agentCapabilitySchema,
  emptyMcpLaunchSnapshot,
  type Project,
  type StartThreadPayload,
  type Thread,
} from "@/shared/contracts";
import { threadHandoffInputSchema } from "@/shared/contracts/threadHandoff";
import { ThreadLaunchFailedRefusalError } from "@/shared/threadLaunchRefusal";
import { closeDatabase, initDatabase } from "@/host/db/connection";
import { dbGetThread, dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { dbGetThreadRuntimeItems, dbReplaceThreadRuntimeSnapshot } from "@/host/db/runtimeItems";
import { nativeBindingEnv, testThread } from "@/host/db/runtimeItems.testFixtures";
import type { RemoteServerContext } from "./context";
import { handoffHostThread } from "./threadHandoff";

const sourceThreadId = "thread-1";
const sourceKind = "fixture-source";
const targetKind = "fixture-target";
let directory: string;
let project: Project;
let source: Thread;

beforeEach(async () => {
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  initDatabase(":memory:");
  mkdirSync("tmp", { recursive: true });
  directory = mkdtempSync(resolve("tmp/app-thread-handoff-"));
  project = {
    id: "project-1",
    name: "Project",
    location: { kind: "posix", path: join(directory, "project") },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  source = {
    ...testThread(),
    agentKind: sourceKind,
    agentInstanceId: "source-profile",
    worktreePath: join(directory, "checkout"),
    worktreeBranch: "fixture-branch",
    status: "idle",
  };
  dbUpsertProject(project, 0);
  dbUpsertThread(source, 11);
  await dbReplaceThreadRuntimeSnapshot(
    source.id,
    [
      {
        id: "first-message",
        type: "user_message",
        state: "completed",
        payload: { content: [{ kind: "text", text: "Keep this exact earlier request." }] },
        streams: {},
      },
    ],
    [],
    null,
  );
});

afterEach(() => {
  closeDatabase();
  delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  rmSync(directory, { recursive: true, force: true });
});

function fixture(input?: {
  disableReadThread?: boolean;
  failLaunch?: boolean;
  retired?: boolean;
  beforeLaunch?: (payload: StartThreadPayload) => void;
}) {
  const calls = vi.fn<RemoteServerContext["options"]["callSupervisor"]>(
    async (name, raw, options) => {
      switch (name) {
        case "gitListWorktrees":
          return {
            worktrees: [
              { path: source.worktreePath, branch: source.worktreeBranch, isMain: false },
            ],
          } as never;
        case "getAgentStatuses":
          return {
            windows: [sourceKind, targetKind].map((kind) => ({
              kind,
              label: kind,
              installed: true,
              capabilities: agentCapabilitySchema.parse({
                presentationMode: "gui",
                presentationModes: ["gui", "terminal"],
                mcpScope: { gui: "launch" },
              }),
            })),
            wsl: [],
          } as never;
        case "getThreadSnapshots":
          return [
            { threadId: sourceThreadId, agentKind: sourceKind, threadMentionToolsAvailable: true },
          ] as never;
        case "extractContext":
          return {
            summary: "An extracted terminal session.",
            sourceProvider: sourceKind,
            sourceSessionId: "old-session",
            extractedAt: "2026-11-18T10:00:00.000Z",
          } as never;
        case "startThread": {
          const payload = raw as StartThreadPayload;
          input?.beforeLaunch?.(payload);
          options?.assertLaunchCurrent?.();
          if (input?.failLaunch) throw new Error("Supervisor connection lost");
          return { threadId: payload.threadId } as never;
        }
        case "closeThreadConfirmed":
          return { confirmed: input?.retired ?? true } as never;
        default:
          throw new Error(`Unexpected procedure ${name}`);
      }
    },
  );
  const dispatch = vi.fn<NonNullable<RemoteServerContext["options"]["dispatchThreadCommand"]>>();
  const publish = vi.fn<RemoteServerContext["publishThreadsChanged"]>();
  const ctx = {
    publishThreadsChanged: publish,
    options: {
      callSupervisor: calls,
      dispatchThreadCommand: dispatch,
      runThreadMutation: vi.fn<NonNullable<RemoteServerContext["options"]["runThreadMutation"]>>(
        (_threadId, operation) => operation(),
      ),
      resolveMcpLaunchSnapshot: () => ({
        ...emptyMcpLaunchSnapshot(),
        disabledBuiltInMcpTools: input?.disableReadThread
          ? { "app-controls": ["read_thread"] }
          : {},
      }),
    },
  } as unknown as RemoteServerContext;
  return { ctx, calls, dispatch, publish };
}

function request(overrides?: Record<string, unknown>) {
  return threadHandoffInputSchema.parse({
    sourceThreadId,
    agentKind: targetKind,
    agentInstanceId: "target-profile",
    config: { model: "target-model", fast: false, approvalPolicy: "ask" },
    presentationMode: "gui",
    operationKey: "handoff-001",
    intent: "switch",
    ...overrides,
  });
}

describe("host-owned provider handoff", () => {
  it("switches a Chat in place while preserving transcript, checkout and selected account", async () => {
    const f = fixture();
    const result = await handoffHostThread(f.ctx, directory, request());
    expect(result).toEqual({
      threadId: sourceThreadId,
      sourceThreadId,
      mode: "in_place",
      context: "thread-transcript",
      sourceDisposition: "continued",
    });
    expect(dbGetThread(sourceThreadId)).toMatchObject({
      title: source.title,
      agentKind: targetKind,
      agentInstanceId: "target-profile",
      worktreePath: source.worktreePath,
      config: request().config,
    });
    expect((await dbGetThreadRuntimeItems(sourceThreadId)).map((item) => item.id)).toEqual([
      "first-message",
    ]);
    expect(f.calls).toHaveBeenLastCalledWith(
      "startThread",
      expect.objectContaining({
        projectLocation: { kind: "posix", path: source.worktreePath },
        providerSwitch: {
          fromAgentKind: sourceKind,
          contextStrategy: "thread-transcript",
          handoffItemId: expect.any(String),
        },
      }),
      expect.objectContaining({ skipThreadMutation: true }),
    );
    await expect(handoffHostThread(f.ctx, directory, request())).resolves.toEqual(result);
    expect(f.calls.mock.calls.filter(([name]) => name === "startThread")).toHaveLength(1);
  });

  it("stores actual Chat history for a fork when transcript access is disabled", async () => {
    const f = fixture({ disableReadThread: true });
    const result = await handoffHostThread(f.ctx, directory, request({ intent: "fork" }));
    expect(result).toMatchObject({
      mode: "fork",
      context: "context-file",
      sourceDisposition: "open",
    });
    const launched = f.calls.mock.calls.find(
      ([name]) => name === "startThread",
    )?.[1] as StartThreadPayload;
    const attachment = launched.segments?.find((segment) => segment.kind === "attachment");
    expect(attachment?.path).toBeTruthy();
    expect(readFileSync(attachment!.path, "utf8")).toContain("Keep this exact earlier request.");
    expect(launched).not.toHaveProperty("mentionHandoff");
    expect(dbGetThread(sourceThreadId)).toMatchObject({ agentKind: sourceKind, done: false });
    expect(dbGetThread(result.threadId)).toMatchObject({
      title: `${source.title} (fork)`,
      worktreePath: source.worktreePath,
      groupId: dbGetThread(sourceThreadId)?.groupId,
    });
  });

  it("uses a source mention on a Chat fork without creating a context file", async () => {
    const f = fixture();
    const result = await handoffHostThread(f.ctx, directory, request({ intent: "fork" }));
    expect(result).toMatchObject({ mode: "fork", context: "thread-transcript" });
    expect(f.calls).toHaveBeenLastCalledWith(
      "startThread",
      expect.objectContaining({
        threadId: result.threadId,
        mentionHandoff: true,
        segments: expect.arrayContaining([
          { kind: "thread", threadId: sourceThreadId, title: source.title },
        ]),
      }),
      expect.objectContaining({ assertLaunchCurrent: expect.any(Function) }),
    );
  });

  it.each([
    { retired: true, expected: "done" },
    { retired: false, expected: "open" },
  ])(
    "continues a Terminal session in a replacement and reports source as $expected",
    async ({ retired, expected }) => {
      dbUpsertThread(
        {
          ...source,
          presentationMode: "terminal",
          sessionRef: {
            providerSessionId: "old-session",
            discoveredAt: "2026-11-18T09:00:00.000Z",
          },
        },
        11,
      );
      const f = fixture({ retired });
      const selection = { model: "extractor", effort: "high" };
      const result = await handoffHostThread(
        f.ctx,
        directory,
        request({ extractionSelection: selection }),
      );
      expect(result).toMatchObject({
        mode: "replacement",
        context: "context-file",
        sourceDisposition: expected,
      });
      expect(f.calls).toHaveBeenCalledWith(
        "extractContext",
        expect.objectContaining({
          threadId: sourceThreadId,
          worktreePath: source.worktreePath,
          selection,
        }),
      );
      const steps = f.calls.mock.calls.map(([name]) => name);
      expect(steps.indexOf("startThread")).toBeLessThan(steps.indexOf("closeThreadConfirmed"));
      expect(dbGetThread(sourceThreadId)?.done).toBe(retired);
    },
  );

  it("preserves the target row when start may have taken effect, with no automatic replay", async () => {
    const f = fixture({ failLaunch: true });
    await expect(handoffHostThread(f.ctx, directory, request())).rejects.toThrow(
      "Supervisor connection lost",
    );
    expect(dbGetThread(sourceThreadId)?.agentKind).toBe(targetKind);
    await expect(handoffHostThread(f.ctx, directory, request())).rejects.toThrow(
      "outcome is uncertain",
    );
    expect(f.calls.mock.calls.filter(([name]) => name === "startThread")).toHaveLength(1);
  });

  it("keeps an intervening archive and rename when an in-place switch is refused before dispatch", async () => {
    const f = fixture({
      beforeLaunch: () => {
        dbUpsertThread(
          { ...dbGetThread(sourceThreadId)!, archived: true, title: "Edited title" },
          11,
        );
      },
    });
    await expect(handoffHostThread(f.ctx, directory, request())).rejects.toThrow(
      "source thread or checkout changed",
    );
    expect(dbGetThread(sourceThreadId)).toMatchObject({
      agentKind: sourceKind,
      agentInstanceId: source.agentInstanceId,
      archived: true,
      title: "Edited title",
    });
  });

  it("cancels a pending fork before dispatch when its source is archived", async () => {
    let targetId: string | undefined;
    const f = fixture({
      beforeLaunch: (payload) => {
        targetId = payload.threadId;
        dbUpsertThread({ ...dbGetThread(sourceThreadId)!, archived: true }, 11);
      },
    });
    await expect(handoffHostThread(f.ctx, directory, request({ intent: "fork" }))).rejects.toThrow(
      "source thread or checkout changed",
    );
    expect(targetId).toBeTruthy();
    expect(dbGetThread(targetId!)).toBeNull();
    expect(dbGetThread(sourceThreadId)?.archived).toBe(true);
  });

  it("cleans up a definitively refused replacement while preserving the source", async () => {
    let targetId: string | undefined;
    const f = fixture({
      beforeLaunch: (payload) => {
        targetId = payload.threadId;
        throw new ThreadLaunchFailedRefusalError("No runtime started");
      },
    });
    const input = request({ intent: "fork" });
    await expect(handoffHostThread(f.ctx, directory, input)).rejects.toThrow("No runtime started");
    expect(targetId).toBeTruthy();
    expect(dbGetThread(targetId!)).toBeNull();
    expect(dbGetThread(sourceThreadId)).toMatchObject({ agentKind: sourceKind, done: false });
    await expect(handoffHostThread(f.ctx, directory, input)).rejects.toThrow("already failed");
  });

  it("uses a context-free prompt without reading or extracting the source conversation", async () => {
    const f = fixture();
    const result = await handoffHostThread(
      f.ctx,
      directory,
      request({ intent: "fork", withoutContext: true }),
    );
    expect(result.context).toBe("none");
    expect(f.calls.mock.calls.map(([name]) => name)).toEqual([
      "gitListWorktrees",
      "getAgentStatuses",
      "startThread",
    ]);
    expect(f.calls).toHaveBeenLastCalledWith(
      "startThread",
      expect.objectContaining({
        prompt: "Continue the task using the current checkout.",
      }),
      expect.objectContaining({ assertLaunchCurrent: expect.any(Function) }),
    );
  });
});
