import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import * as fs from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { HostOwnerController } from "@/backend/ownership/HostOwnerController";
import { initDatabase, closeDatabase, getSqlite } from "@/host/db/connection";
import { dbGetThread, dbUpsertThread, dbUpsertProject } from "@/host/db";
import { dbReadThreadRuntimeItems } from "@/host/db/runtimeItems";
import {
  armRuntimeThreadForLaunch,
  beginRuntimeFence,
  flushRuntimeFence,
  releaseRuntimeFence,
} from "@/host/db/runtimePersistenceRuntime";
import { persistSupervisorEvent } from "@/host/remote/server/runtimePersistence";
import { prepareHostRunSelection } from "@/server/hostRunSelection";
import { agentStatusSchema } from "@/shared/contracts/agent";
import {
  controlThreadExecutionPayloadSchema,
  threadExecutionReservationPayloadSchema,
  controlledThreadRequestPayloadSchema,
} from "@/shared/contracts/threadExecution";
import {
  HOST_RUN_FORMAT_VERSION,
  HOST_RUN_TOOL_EVENT_FORMAT_VERSION,
  HOST_RUN_TOOL_SUMMARY_BYTES,
  hostRunMetadataSchema,
  hostRunReadSchema,
  hostRunResultSchema,
  hostRunRequestReadSchema,
  type HostRunEvent,
} from "@/shared/contracts/hostRun";
import type { BackgroundTask, RuntimeEvent, Thread } from "@/shared/contracts";
import { normalizeSharedSettings } from "@/shared/settings";
import { localMachineKey } from "@/shared/machines";
import type { SupervisorEvent } from "@/shared/ipc/events";
import { ThreadExecutionControl } from "@/supervisor/runtime/threadExecutionControl";
import { HostRuns } from "./hostRuns";
import type { AdminSupervisorCall } from "./hostProviderAuth";
import { AttachmentReclaimService } from "@/host/attachments/attachmentReclaim";
import { saveUploadedAttachmentFile } from "@/host/attachments/attachmentStorage";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn<typeof actual.open>(actual.open) };
});

const close: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of close.splice(0).reverse()) await cleanup();
  vi.restoreAllMocks();
  const actual = await vi.importActual<typeof fs>("node:fs/promises");
  vi.mocked(fs.open).mockReset().mockImplementation(actual.open);
});

async function fixture(resume = false, withFiles = false) {
  mkdirSync(resolve("tmp/cli-run-workflow-20261021"), { recursive: true });
  const root = mkdtempSync(resolve("tmp/cli-run-workflow-20261021/test-"));
  const owner = HostOwnerController.acquire(join(root, "profile"), "headless");
  const owned = await owner.initialize({ mode: "headless" });
  initDatabase(owned.paths.dbPath);
  close.push(async () => {
    closeDatabase();
    await owner.close();
  });
  dbUpsertProject(
    {
      id: "project",
      name: "Fixture",
      createdAt: new Date().toISOString(),
      location:
        process.platform === "win32"
          ? { kind: "windows", path: root }
          : { kind: "posix", path: root },
    },
    0,
  );
  const status = agentStatusSchema.parse({
    kind: "neutral",
    label: "Fixture",
    installed: true,
    authState: "authenticated",
    envKind: process.platform === "win32" ? "windows" : "posix",
    capabilities: {
      models: [{ id: "model", label: "Model" }],
      presentationMode: "gui",
      liveInputMode: "server",
      approvalPolicies: [{ id: "ask", label: "Ask" }],
      sandboxModes: [{ id: "read-only", label: "Read only" }],
      supportsResume: true,
    },
  });
  const settings = normalizeSharedSettings({});
  const abort = new AbortController();
  const context = {
    signal: abort.signal,
    assertActive() {
      owned.lease.assertActive();
      abort.signal.throwIfAborted();
    },
  };
  const launched = Promise.withResolvers<void>();
  const gates = {
    preparation: undefined as Promise<void> | undefined,
    start: undefined as Promise<void> | undefined,
    retirement: undefined as Promise<void> | undefined,
    background: undefined as Promise<BackgroundTask[]> | undefined,
    lostReservationReply: false,
  };
  let tasks: BackgroundTask[] = [],
    confirmed = true;
  const launchPort = vi.fn<ConstructorParameters<typeof ThreadExecutionControl>[0]["start"]>(
    async (payload) => {
      armRuntimeThreadForLaunch(payload.threadId!);
      launched.resolve();
      await gates.start;
      return { threadId: payload.threadId! };
    },
  );
  const retirePort = vi.fn<ConstructorParameters<typeof ThreadExecutionControl>[0]["close"]>(
    async () => {
      await gates.retirement;
      return { confirmed };
    },
  );
  const respondPort = vi.fn<
    NonNullable<ConstructorParameters<typeof ThreadExecutionControl>[0]["respond"]>
  >(async () => {});
  const controller = new ThreadExecutionControl({
    assertAvailable() {},
    start: launchPort,
    close: retirePort,
    respond: respondPort,
  });
  const call = vi.fn<AdminSupervisorCall>(async (name, payload, options) => {
    if (name === "controlledThreadRequest")
      return (await controller.request(
        controlledThreadRequestPayloadSchema.parse(payload),
      )) as never;
    if (name === "probeSelectedAgent")
      return { version: 1, agentKind: status.kind, environment: "native", status } as never;
    if (name === "readThreadBackgroundTasks")
      return (gates.background ? await gates.background : tasks) as never;
    if (name === "reserveThreadExecution") {
      const command = threadExecutionReservationPayloadSchema.parse(payload);
      const result = await controller.reserve(command);
      if (command.action === "prepare") {
        await gates.preparation;
        if (gates.lostReservationReply) throw new Error("Lost reservation reply fixture");
      }
      return result as never;
    }
    if (name === "controlThreadExecution") {
      const command = controlThreadExecutionPayloadSchema.parse(payload);
      if (command.action === "start") options?.assertLaunchCurrent?.();
      const result = await controller.control(command);
      if (command.action === "prepare") await gates.preparation;
      return result as never;
    }
    throw new Error(`Unexpected fixture call ${name}`);
  });
  const changed = vi.fn<() => void>();
  const save = vi.fn<(input: Parameters<typeof saveUploadedAttachmentFile>[1]) => Promise<string>>(
    (input) => saveUploadedAttachmentFile(owned.paths, input),
  );
  const runs = new HostRuns({
    call,
    readSettings: () => settings,
    publishCatalogChanged: changed,
    attachments: { save },
  });
  close.push(async () => {
    await runs.dispose();
    expect(await controller.dispose()).toBe(true);
  });
  const command = {
    action: "run-prepare" as const,
    projectId: "project",
    agentKind: "neutral",
    model: "model",
    approvalPolicy: "ask",
    sandboxMode: "read-only",
    prompt: "Explain the project",
  };
  const saved: Thread = {
    id: "saved",
    projectId: "project",
    agentKind: "neutral",
    title: "Keep my title",
    config: {
      model: "model",
      approvalPolicy: "ask",
      sandboxMode: "read-only",
      crossagentMcp: false,
      thinking: true,
    },
    presentationMode: "gui",
    status: "inactive",
    attention: "none",
    canResumeWithConfig: true,
    archived: false,
    done: false,
    starred: true,
    createdAt: "2026-10-20T12:00:00.000Z",
    updatedAt: "2026-10-20T12:00:00.000Z",
    groupId: "saved-group",
    groupName: "Keep group",
    worktreePath: join(root, "worktree"),
    worktreeBranch: "saved-branch",
    sessionRef: {
      providerSessionId: "fixture:original",
      discoveredAt: "2026-10-20T12:00:00.000Z",
      executionIdentity: "opaque-provider-account-scope",
    },
  };
  if (resume) {
    dbUpsertThread(saved, 7);
    armRuntimeThreadForLaunch(saved.id);
    persistSupervisorEvent({
      type: "thread-runtime-events",
      threadId: saved.id,
      events: [
        {
          type: "item.started",
          threadId: saved.id,
          itemId: "original",
          itemType: "assistant_message",
        },
        {
          type: "content.delta",
          threadId: saved.id,
          itemId: "original",
          stream: "assistant_text",
          delta: "Preserve original history",
        },
        { type: "item.completed", threadId: saved.id, itemId: "original" },
      ],
    });
    const fence = beginRuntimeFence(saved.id);
    try {
      if ((await flushRuntimeFence(fence)).kind !== "committed")
        throw new Error("Fixture history was not committed.");
    } finally {
      releaseRuntimeFence(fence);
    }
  }
  const resumeCommand = {
    action: "run-resume-prepare" as const,
    threadId: saved.id,
    prompt: "Continue the saved task",
  };
  const source = join(root, "input file.txt");
  if (withFiles) writeFileSync(source, "File contents 世界");
  const preparation = withFiles
    ? resume
      ? { ...resumeCommand, action: "run-resume-files-prepare" as const, files: [source] }
      : { ...command, action: "run-files-prepare" as const, files: [source] }
    : resume
      ? resumeCommand
      : command;
  const prepared = hostRunMetadataSchema.parse(await runs.execute(preparation, context));
  const runtime = (events: RuntimeEvent[]) => {
    for (const event of events) controller.observe(event);
    const event: SupervisorEvent = {
      type: "thread-runtime-events",
      threadId: prepared.threadId,
      events,
    };
    persistSupervisorEvent(event);
    runs.observe(event);
  };
  const idle = () => {
    const event: SupervisorEvent = {
      type: "thread-state",
      threadId: prepared.threadId,
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
    };
    persistSupervisorEvent(event);
    runs.observe(event);
  };
  const completed = () => {
    runtime([
      { type: "turn.started", threadId: prepared.threadId, turnId: "turn" },
      {
        type: "item.started",
        threadId: prepared.threadId,
        itemId: "reply",
        itemType: "assistant_message",
      },
      {
        type: "content.delta",
        threadId: prepared.threadId,
        itemId: "reply",
        stream: "assistant_text",
        delta: "Hello 世界",
      },
      { type: "item.completed", threadId: prepared.threadId, itemId: "reply" },
      { type: "turn.completed", threadId: prepared.threadId, turnId: "turn", state: "completed" },
    ]);
    idle();
  };
  return {
    runs,
    prepared,
    command,
    call,
    launchPort,
    retirePort,
    respondPort,
    launched,
    gates,
    abort,
    context,
    runtime,
    idle,
    completed,
    status,
    settings,
    changed,
    saved,
    resumeCommand,
    controller,
    source,
    save,
    fresh: {
      signal: new AbortController().signal,
      assertActive() {
        owned.lease.assertActive();
      },
    },
    tasks(value: BackgroundTask[]) {
      tasks = value;
    },
    confirm(value: boolean) {
      confirmed = value;
    },
  };
}

