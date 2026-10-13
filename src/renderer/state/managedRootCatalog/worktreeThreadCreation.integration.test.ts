import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSqlite } from "@/host/db/connection";
import { dbGetThread, onProjectThreadDataChanged } from "@/host/db";
import { DEFAULT_TERMINAL_SIZE, type RemoteThreadCommand } from "@/shared/contracts";
import { RemoteClientError } from "@/shared/remote/client";
import { readManagedLoopbackActivation } from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  performInitialThreadLaunch,
  startThreadFromDraft,
} from "@/renderer/actions/threadLaunchActions";
import { archiveThread, deleteThread, deleteThreadRecord } from "@/renderer/actions/threadActions";
import { applyRootCatalogThreadRows } from "./rootCatalogRows";
import { peekPendingManagedRootLaunch } from "./rootCatalogStore";
import { forgetPendingCatalogEdit } from "@/renderer/state/pendingCatalogEdits";
import { __resetManagedRootLaunchMetadataCapabilityForTest } from "./rootLaunchMetadataCapability";
import { sendManagedRootThreadCommand } from "./rootCatalogCommands";
import {
  activate,
  hostThreadRow,
  setupManagedRootFixture,
  supervisorTrace,
  teardownManagedRootFixture,
  threadRow,
} from "./managedRootFixture";

const mocks = vi.hoisted(() => ({
  createWorktree: vi.fn<() => Promise<{ path: string }>>(),
  generateTitleWithFallback: vi.fn<() => Promise<string>>(),
  danger: vi.fn<(message: string) => void>(),
  performWorktreeRemoval: vi.fn<() => Promise<void>>(async () => {}),
}));

vi.mock("@heroui/react", () => ({
  toast: { danger: mocks.danger, warning: vi.fn<(message: string) => void>() },
}));
vi.mock("@/renderer/components/providers/titleGen", () => ({
  generateTitleWithFallback: mocks.generateTitleWithFallback,
}));
vi.mock("@/renderer/actions/worktreeLaunchActions", () => ({
  createWorktree: mocks.createWorktree,
  primeWorktreeGitState: vi.fn<() => Promise<void>>(async () => {}),
  runWorktreeSetupScript: vi.fn<() => Promise<void>>(async () => {}),
}));
vi.mock("@/renderer/state/gitRefresh", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/state/gitRefresh")>()),
  refreshGitProject: vi.fn<() => void>(),
}));
vi.mock("@/renderer/state/fileCheckpointActions", () => ({
  captureFileCheckpoint: vi.fn<() => Promise<void>>(async () => {}),
}));
vi.mock("@/renderer/actions/worktreeActions", () => ({
  performWorktreeRemoval: mocks.performWorktreeRemoval,
  deleteWorktreeGroup: vi.fn<() => void>(),
  forgetRemovedWorktreeGroup: vi.fn<() => void>(),
}));

const draft = {
  threadId: "worktree-thread",
  agentKind: "example",
  config: { model: "example/model" },
  prompt: "Prepare the workspace",
  presentationMode: "gui" as const,
  worktreeBranch: "feature",
  worktreeIsNewBranch: true,
};

async function fixtureProject() {
  await activate({ preloadProcedures: { dbSetState: () => null } });
  useSharedSettings.setState({ titleGenProvider: "auto" });
  return useAppStore.getState().projects.find((row) => row.id === "p-1")!;
}