it.each([false, true])(
  "copies files into the exact owned storage for a saved=%s run and forwards canonical segments",
  async (resume) => {
    const f = await fixture(resume, true);
    const settings = structuredClone(f.settings);
    const starting = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
    await f.launched.promise;
    const payload = f.launchPort.mock.calls[0]![0];
    const savedPath = await f.save.mock.results[0]!.value;
    expect(payload.segments).toEqual([
      { kind: "text", content: resume ? f.resumeCommand.prompt : f.command.prompt },
      { kind: "attachment", path: savedPath, mimeType: "text/plain" },
    ]);
    expect(savedPath).not.toBe(f.source);
    expect(f.save.mock.calls[0]![0].threadId).toBe(f.prepared.threadId);
    unlinkSync(f.source);
    expect(readFileSync(savedPath, "utf8")).toBe("File contents 世界");
    expect(payload.sessionRef).toEqual(resume ? f.saved.sessionRef : undefined);
    f.completed();
    expect(hostRunResultSchema.parse(await starting).result.state).toBe("completed");
    expect(f.settings).toEqual(settings);
    expect(dbGetThread(f.prepared.threadId)?.title).toBe(resume ? f.saved.title : f.command.prompt);
  },
);

it("keeps unpublished attachment copies owned across a reclaim scan", async () => {
  const f = await fixture(false, true);
  const save = f.save.getMockImplementation()!;
  f.save.mockImplementation(async (input) => {
    const path = await save(input);
    expect(dbGetThread(input.threadId)).toBeNull();
    const scanned = Promise.withResolvers<void>();
    const reclaim = new AttachmentReclaimService({
      attachmentsDir: dirname(dirname(path)),
      listLiveThreadIds: () => {
        scanned.resolve();
        return [];
      },
      startupScanDelayMs: 0,
    });
    try {
      reclaim.start();
      await scanned.promise;
    } finally {
      await reclaim.dispose();
    }
    expect(readFileSync(path, "utf8")).toBe("File contents 世界");
    return path;
  });
  const starting = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
  await f.launched.promise;
  expect(dbGetThread(f.prepared.threadId)).not.toBeNull();
  f.completed();
  await starting;
});

it.each(["changed", "copy-error"] as const)(
  "joins reservation retirement without publishing a new row or starting a provider on %s",
  async (failure) => {
    const f = await fixture(false, true);
    if (failure === "changed") writeFileSync(f.source, "Changed after preparation");
    else
      f.save.mockImplementation(() => {
        throw new Error("Fixture copy error");
      });
    const result = hostRunResultSchema.parse(
      await f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context),
    );
    expect(result.result).toMatchObject({
      state: "failed",
      retirementConfirmed: true,
      historyCommitted: false,
    });
    expect(result.result.error).toContain(
      failure === "changed" ? "changed after preparation" : "Fixture copy error",
    );
    expect(f.launchPort).not.toHaveBeenCalled();
    expect(dbGetThread(f.prepared.threadId)).toBeNull();
    expect(f.call.mock.calls).toContainEqual([
      "controlThreadExecution",
      expect.objectContaining({ action: "cancel" }),
    ]);
  },
);

it.each(["caller", "server"] as const)(
  "joins a held file read and its descriptor during %s cancellation without launching a provider",
  async (cancelledBy) => {
    const f = await fixture(false, true);
    const original = (await vi.importActual<typeof fs>("node:fs/promises")).open;
    const entered = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>();
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
    vi.mocked(fs.open).mockImplementation(async (...args) => {
      const file = await original(...args);
      if (args[0] === f.source) {
        handle = file;
        const read = file.read.bind(file);
        vi.spyOn(file, "read").mockImplementation(async (...params) => {
          entered.resolve();
          await release.promise;
          return Reflect.apply(read, file, params);
        });
      }
      return file;
    });
    const starting = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
    let stopped = false;
    let stopping: Promise<unknown> | undefined;
    try {
      await entered.promise;
      if (cancelledBy === "caller") {
        f.abort.abort(new Error("Fixture caller gone"));
        stopping = f.runs.execute({ action: "run-cancel", runId: f.prepared.runId }, f.fresh);
      } else stopping = f.runs.dispose();
      void stopping.then(() => {
        stopped = true;
      });
      await Promise.resolve();
      expect(stopped).toBe(false);
      expect(handle!.fd).toBeGreaterThanOrEqual(0);
      expect(f.launchPort).not.toHaveBeenCalled();
      expect(dbGetThread(f.prepared.threadId)).toBeNull();
    } finally {
      release.resolve();
      await stopping;
      await starting;
    }
    expect(handle!.fd).toBe(-1);
    expect(f.launchPort).not.toHaveBeenCalled();
    expect(f.save).not.toHaveBeenCalled();
    expect(dbGetThread(f.prepared.threadId)).toBeNull();
  },
);

it("runs through the real persisted writer, reserved controller and committed history fence", async () => {
  const f = await fixture();
  const result = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
  await f.launched.promise;
  expect(dbGetThread(f.prepared.threadId)).toMatchObject({
    projectId: "project",
    config: { model: "model", approvalPolicy: "ask", sandboxMode: "read-only" },
    presentationMode: "gui",
  });
  expect(f.changed).toHaveBeenCalledOnce();
  f.completed();
  expect(hostRunResultSchema.parse(await result).result).toMatchObject({
    state: "completed",
    historyCommitted: true,
    retirementConfirmed: true,
  });
  const page = hostRunReadSchema.parse(
    await f.runs.execute({ action: "run-read", runId: f.prepared.runId, cursor: 0 }, f.context),
  );
  expect(page.events).toMatchObject([
    { type: "text.delta", text: "Hello 世界" },
    { type: "run.finished", state: "completed" },
  ]);
  expect(page.finished).toBe(true);
  expect(JSON.stringify(dbReadThreadRuntimeItems(f.prepared.threadId))).toContain("Hello 世界");
  await expect(
    f.runs.execute({ action: "run-read", runId: f.prepared.runId, cursor: 0 }, f.context),
  ).rejects.toThrow("cursor mismatch");
  for (let count = 0; count < 2; count++)
    await expect(
      f.runs.execute({ action: "run-cancel", runId: f.prepared.runId }, f.context),
    ).resolves.toMatchObject({ retired: true, threadId: f.prepared.threadId });
  await expect(
    f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context),
  ).rejects.toThrow("Unknown");
});

it("keeps legacy run streams at format 1 without tool records", async () => {
  const f = await fixture();
  const starting = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
  await f.launched.promise;
  f.runtime([
    { type: "turn.started", threadId: f.prepared.threadId, turnId: "turn" },
    {
      type: "item.started",
      threadId: f.prepared.threadId,
      itemId: "command",
      itemType: "command_execution",
      payload: { command: "git status --short" },
    },
    {
      type: "content.delta",
      threadId: f.prepared.threadId,
      itemId: "command",
      stream: "command_output",
      delta: "untrusted tool output",
    },
    {
      type: "item.completed",
      threadId: f.prepared.threadId,
      itemId: "command",
      payload: { command: "git status --short", status: "completed", exitCode: 0 },
    },
    { type: "turn.completed", threadId: f.prepared.threadId, turnId: "turn", state: "completed" },
  ]);
  f.idle();
  await starting;
  const page = hostRunReadSchema.parse(
    await f.runs.execute({ action: "run-read", runId: f.prepared.runId, cursor: 0 }, f.context),
  );
  expect(page.formatVersion).toBe(HOST_RUN_FORMAT_VERSION);
  expect(page.events.map((event) => event.type)).toEqual(["run.finished"]);
  expect(JSON.stringify(page)).not.toContain("git status");
  expect(JSON.stringify(page)).not.toContain("untrusted tool output");
});