describe("worktree thread creation over the real host authority", () => {
  beforeEach(async () => {
    forgetPendingCatalogEdit("thread", draft.threadId);
    await setupManagedRootFixture();
    useAppStore.setState({ provisioningWorktreeThreadIds: {} });
    mocks.generateTitleWithFallback.mockResolvedValue("Generated worktree title");
  });

  afterEach(async () => {
    __resetManagedRootLaunchMetadataCapabilityForTest();
    await teardownManagedRootFixture();
  });

  it("persists the thread and its early generated title before worktree creation finishes", async () => {
    const project = await fixtureProject();
    let completeWorktree!: (result: { path: string }) => void;
    mocks.createWorktree.mockImplementation(() => {
      // Real HTTP + SQLite creation must precede the git operation.
      expect(hostThreadRow("worktree-thread")?.title).toBe("Prepare the workspace");
      expect(hostThreadRow("worktree-thread")).toMatchObject({
        status: "inactive",
        active_turn_started_at: null,
      });
      expect(supervisorTrace.startThreadCalls).toBe(0);
      return new Promise((resolve) => {
        completeWorktree = resolve;
      });
    });

    const launch = startThreadFromDraft(project, draft);

    await vi.waitFor(() => expect(mocks.createWorktree).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(hostThreadRow("worktree-thread")?.title).toBe("Generated worktree title"),
    );
    expect(threadRow("worktree-thread")?.title).toBe("Generated worktree title");
    expect(threadRow("worktree-thread")?.status).toBe("launching");
    expect(mocks.generateTitleWithFallback).toHaveBeenCalledTimes(1);
    expect(mocks.danger).not.toHaveBeenCalled();
    expect(useAppStore.getState().provisioningWorktreeThreadIds[draft.threadId]).toBe(true);
    expect(supervisorTrace.startThreadCalls).toBe(0);

    completeWorktree({ path: "/tmp/repo/worktrees/feature" });
    await launch;

    expect(supervisorTrace.startThreadCalls).toBe(1);
    expect(supervisorTrace.lastStartThreadPayload).toMatchObject({
      threadId: "worktree-thread",
      projectLocation: { kind: "posix", path: "/tmp/repo/worktrees/feature" },
      prompt: "Prepare the workspace",
    });
    expect(hostThreadRow("worktree-thread")).toMatchObject({
      title: "Generated worktree title",
      worktree_path: "/tmp/repo/worktrees/feature",
      worktree_branch: "feature",
    });
    const receipts = getSqlite()
      .prepare(
        "SELECT route, state FROM remote_command_receipts WHERE route != '/api/projects/command' ORDER BY created_at",
      )
      .all();
    expect(receipts).toEqual([
      { route: "/api/threads/worktree-thread/command", state: "completed" },
      { route: "/api/threads/start", state: "completed" },
    ]);
    expect(mocks.generateTitleWithFallback).toHaveBeenCalledTimes(1);
    expect(mocks.danger).not.toHaveBeenCalled();
    expect(useAppStore.getState().provisioningWorktreeThreadIds[draft.threadId]).toBeUndefined();
  });

  it("replays metadata creation without replacing a later title or launching an agent", async () => {
    await activate();
    const command = {
      kind: "create" as const,
      threadId: "early-thread",
      projectId: "p-1",
      agentKind: "example",
      config: { model: "example/model" },
      title: "Fallback title",
      presentationMode: "gui" as const,
    };
    const options = { commandId: crypto.randomUUID() };
    await sendManagedRootThreadCommand(command, options);
    await sendManagedRootThreadCommand({
      kind: "rename",
      threadId: command.threadId,
      title: "Generated title",
    });
    await sendManagedRootThreadCommand(command, options);

    expect(hostThreadRow(command.threadId)?.title).toBe("Generated title");
    expect(supervisorTrace.startThreadCalls).toBe(0);
    await expect(sendManagedRootThreadCommand(command)).rejects.toMatchObject({
      code: "thread_already_exists",
      status: 409,
    });
    expect(hostThreadRow(command.threadId)?.title).toBe("Generated title");
  });

  it("keeps a preparation error after a late title rename and catalog refresh", async () => {
    const project = await fixtureProject();
    let completeTitle!: (title: string) => void;
    mocks.generateTitleWithFallback.mockImplementation(
      () =>
        new Promise((resolve) => {
          completeTitle = resolve;
        }),
    );
    mocks.createWorktree.mockRejectedValue(new Error("worktree preparation failed"));
    await expect(startThreadFromDraft(project, draft)).rejects.toThrow(
      "worktree preparation failed",
    );
    completeTitle("Generated worktree title");
    await vi.waitFor(() =>
      expect(hostThreadRow(draft.threadId)?.title).toBe("Generated worktree title"),
    );
    applyRootCatalogThreadRows([dbGetThread(draft.threadId)!], new Set());
    expect(threadRow(draft.threadId)).toMatchObject({
      status: "error",
      errorMessage: "worktree preparation failed",
    });
    expect(hostThreadRow(draft.threadId)).toMatchObject({
      status: "inactive",
      active_turn_started_at: null,
    });
    expect(supervisorTrace.startThreadCalls).toBe(0);
  });

  it("deletes the durable draft during worktree preparation and never resurrects or launches it", async () => {
    const project = await fixtureProject();
    let completeWorktree!: (result: { path: string }) => void;
    mocks.createWorktree.mockImplementation(
      () =>
        new Promise((resolve) => {
          completeWorktree = resolve;
        }),
    );
    const launch = startThreadFromDraft(project, draft);
    await vi.waitFor(() => expect(mocks.createWorktree).toHaveBeenCalledTimes(1));
    deleteThread(draft.threadId);
    await vi.waitFor(() => expect(hostThreadRow(draft.threadId)).toBeUndefined());
    await vi.waitFor(() => expect(threadRow(draft.threadId)).toBeUndefined());
    completeWorktree({ path: "/tmp/repo/worktrees/feature" });
    await launch;
    expect(mocks.performWorktreeRemoval).toHaveBeenCalledExactlyOnceWith(
      project,
      "/tmp/repo/worktrees/feature",
      "feature",
    );
    expect(supervisorTrace.startThreadCalls).toBe(0);
    expect(hostThreadRow(draft.threadId)).toBeUndefined();
    expect(threadRow(draft.threadId)).toBeUndefined();
  });

  it.each(["archive", "delete"] as const)(
    "honors %s while worktree assignment awaits confirmation",
    async (action) => {
      const project = await fixtureProject();
      mocks.createWorktree.mockResolvedValue({ path: "/tmp/repo/worktrees/feature" });
      const client = readManagedLoopbackActivation()!.client;
      const send = client.sendThreadCommand as (
        command: RemoteThreadCommand,
        options?: { commandId?: string },
      ) => Promise<void>;
      let confirmAssignment!: () => void;
      const assignment = new Promise<void>((resolve) => {
        confirmAssignment = resolve;
      });
      vi.spyOn(client, "sendThreadCommand").mockImplementation(async (command, options) => {
        await send.call(client, command, options);
        if (command.kind === "set-worktree") await assignment;
      });
      const launch = startThreadFromDraft(project, draft);
      await vi.waitFor(() =>
        expect(hostThreadRow(draft.threadId)?.worktree_path).toBe("/tmp/repo/worktrees/feature"),
      );
      if (action === "archive") {
        archiveThread(draft.threadId);
        await vi.waitUntil(() => hostThreadRow(draft.threadId)?.archived === 1);
      } else {
        await deleteThreadRecord(threadRow(draft.threadId)!);
      }
      confirmAssignment();
      await launch;
      expect(supervisorTrace.startThreadCalls).toBe(0);
      expect(threadRow(draft.threadId)?.archived).toBe(action === "archive" ? true : undefined);
      expect(hostThreadRow(draft.threadId)?.archived).toBe(action === "archive" ? 1 : undefined);
      expect(mocks.performWorktreeRemoval).toHaveBeenCalledTimes(action === "delete" ? 1 : 0);
    },
  );

  it("retains the original existing-thread launch receipt across an uncertain retry", async () => {
    const project = await fixtureProject();
    mocks.createWorktree.mockResolvedValue({ path: "/tmp/repo/worktrees/feature" });
    supervisorTrace.startThreadFailures = 1;
    await expect(startThreadFromDraft(project, draft)).rejects.toBeInstanceOf(Error);
    const pending = peekPendingManagedRootLaunch(draft.threadId)!;
    expect(pending).toMatchObject({
      metadataCreated: true,
      replay: { projectLocation: { kind: "posix", path: "/tmp/repo/worktrees/feature" } },
    });
    await expect(
      performInitialThreadLaunch({
        thread: threadRow(draft.threadId)!,
        projectLocation: project.location,
        prompt: "A changed retry must not reach the provider",
        initialSize: DEFAULT_TERMINAL_SIZE,
      }),
    ).rejects.toMatchObject({ code: "command_outcome_uncertain" });
    expect(supervisorTrace.startThreadCalls).toBe(1);
    expect(peekPendingManagedRootLaunch(draft.threadId)).toEqual(pending);
    expect(
      getSqlite()
        .prepare(
          "SELECT command_id, state FROM remote_command_receipts WHERE route = '/api/threads/start'",
        )
        .all(),
    ).toEqual([{ command_id: pending.commandId, state: "uncertain" }]);
    expect(mocks.performWorktreeRemoval).not.toHaveBeenCalled();
  });

  it("joins deletion begun during provider startup before completing worktree creation", async () => {
    const project = await fixtureProject();
    mocks.createWorktree.mockResolvedValue({ path: "/tmp/repo/worktrees/feature" });
    const client = readManagedLoopbackActivation()!.client;
    const start = client.startThread;
    const send = client.sendThreadCommand;
    const startup = Promise.withResolvers<void>();
    const deletion = Promise.withResolvers<void>();
    let deleting = false;
    let launchCompleted = false;
    vi.spyOn(client, "startThread").mockImplementation(async (input, options) => {
      const result = await start.call(client, input, options);
      await startup.promise;
      return result;
    });
    vi.spyOn(client, "sendThreadCommand").mockImplementation(async (command, options) => {
      if (command.kind === "delete") {
        deleting = true;
        await deletion.promise;
      }
      await send.call(client, command, options);
    });
    const launch = startThreadFromDraft(project, draft).then(() => {
      launchCompleted = true;
    });
    await vi.waitFor(() => expect(supervisorTrace.startThreadCalls).toBe(1));
    const removal = deleteThreadRecord(threadRow(draft.threadId)!);
    await vi.waitFor(() => expect(deleting).toBe(true));
    startup.resolve();
    // With provider startup confirmed first, the creator must still join the
    // outstanding deletion instead of retiring its provisioning marker.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(launchCompleted).toBe(false);
    expect(peekPendingManagedRootLaunch(draft.threadId)?.removal).toBeDefined();
    expect(mocks.performWorktreeRemoval).not.toHaveBeenCalled();
    deletion.resolve();
    await removal;
    await launch;
    expect(threadRow(draft.threadId)).toBeUndefined();
    expect(hostThreadRow(draft.threadId)).toBeUndefined();
    expect(mocks.performWorktreeRemoval).toHaveBeenCalledExactlyOnceWith(
      project,
      "/tmp/repo/worktrees/feature",
      "feature",
    );
  });

  it.each(["present", "unknown"] as const)(
    "retains host-owned deletion after an uncertain metadata create with %s reconciliation",
    async (existence) => {
      const project = await fixtureProject();
      if (existence === "unknown") {
        vi.spyOn(readManagedLoopbackActivation()!.client, "boundedThreadHistory").mockRejectedValue(
          new Error("fixture reconciliation unavailable"),
        );
      }
      const unsubscribe = onProjectThreadDataChanged(() => {
        if (hostThreadRow(draft.threadId)) throw new Error("catalog publication failed");
      });
      try {
        await expect(startThreadFromDraft(project, draft)).rejects.toMatchObject({
          code: "command_outcome_uncertain",
        });
      } finally {
        unsubscribe();
      }
      expect(hostThreadRow(draft.threadId)?.status).toBe("inactive");
      expect(peekPendingManagedRootLaunch(draft.threadId)).toMatchObject(
        existence === "present" ? { metadataCreated: true } : { metadataCreationUncertain: true },
      );
      applyRootCatalogThreadRows([dbGetThread(draft.threadId)!], new Set());
      expect(threadRow(draft.threadId)?.status).toBe("error");
      expect(mocks.createWorktree).not.toHaveBeenCalled();
      expect(mocks.generateTitleWithFallback).not.toHaveBeenCalled();
      await deleteThreadRecord(threadRow(draft.threadId)!);
      expect(hostThreadRow(draft.threadId)).toBeUndefined();
      expect(threadRow(draft.threadId)).toBeUndefined();
      expect(peekPendingManagedRootLaunch(draft.threadId)).toBeUndefined();
      expect(supervisorTrace.startThreadCalls).toBe(0);
    },
  );

  it("keeps a draft deleted before its uncertain creation reply absent after reconciliation", async () => {
    const project = await fixtureProject();
    const client = readManagedLoopbackActivation()!.client;
    const send = client.sendThreadCommand as (
      command: RemoteThreadCommand,
      options?: { commandId?: string },
    ) => Promise<void>;
    const creation = Promise.withResolvers<void>();
    let uncertainReplyReady = false;
    vi.spyOn(client, "sendThreadCommand").mockImplementation(
      async (command: RemoteThreadCommand, options) => {
        if (command.kind !== "create") return send.call(client, command, options);
        try {
          await send.call(client, command, options);
        } catch (error) {
          uncertainReplyReady = true;
          await creation.promise;
          throw error;
        }
      },
    );
    const unsubscribe = onProjectThreadDataChanged(() => {
      if (hostThreadRow(draft.threadId)) throw new Error("catalog publication failed");
    });
    const launch = startThreadFromDraft(project, draft);
    await vi.waitFor(() => expect(uncertainReplyReady).toBe(true));
    unsubscribe();
    deleteThread(draft.threadId);
    expect(threadRow(draft.threadId)).toBeUndefined();
    creation.resolve();
    await launch;
    expect(hostThreadRow(draft.threadId)).toBeUndefined();
    expect(threadRow(draft.threadId)).toBeUndefined();
    expect(peekPendingManagedRootLaunch(draft.threadId)).toBeUndefined();
    expect(mocks.createWorktree).not.toHaveBeenCalled();
    expect(mocks.generateTitleWithFallback).not.toHaveBeenCalled();
    expect(supervisorTrace.startThreadCalls).toBe(0);
  });

  it("sends compensating deletion once when its acknowledgement is uncertain", async () => {
    const project = await fixtureProject();
    const client = readManagedLoopbackActivation()!.client;
    const send = client.sendThreadCommand as (
      command: RemoteThreadCommand,
      options?: { commandId?: string },
    ) => Promise<void>;
    const creation = Promise.withResolvers<void>();
    let creationReplyReady = false;
    let deleteCalls = 0;
    vi.spyOn(client, "sendThreadCommand").mockImplementation(
      async (command: RemoteThreadCommand, options) => {
        await send.call(client, command, options);
        if (command.kind === "create") {
          creationReplyReady = true;
          await creation.promise;
        }
        if (command.kind === "delete") {
          deleteCalls += 1;
          throw new RemoteClientError(
            "fixture delete reply lost",
            409,
            "command_outcome_uncertain",
          );
        }
      },
    );
    const launch = startThreadFromDraft(project, draft);
    await vi.waitFor(() => expect(creationReplyReady).toBe(true));
    deleteThread(draft.threadId);
    creation.resolve();
    await expect(launch).rejects.toMatchObject({ code: "command_outcome_uncertain" });
    expect(deleteCalls).toBe(1);
    expect(hostThreadRow(draft.threadId)).toBeUndefined();
    expect(mocks.createWorktree).not.toHaveBeenCalled();
    expect(mocks.generateTitleWithFallback).not.toHaveBeenCalled();
    expect(supervisorTrace.startThreadCalls).toBe(0);
  });

  it("retains a committed metadata row and uncertain receipt when catalog publication fails", async () => {
    await activate();
    const command = {
      kind: "create" as const,
      threadId: "uncertain-create",
      projectId: "p-1",
      title: "Saved draft",
      agentKind: "example",
      config: { model: "example/model" },
    };
    const options = { commandId: crypto.randomUUID() };
    const unsubscribe = onProjectThreadDataChanged(() => {
      throw new Error("catalog publication failed");
    });
    try {
      await expect(sendManagedRootThreadCommand(command, options)).rejects.toMatchObject({
        code: "command_outcome_uncertain",
      });
    } finally {
      unsubscribe();
    }
    expect(hostThreadRow(command.threadId)).toMatchObject({
      title: command.title,
      status: "inactive",
    });
    await expect(sendManagedRootThreadCommand(command, options)).rejects.toMatchObject({
      code: "command_outcome_uncertain",
    });
    expect(
      getSqlite()
        .prepare("SELECT state FROM remote_command_receipts WHERE command_id = ?")
        .get(options.commandId),
    ).toEqual({ state: "uncertain" });
    expect(supervisorTrace.startThreadCalls).toBe(0);
  });
});