it("emits bounded sanitized tool lifecycle records only after opt-in", async () => {
  const f = await fixture();
  f.runs.enableToolEvents(f.prepared.runId, f.prepared.threadId, f.context);
  const starting = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
  await f.launched.promise;
  f.runtime([
    { type: "turn.started", threadId: f.prepared.threadId, turnId: "turn" },
    {
      type: "item.started",
      threadId: f.prepared.threadId,
      itemId: "command",
      itemType: "command_execution",
      payload: {
        command: "git status --short --token=secret-value",
        cwd: "C:/sensitive/path",
        status: "running",
      },
    },
    {
      type: "content.delta",
      threadId: f.prepared.threadId,
      itemId: "command",
      stream: "command_output",
      delta: "private-output-value",
    },
    {
      type: "item.updated",
      threadId: f.prepared.threadId,
      itemId: "command",
      payload: { status: "running" },
    },
    {
      type: "item.completed",
      threadId: f.prepared.threadId,
      itemId: "command",
      payload: {
        command: "git status --short --token=secret-value",
        cwd: "C:/sensitive/path",
        status: "completed",
        exitCode: 0,
      },
    },
    { type: "turn.completed", threadId: f.prepared.threadId, turnId: "turn", state: "completed" },
  ]);
  f.idle();
  await starting;
  const page = hostRunReadSchema.parse(
    await f.runs.execute({ action: "run-read", runId: f.prepared.runId, cursor: 0 }, f.context),
  );
  const tools = page.events.filter(
    (
      event,
    ): event is Extract<
      HostRunEvent,
      { type: "tool.started" | "tool.updated" | "tool.completed" }
    > =>
      event.type === "tool.started" ||
      event.type === "tool.updated" ||
      event.type === "tool.completed",
  );
  expect(page.formatVersion).toBe(HOST_RUN_TOOL_EVENT_FORMAT_VERSION);
  expect(tools.map((event) => event.type)).toEqual([
    "tool.started",
    "tool.updated",
    "tool.completed",
  ]);
  expect(tools[0]).toMatchObject({
    toolName: "bash",
    inputSummary: "command and working directory omitted",
  });
  expect(tools.at(-1)).toMatchObject({
    outputSummary: expect.stringContaining("exit code 0"),
  });
  expect(
    tools.every(
      (event) =>
        Buffer.byteLength(event.inputSummary) <= HOST_RUN_TOOL_SUMMARY_BYTES &&
        (event.outputSummary === undefined ||
          Buffer.byteLength(event.outputSummary) <= HOST_RUN_TOOL_SUMMARY_BYTES),
    ),
  ).toBe(true);
  expect(JSON.stringify(tools)).not.toContain("secret-value");
  expect(JSON.stringify(tools)).not.toContain("sensitive/path");
  expect(JSON.stringify(tools)).not.toContain("private-output-value");
});

it("continues the exact saved session without recreating metadata, worktree, account reference or history", async () => {
  const f = await fixture(true);
  const before = dbGetThread(f.saved.id)!;
  const start = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
  await f.launched.promise;
  expect(f.launchPort).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      threadId: f.saved.id,
      agentKind: f.saved.agentKind,
      sessionRef: f.saved.sessionRef,
      config: f.saved.config,
      prompt: f.resumeCommand.prompt,
      projectLocation: expect.objectContaining({ path: f.saved.worktreePath }),
      presentationMode: "gui",
    }),
  );
  expect(dbGetThread(f.saved.id)).toEqual(before);
  f.completed();
  expect(hostRunResultSchema.parse(await start).result).toMatchObject({
    state: "completed",
    historyCommitted: true,
    retirementConfirmed: true,
  });
  const after = dbGetThread(f.saved.id)!;
  for (const key of [
    "id",
    "title",
    "createdAt",
    "agentKind",
    "config",
    "sessionRef",
    "groupId",
    "groupName",
    "worktreePath",
    "worktreeBranch",
    "starred",
  ] as const)
    expect(after[key]).toEqual(before[key]);
  const history = JSON.stringify(dbReadThreadRuntimeItems(f.saved.id));
  expect(history).toContain("Preserve original history");
  expect(history).toContain("Hello 世界");
  expect(f.call.mock.calls.filter(([name]) => name === "reserveThreadExecution")).toMatchObject([
    ["reserveThreadExecution", { action: "prepare", threadId: f.saved.id }],
    ["reserveThreadExecution", { action: "cancel", threadId: f.saved.id }],
  ]);
});

it("retires a known reservation even if its prepare reply was lost", async () => {
  const f = await fixture(true);
  f.gates.lostReservationReply = true;
  const result = await f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
  expect(result).toMatchObject({
    result: { state: "failed", retirementConfirmed: true, error: "Lost reservation reply fixture" },
  });
  expect(f.controller.ownsThread(f.saved.id)).toBe(false);
  expect(f.launchPort).not.toHaveBeenCalled();
  expect(f.retirePort).not.toHaveBeenCalled();
});

it("refuses a busy saved session without observing, stopping or changing its incumbent execution", async () => {
  const f = await fixture(true);
  const incumbent = await f.controller.control({
    version: 1,
    action: "prepare",
    threadId: f.saved.id,
  });
  const result = await f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
  expect(result).toMatchObject({
    result: {
      state: "failed",
      retirementConfirmed: true,
      error: expect.stringContaining("Another client"),
    },
  });
  expect(f.controller.ownsThread(f.saved.id)).toBe(true);
  expect(f.launchPort).not.toHaveBeenCalled();
  expect(f.retirePort).not.toHaveBeenCalled();
  await f.controller.control({ version: 1, action: "cancel", operationId: incumbent.operationId });
});

it("ignores incumbent output while a saved-session reservation is still routing", async () => {
  const f = await fixture(true),
    gate = Promise.withResolvers<void>();
  f.gates.preparation = gate.promise;
  const start = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
  await vi.waitFor(() =>
    expect(f.call.mock.calls.some(([name]) => name === "reserveThreadExecution")).toBe(true),
  );
  f.runs.observe({
    type: "thread-runtime-event",
    threadId: f.saved.id,
    event: {
      type: "content.delta",
      threadId: f.saved.id,
      itemId: "incumbent",
      stream: "assistant_text",
      delta: "Do not print incumbent output",
    },
  });
  expect(
    await f.runs.execute({ action: "run-read", runId: f.prepared.runId, cursor: 0 }, f.context),
  ).toMatchObject({ events: [] });
  f.abort.abort();
  gate.resolve();
  expect(await start).toMatchObject({ result: { state: "cancelled", retirementConfirmed: true } });
  expect(f.launchPort).not.toHaveBeenCalled();
});

it.each([
  { archived: true },
  { done: true },
  { presentationMode: "terminal" as const },
  { sessionRef: undefined },
  { agentInstanceId: "unmatched-profile" },
  { config: { model: "unknown", approvalPolicy: "ask", sandboxMode: "read-only" } },
  { config: { model: "model", approvalPolicy: "unknown", sandboxMode: "read-only" } },
  {
    config: {
      model: "model",
      executionEnvironment: { kind: "wsl" as const, distro: "Exact Distro" },
    },
  },
])(
  "refuses unavailable or mismatched saved execution selections without a provider effect: %j",
  async (change) => {
    const f = await fixture(true);
    dbUpsertThread({ ...f.saved, ...change } as Thread, 7);
    await expect(f.runs.execute(f.resumeCommand, f.context)).rejects.toThrow(Error);
    expect(f.launchPort).not.toHaveBeenCalled();
    expect(f.retirePort).not.toHaveBeenCalled();
    expect(f.call.mock.calls.some(([name]) => name === "reserveThreadExecution")).toBe(false);
  },
);

it.each([
  { futureRuntimeChoice: "opaque" },
  { selectionBinding: { version: 99, opaque: "preserve" } },
  { importedFrom: { version: 99, opaque: "preserve" } },
])(
  "refuses raw future saved configuration losslessly before selected probing: %j",
  async (extra) => {
    const f = await fixture(true);
    const bytes = JSON.stringify({ ...f.saved.config, ...extra });
    getSqlite().prepare("UPDATE threads SET config = ? WHERE id = ?").run(bytes, f.saved.id);
    f.call.mockClear();
    await expect(f.runs.execute(f.resumeCommand, f.context)).rejects.toThrow(Error);
    expect(f.call).not.toHaveBeenCalled();
    expect(getSqlite().prepare("SELECT config FROM threads WHERE id = ?").get(f.saved.id)).toEqual({
      config: bytes,
    });
  },
);

it("rechecks saved execution ownership/configuration after reservation but allows unrelated title edits", async () => {
  const f = await fixture(true),
    gate = Promise.withResolvers<void>();
  f.gates.preparation = gate.promise;
  const start = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
  await vi.waitFor(() =>
    expect(f.call.mock.calls.some(([name]) => name === "reserveThreadExecution")).toBe(true),
  );
  getSqlite()
    .prepare("UPDATE threads SET config = ? WHERE id = ?")
    .run(JSON.stringify({ ...f.saved.config, model: "different" }), f.saved.id);
  gate.resolve();
  expect(await start).toMatchObject({
    result: {
      state: "failed",
      error: expect.stringContaining("execution selection changed"),
      retirementConfirmed: true,
    },
  });
  expect(f.launchPort).not.toHaveBeenCalled();
  expect(f.controller.ownsThread(f.saved.id)).toBe(false);
});

it("admits an unrelated saved title edit and selects provider-owned session routing over the default runtime", async () => {
  const f = await fixture(true);
  f.status.runtimeVariants = {
    selected: {
      presentationMode: "gui",
      installed: true,
      authState: "authenticated",
      authUsesProviderLogin: false,
      capabilities: f.status.capabilities,
    },
    other: {
      presentationMode: "gui",
      installed: true,
      authState: "missing",
      authUsesProviderLogin: true,
      capabilities: { ...f.status.capabilities, supportsResume: false },
    },
  };
  f.status.sessionRuntimeRouting = {
    prefixes: { "fixture:": "selected" },
    fallbackRuntime: "other",
  };
  const prepared = hostRunMetadataSchema.parse(await f.runs.execute(f.resumeCommand, f.context));
  getSqlite()
    .prepare("UPDATE threads SET title = ? WHERE id = ?")
    .run("Concurrent title", f.saved.id);
  const start = f.runs.execute({ action: "run-start", runId: prepared.runId }, f.context);
  await f.launched.promise;
  f.completed();
  expect(await start).toMatchObject({ result: { state: "completed" } });
  expect(dbGetThread(f.saved.id)?.title).toBe("Concurrent title");
});

it("refuses a runtime without resume support and an unmapped multi-runtime session instead of using a default", async () => {
  const f = await fixture(true);
  f.status.capabilities.supportsResume = false;
  await expect(f.runs.execute(f.resumeCommand, f.context)).rejects.toThrow("does not support");
  f.status.capabilities.supportsResume = true;
  const runtime = {
    presentationMode: "gui" as const,
    installed: true,
    authState: "authenticated" as const,
    authUsesProviderLogin: false,
    capabilities: f.status.capabilities,
  };
  f.status.runtimeVariants = { first: runtime, second: runtime };
  f.status.sessionRuntimeRouting = { prefixes: { "other:": "first" } };
  await expect(f.runs.execute(f.resumeCommand, f.context)).rejects.toThrow(
    "no unique structured runtime",
  );
  expect(f.launchPort).not.toHaveBeenCalled();
});

it("cancels before start routing without reserving or launching a provider", async () => {
  const f = await fixture();
  const start = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
  await f.runs.execute({ action: "run-cancel", runId: f.prepared.runId }, f.context);
  expect(hostRunResultSchema.parse(await start).result).toMatchObject({
    state: "cancelled",
    retirementConfirmed: true,
  });
  expect(f.launchPort).not.toHaveBeenCalled();
  expect(f.call.mock.calls.filter(([name]) => name === "controlThreadExecution")).toHaveLength(0);
  expect(dbGetThread(f.prepared.threadId)).toBeNull();
});

it("joins a reservation published after cancellation before admitting any launch", async () => {
  const f = await fixture(),
    gate = Promise.withResolvers<void>();
  f.gates.preparation = gate.promise;
  const start = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
  await vi.waitFor(() =>
    expect(f.call.mock.calls.filter(([name]) => name === "controlThreadExecution")).toHaveLength(1),
  );
  let retired = false;
  const cancel = f.runs
    .execute({ action: "run-cancel", runId: f.prepared.runId }, f.context)
    .then(() => {
      retired = true;
    });
  await Promise.resolve();
  expect(retired).toBe(false);
  gate.resolve();
  await cancel;
  await start;
  expect(f.launchPort).not.toHaveBeenCalled();
  expect(f.retirePort).not.toHaveBeenCalled();
});

it("keeps caller cancellation and shutdown pending until actual retirement joins", async () => {
  const f = await fixture(),
    gate = Promise.withResolvers<void>();
  f.gates.retirement = gate.promise;
  const start = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
  await f.launched.promise;
  f.abort.abort();
  let disposed = false;
  const dispose = f.runs.dispose().then(() => {
    disposed = true;
  });
  await vi.waitFor(() => expect(f.retirePort).toHaveBeenCalledOnce());
  expect(disposed).toBe(false);
  gate.resolve();
  await dispose;
  expect(hostRunResultSchema.parse(await start).result.state).toBe("cancelled");
});

it("does not reuse a startup idle state as completion of a later turn", async () => {
  const f = await fixture();
  const start = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
  await f.launched.promise;
  f.idle();
  f.runtime([
    { type: "turn.started", threadId: f.prepared.threadId, turnId: "turn" },
    { type: "turn.completed", threadId: f.prepared.threadId, turnId: "turn", state: "completed" },
  ]);
  await Promise.resolve();
  expect(f.retirePort).not.toHaveBeenCalled();
  f.idle();
  expect(hostRunResultSchema.parse(await start).result.state).toBe("completed");
});

it("does not report completion when the caller cancels during held retirement", async () => {
  const f = await fixture(),
    gate = Promise.withResolvers<void>();
  f.gates.retirement = gate.promise;
  const start = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
  await f.launched.promise;
  f.completed();
  await vi.waitFor(() => expect(f.retirePort).toHaveBeenCalledOnce());
  f.abort.abort();
  gate.resolve();
  expect(hostRunResultSchema.parse(await start).result.state).toBe("cancelled");
});

it("rechecks background work when its membership changes during the pending snapshot", async () => {
  const f = await fixture(),
    gate = Promise.withResolvers<BackgroundTask[]>();
  f.gates.background = gate.promise;
  const start = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
  await f.launched.promise;
  f.completed();
  await vi.waitFor(() =>
    expect(f.call.mock.calls.some(([name]) => name === "readThreadBackgroundTasks")).toBe(true),
  );
  f.gates.background = undefined;
  f.runtime([{ type: "background_tasks.changed", threadId: f.prepared.threadId, tasks: [] }]);
  gate.resolve([{ taskId: "old", kind: "command", description: "old snapshot" }]);
  expect(hostRunResultSchema.parse(await start).result.state).toBe("completed");
  expect(f.call.mock.calls.filter(([name]) => name === "readThreadBackgroundTasks")).toHaveLength(
    2,
  );
});

it("refuses duplicate/foreign runs and never approves a provider request", async () => {
  const f = await fixture();
  const start = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
  await f.launched.promise;
  await expect(
    f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context),
  ).rejects.toThrow("already submitted");
  await expect(
    f.runs.execute({ action: "run-cancel", runId: randomUUID() }, f.context),
  ).rejects.toThrow("Unknown");
  f.runtime([
    {
      type: "request.opened",
      threadId: f.prepared.threadId,
      requestId: "approval",
      requestType: "tool_call_approval",
      payload: { summary: "Allow a command?" },
    },
  ]);
  expect(hostRunResultSchema.parse(await start).result).toMatchObject({
    state: "blocked",
    retirementConfirmed: true,
  });
  expect(f.call.mock.calls.some(([name]) => name === "resolveThreadServerRequest")).toBe(false);
});

it("keeps interactive requests scoped, pending and single-use while preserving completion", async () => {
  const f = await fixture();
  f.runs.enableInteraction(f.prepared.runId, f.prepared.threadId, f.context);
  const start = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
  await f.launched.promise;
  const event = {
    type: "request.opened" as const,
    threadId: f.prepared.threadId,
    requestId: "ask",
    requestType: "tool_user_input" as const,
    payload: { summary: "Choose", options: [{ optionId: "one", label: "One" }] },
  };
  f.runtime([event]);
  const read = { action: "run-request-read" as const, runId: f.prepared.runId };
  const request = hostRunRequestReadSchema.parse(await f.runs.interact(read, f.context)).request!;
  f.completed();
  let settled = false;
  void start.then(() => {
    settled = true;
  });
  await new Promise<void>((complete) => setImmediate(complete));
  expect(settled).toBe(false);
  const reply = {
    action: "run-request-respond" as const,
    runId: f.prepared.runId,
    requestToken: request.requestToken,
    response: { optionId: "one" },
  };
  await expect(f.runs.interact({ ...reply, runId: randomUUID() }, f.context)).rejects.toThrow(
    "Unknown",
  );
  await expect(
    f.runs.interact({ ...reply, requestToken: randomUUID() }, f.context),
  ).rejects.toThrow("no longer pending");
  await expect(f.runs.interact(reply, f.context)).resolves.toMatchObject({
    responded: true,
    requestToken: request.requestToken,
  });
  await expect(f.runs.interact(reply, f.context)).rejects.toThrow("no longer pending");
  expect(hostRunResultSchema.parse(await start).result.state).toBe("completed");
  expect(
    f.call.mock.calls.filter(
      ([name, payload]) =>
        name === "controlledThreadRequest" && (payload as { action: string }).action === "respond",
    ),
  ).toHaveLength(1);
});

it("retires an interactive reservation before launch when the supervisor does not qualify it", async () => {
  const f = await fixture();
  f.runs.enableInteraction(f.prepared.runId, f.prepared.threadId, f.context);
  const original = f.call.getMockImplementation()!;
  f.call.mockImplementation(async (name, payload, options) => {
    if (name === "controlledThreadRequest") throw new Error("Unknown procedure fixture");
    return original(name, payload, options);
  });
  expect(
    hostRunResultSchema.parse(
      await f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context),
    ).result,
  ).toMatchObject({ state: "failed", retirementConfirmed: true });
  expect(f.launchPort).not.toHaveBeenCalled();
  expect(dbGetThread(f.prepared.threadId)).toBeNull();
});

it.each(["different", "identical"])(
  "refuses a %s replacement before the host receives its event",
  async (mode) => {
    const f = await fixture();
    f.runs.enableInteraction(f.prepared.runId, f.prepared.threadId, f.context);
    const start = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
    await f.launched.promise;
    const event = {
      type: "request.opened" as const,
      threadId: f.prepared.threadId,
      requestId: "ask",
      requestType: "tool_call_approval" as const,
      payload: { summary: "Original action" },
    };
    f.runtime([event]);
    const read = { action: "run-request-read" as const, runId: f.prepared.runId };
    const shown = hostRunRequestReadSchema.parse(await f.runs.interact(read, f.context)).request!;
    f.controller.observe({
      ...event,
      payload: { summary: mode === "identical" ? "Original action" : "Different action" },
    });
    // Repeated polling cannot rebind an already displayed host token.
    expect(hostRunRequestReadSchema.parse(await f.runs.interact(read, f.context)).request).toEqual(
      shown,
    );
    await expect(
      f.runs.interact(
        {
          action: "run-request-respond",
          runId: f.prepared.runId,
          requestToken: shown.requestToken,
          response: { optionId: "allow" },
        },
        f.context,
      ),
    ).rejects.toThrow("no longer pending");
    expect(f.respondPort).not.toHaveBeenCalled();
    expect(hostRunResultSchema.parse(await start).result).toMatchObject({
      state: "failed",
      retirementConfirmed: true,
    });
  },
);

it("displays the supervisor's exact current payload instead of a buffered old host event", async () => {
  const f = await fixture();
  f.runs.enableInteraction(f.prepared.runId, f.prepared.threadId, f.context);
  const start = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
  await f.launched.promise;
  const event = {
    type: "request.opened" as const,
    threadId: f.prepared.threadId,
    requestId: "ask",
    requestType: "tool_call_approval" as const,
    payload: { summary: "Original action" },
  };
  f.runtime([event]);
  f.controller.observe({
    ...event,
    payload: { summary: "Current different action", details: { command: "inspect current" } },
  });
  const shown = hostRunRequestReadSchema.parse(
    await f.runs.interact({ action: "run-request-read", runId: f.prepared.runId }, f.context),
  ).request!;
  expect(shown.payload).toEqual({
    summary: "Current different action",
    details: { command: "inspect current" },
  });
  await f.runs.interact(
    {
      action: "run-request-respond",
      runId: f.prepared.runId,
      requestToken: shown.requestToken,
      response: { optionId: "deny" },
    },
    f.context,
  );
  expect(f.respondPort).toHaveBeenCalledExactlyOnceWith({
    threadId: f.prepared.threadId,
    requestId: "ask",
    method: "requestPermission",
    response: { optionId: "deny" },
  });
  f.completed();
  expect(hostRunResultSchema.parse(await start).result.state).toBe("completed");
});

it.each(["caller", "shutdown"])(
  "joins held replies before releasing a run on %s cancellation",
  async (mode) => {
    const f = await fixture();
    f.runs.enableInteraction(f.prepared.runId, f.prepared.threadId, f.context);
    const start = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
    await f.launched.promise;
    f.runtime([
      {
        type: "request.opened",
        threadId: f.prepared.threadId,
        requestId: "ask",
        requestType: "tool_call_approval",
        payload: { summary: "Allow?" },
      },
    ]);
    const request = hostRunRequestReadSchema.parse(
      await f.runs.interact({ action: "run-request-read", runId: f.prepared.runId }, f.context),
    ).request!;
    const held = Promise.withResolvers<void>(),
      caller = new AbortController();
    f.respondPort.mockReturnValue(held.promise);
    const response = f.runs
      .interact(
        {
          action: "run-request-respond",
          runId: f.prepared.runId,
          requestToken: request.requestToken,
          response: { optionId: "allow" },
        },
        { signal: caller.signal, assertActive: () => caller.signal.throwIfAborted() },
      )
      .catch((error: unknown) => error);
    await vi.waitFor(() => expect(f.respondPort).toHaveBeenCalledOnce());
    let settled = false;
    const finished = start.then((value) => {
      settled = true;
      return value;
    });
    const shutdown = mode === "shutdown" ? f.runs.dispose() : undefined;
    if (mode === "caller") caller.abort(new Error("Response caller gone"));
    await vi.waitFor(() => expect(f.retirePort).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    expect(f.controller.ownsThread(f.prepared.threadId)).toBe(true);
    held.resolve();
    expect(await response).toBeInstanceOf(Error);
    expect(hostRunResultSchema.parse(await finished).result.state).toBe("cancelled");
    await shutdown;
    expect(f.controller.ownsThread(f.prepared.threadId)).toBe(false);
  },
);

it.each(["auth_refresh", "oversized"])(
  "blocks %s requests without a reply or credential fallback",
  async (mode) => {
    const f = await fixture();
    f.runs.enableInteraction(f.prepared.runId, f.prepared.threadId, f.context);
    const start = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
    await f.launched.promise;
    f.runtime([
      {
        type: "request.opened",
        threadId: f.prepared.threadId,
        requestId: "ask",
        requestType: mode === "auth_refresh" ? "auth_refresh" : "tool_call_approval",
        payload: { summary: mode === "oversized" ? "x".repeat(25_000) : "Login" },
      },
    ]);
    expect(hostRunResultSchema.parse(await start).result.state).toBe("blocked");
    expect(f.respondPort).not.toHaveBeenCalled();
  },
);

it.each(["resolved", "replaced", "cancelled"])(
  "refuses a %s interactive request token",
  async (mode) => {
    const f = await fixture();
    f.runs.enableInteraction(f.prepared.runId, f.prepared.threadId, f.context);
    const start = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
    await f.launched.promise;
    const event = {
      type: "request.opened" as const,
      threadId: f.prepared.threadId,
      requestId: "ask",
      requestType: "tool_call_approval" as const,
      payload: { summary: "Allow?" },
    };
    f.runtime([event]);
    const request = hostRunRequestReadSchema.parse(
      await f.runs.interact({ action: "run-request-read", runId: f.prepared.runId }, f.context),
    ).request!;
    if (mode === "resolved")
      f.runtime([
        {
          type: "request.resolved",
          threadId: f.prepared.threadId,
          requestId: "ask",
          outcome: "cancelled",
        },
      ]);
    else if (mode === "replaced")
      f.runtime([{ ...event, payload: { summary: "Different action?" } }]);
    else await f.runs.execute({ action: "run-cancel", runId: f.prepared.runId }, f.fresh);
    await expect(
      f.runs.interact(
        {
          action: "run-request-respond",
          runId: f.prepared.runId,
          requestToken: request.requestToken,
          response: { optionId: "allow" },
        },
        f.fresh,
      ),
    ).rejects.toThrow("no longer pending");
    expect(
      f.call.mock.calls.filter(
        ([name, payload]) =>
          name === "controlledThreadRequest" &&
          (payload as { action: string }).action === "respond",
      ),
    ).toHaveLength(0);
    await f.runs.execute({ action: "run-cancel", runId: f.prepared.runId }, f.fresh);
    await start;
  },
);

it("retains uncertain retirement for an exact cancellation retry", async () => {
  const f = await fixture();
  f.confirm(false);
  const start = f.runs
    .execute({ action: "run-start", runId: f.prepared.runId }, f.context)
    .catch((error: unknown) => error);
  await f.launched.promise;
  f.completed();
  expect(await start).toBeInstanceOf(Error);
  f.confirm(true);
  await expect(
    f.runs.execute({ action: "run-cancel", runId: f.prepared.runId }, f.context),
  ).resolves.toMatchObject({ retired: true });
  expect(f.retirePort).toHaveBeenCalledTimes(2);
});

it("refuses selected WSL targets before any provider call", async () => {
  const f = await fixture();
  f.call.mockClear();
  await expect(
    f.runs.execute({ ...f.command, wslDistro: "Selected Distro" }, f.context),
  ).rejects.toThrow("Selected Distro");
  expect(f.call).not.toHaveBeenCalled();
});

it("exposes only exact structured model and permission choices without a task launch", async () => {
  const f = await fixture();
  f.status.executablePath = "private-fixture-path";
  const options = await f.runs.execute(
    { action: "run-options", projectId: "project", agentKind: "neutral" },
    f.context,
  );
  expect(options).toMatchObject({
    scope: "controlled-run-options",
    models: [{ id: "model", label: "Model" }],
    approvalPolicies: [{ id: "ask" }],
    sandboxModes: [{ id: "read-only" }],
  });
  expect(JSON.stringify(options)).not.toContain("private-fixture-path");
  expect(f.launchPort).not.toHaveBeenCalled();
  expect(f.call.mock.calls.at(-1)).toEqual([
    "probeSelectedAgent",
    { version: 1, agentKind: "neutral" },
  ]);
});

it("refuses an effectively disabled provider before probing without ignoring native overrides", async () => {
  const f = await fixture();
  f.settings.disabledAgents = ["neutral"];
  f.call.mockClear();
  await expect(f.runs.execute(f.command, f.context)).rejects.toThrow("disabled");
  expect(f.call).not.toHaveBeenCalled();
  f.settings.machineScopeModes.disabledAgents = "per-machine";
  const key = localMachineKey({ kind: "native" });
  f.settings.machineSettings[key] = { disabledAgents: [] };
  await expect(f.runs.execute(f.command, f.context)).resolves.toMatchObject({
    scope: "controlled-run",
  });
  f.settings.disabledAgents = [];
  f.settings.machineSettings[key] = { disabledAgents: ["neutral"] };
  f.call.mockClear();
  await expect(f.runs.execute(f.command, f.context)).rejects.toThrow("disabled");
  expect(f.call).not.toHaveBeenCalled();
});

it("refuses a changed native provider runtime before the reserved operation launches", async () => {
  const f = await fixture();
  f.settings.agentSettings.neutral = { runtime: "changed-after-preparation" };
  await expect(
    f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context),
  ).resolves.toMatchObject({
    result: {
      state: "failed",
      error: expect.stringContaining("changed"),
      historyCommitted: false,
      retirementConfirmed: true,
    },
  });
  expect(f.launchPort).not.toHaveBeenCalled();
  expect(f.retirePort).not.toHaveBeenCalled();
});

it("refuses unsupported or mismatched selected-probe replies without legacy discovery fallback", async () => {
  const f = await fixture();
  f.call.mockClear();
  f.call.mockResolvedValueOnce({
    version: 2,
    agentKind: "neutral",
    environment: "native",
    status: f.status,
  } as never);
  await expect(f.runs.execute(f.command, f.context)).rejects.toThrow("version");
  f.call.mockResolvedValueOnce({
    version: 1,
    agentKind: "other",
    environment: "native",
    status: f.status,
  } as never);
  await expect(f.runs.execute(f.command, f.context)).rejects.toThrow("exact provider");
  expect(f.call.mock.calls.every(([name]) => name === "probeSelectedAgent")).toBe(true);
  expect(f.launchPort).not.toHaveBeenCalled();
});

it("does not use an authenticated terminal account for a missing structured runtime credential", async () => {
  const f = await fixture();
  f.status.runtimeVariants = {
    terminal: {
      presentationMode: "terminal",
      installed: true,
      authState: "authenticated",
      authUsesProviderLogin: true,
      capabilities: f.status.capabilities,
    },
    structured: {
      presentationMode: "gui",
      installed: true,
      authState: "missing",
      authUsesProviderLogin: false,
      capabilities: f.status.capabilities,
    },
  };
  await expect(f.runs.execute(f.command, f.context)).rejects.toThrow(
    "structured runtime requires authentication",
  );
  expect(f.launchPort).not.toHaveBeenCalled();
});

it("accepts the optimistic startup turn followed by the actual structured provider turn", async () => {
  const f = await fixture();
  const start = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
  await f.launched.promise;
  f.runtime([{ type: "turn.started", threadId: f.prepared.threadId, turnId: "optimistic" }]);
  f.completed();
  expect(hostRunResultSchema.parse(await start).result).toMatchObject({
    state: "completed",
    retirementConfirmed: true,
    historyCommitted: true,
  });
});

it("does not settle a later canonical turn from an earlier turn's completion or idle state", async () => {
  const f = await fixture();
  const start = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
  await f.launched.promise;
  f.runtime([
    { type: "turn.started", threadId: f.prepared.threadId, turnId: "earlier" },
    {
      type: "turn.completed",
      threadId: f.prepared.threadId,
      turnId: "earlier",
      state: "completed",
    },
    { type: "turn.started", threadId: f.prepared.threadId, turnId: "current" },
    {
      type: "turn.completed",
      threadId: f.prepared.threadId,
      turnId: "earlier",
      state: "completed",
    },
  ]);
  f.idle();
  await new Promise<void>((finish) => setImmediate(finish));
  expect(f.retirePort).not.toHaveBeenCalled();
  f.runtime([
    {
      type: "turn.completed",
      threadId: f.prepared.threadId,
      turnId: "current",
      state: "completed",
    },
  ]);
  expect(hostRunResultSchema.parse(await start).result.state).toBe("completed");
});

it("stops unread-output overflow explicitly while retaining a bounded final failure record", async () => {
  const f = await fixture();
  const start = f.runs.execute({ action: "run-start", runId: f.prepared.runId }, f.context);
  await f.launched.promise;
  f.runs.observe({
    type: "thread-runtime-event",
    threadId: f.prepared.threadId,
    event: {
      type: "content.delta",
      threadId: f.prepared.threadId,
      itemId: "large",
      stream: "assistant_text",
      delta: "x".repeat(1_100_000),
    },
  });
  expect(hostRunResultSchema.parse(await start).result).toMatchObject({
    state: "failed",
    retirementConfirmed: true,
    error: expect.stringContaining("bounded unread buffer"),
  });
  let cursor = 0,
    bytes = 0;
  let last: unknown;
  for (;;) {
    const page = hostRunReadSchema.parse(
      await f.runs.execute({ action: "run-read", runId: f.prepared.runId, cursor }, f.context),
    );
    bytes += page.events.reduce((sum, event) => sum + Buffer.byteLength(JSON.stringify(event)), 0);
    cursor = page.nextCursor;
    last = page.events.at(-1);
    if (page.finished) break;
  }
  expect(last).toMatchObject({ type: "run.finished", state: "failed" });
  expect(bytes).toBeLessThanOrEqual(1_048_576);
  expect(f.retirePort).toHaveBeenCalledOnce();
});

it("run-prepare applies the desktop standing MCP defaults", async () => {
  const f = await fixture();
  const selection = await prepareHostRunSelection(f.command, f.context, f.call, () => f.settings);
  expect(selection.config.crossagentMcp).toBe(true);
});

it("run-prepare honors disabled crossagents settings", async () => {
  const f1 = await fixture();
  f1.settings.enabledMcpServers = { crossagents: false };
  const second = await prepareHostRunSelection(f1.command, f1.context, f1.call, () => f1.settings);
  expect(second.config.crossagentMcp).toBeUndefined();

  const f2 = await fixture();
  f2.settings.disabledBuiltInMcpServers = { crossagents: true };
  const third = await prepareHostRunSelection(f2.command, f2.context, f2.call, () => f2.settings);
  expect(third.config.crossagentMcp).toBeUndefined();
});
