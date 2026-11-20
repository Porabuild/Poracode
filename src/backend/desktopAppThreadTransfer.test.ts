import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, initDatabase } from "@/host/db/connection";
import { dbGetThread, dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { nativeBindingEnv, testThread } from "@/host/db/runtimeItems.testFixtures";
import type { SupervisorClient } from "@/host/supervisor/SupervisorClient";
import type { BackendNativeRequest } from "@/shared/backendHostProtocol";
import { appThreadTransferInputSchema } from "@/shared/contracts/appThreadTransfer";
import { archiveTransferredThread, runDesktopAppThreadTransfer } from "./desktopAppThreadTransfer";

const threadId = "thread-1";
const input = appThreadTransferInputSchema.parse({
  action: "move",
  threadId,
  destinationProjectId: "paired-project",
  operationKey: "transfer-001",
});

beforeEach(() => {
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  initDatabase(":memory:");
  dbUpsertProject(
    {
      id: "project-1",
      name: "Source",
      location: { kind: "posix", path: "/fixture/source" },
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    0,
  );
  dbUpsertThread({ ...testThread(), status: "idle" }, 0);
});

afterEach(() => {
  closeDatabase();
  delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
});

type NativeRequest = (request: BackendNativeRequest) => Promise<unknown>;
type Supervisor = Pick<SupervisorClient, "runThreadMutation" | "call">;

function supervisor(status: "idle" | "working", confirmed = true) {
  return {
    runThreadMutation: <Result>(_id: string, operation: () => Promise<Result>) => operation(),
    call: vi.fn<Supervisor["call"]>(async (name) => {
      if (name === "getThreadSnapshots") return [{ threadId, status }] as never;
      if (name === "closeThreadConfirmed") return { confirmed } as never;
      throw new Error(`Unexpected supervisor call ${name}`);
    }),
  };
}

describe("desktop App Controls thread transfer", () => {
  it("uses one authenticated client attempt and replays the confirmed destination after archive", async () => {
    const requestNative = vi.fn<NativeRequest>(async (request) => {
      if (request.operation !== "thread-transfer") throw new Error("Unexpected native request");
      return {
        action: "move",
        threadId: request.payload.ids?.targetThreadId,
        destinationProjectId: "paired-project",
        targetLabel: "Machine",
        branchRenamed: false,
        sourceArchived: false,
        continueFailed: false,
      };
    });
    const authority = supervisor("idle");
    const publish = vi.fn<(id: string) => void>();
    const move = () =>
      runDesktopAppThreadTransfer("source-host", input, requestNative, (source) =>
        archiveTransferredThread(authority, source, publish),
      );
    const moved = await move();
    expect(moved).toMatchObject({
      action: "move",
      sourceArchived: true,
      threadId: expect.stringMatching(/^moved-/),
    });
    expect(dbGetThread(threadId)?.archived).toBe(true);
    expect(authority.call.mock.calls.map(([name]) => name)).toEqual([
      "getThreadSnapshots",
      "closeThreadConfirmed",
    ]);
    expect(publish).toHaveBeenCalledExactlyOnceWith(threadId);
    await expect(move()).resolves.toEqual(moved);
    expect(requestNative).toHaveBeenCalledTimes(1);
  });

  it("keeps the source open if a new turn started before archival", async () => {
    const original = dbGetThread(threadId)!;
    const authority = supervisor("working");
    const publish = vi.fn<(id: string) => void>();
    await expect(archiveTransferredThread(authority, original, publish)).resolves.toBe(false);
    expect(authority.call.mock.calls.map(([name]) => name)).toEqual(["getThreadSnapshots"]);
    expect(dbGetThread(threadId)?.archived).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it("keeps the source open when disconnect leaves a destination commit unconfirmed", async () => {
    const requestNative = vi
      .fn<NativeRequest>()
      .mockRejectedValueOnce(new Error("Desktop disconnected"))
      .mockImplementation(async (request) => {
        if (request.operation !== "thread-transfer" || !request.payload.reconcile)
          throw new Error("Unexpected new transfer");
        return {
          action: "move",
          threadId: request.payload.ids?.targetThreadId,
          destinationProjectId: "paired-project",
          targetLabel: "Machine",
          recovered: true,
          sourceArchived: false,
        };
      });
    const archive = vi.fn<(source: ReturnType<typeof testThread>) => Promise<boolean>>();
    const move = () => runDesktopAppThreadTransfer("source-host", input, requestNative, archive);
    await expect(move()).rejects.toThrow(/Check for thread moved-/);
    await expect(move()).resolves.toMatchObject({ recovered: true, sourceArchived: false });
    expect(requestNative).toHaveBeenCalledTimes(2);
    expect(requestNative.mock.calls[1]?.[0]).toMatchObject({
      operation: "thread-transfer",
      payload: { reconcile: true },
    });
    await expect(move()).resolves.toMatchObject({ recovered: true });
    expect(requestNative).toHaveBeenCalledTimes(2);
    expect(archive).not.toHaveBeenCalled();
    expect(dbGetThread(threadId)?.archived).toBe(false);
  });

  it("allows the same move after a confirmed preflight failure", async () => {
    const requestNative = vi
      .fn<NativeRequest>()
      .mockResolvedValueOnce({ type: "not-started", message: "Open the source desktop" })
      .mockImplementation(async (request) => {
        if (request.operation !== "thread-transfer") throw new Error("Unexpected request");
        return {
          action: "move",
          threadId: request.payload.ids?.targetThreadId,
          destinationProjectId: "paired-project",
          targetLabel: "Machine",
          branchRenamed: false,
          sourceArchived: false,
          continueFailed: false,
        };
      });
    const archive = vi.fn<(source: ReturnType<typeof testThread>) => Promise<boolean>>(
      async () => true,
    );
    const move = () => runDesktopAppThreadTransfer("source-host", input, requestNative, archive);
    await expect(move()).rejects.toThrow("Open the source desktop");
    expect(archive).not.toHaveBeenCalled();
    await expect(move()).resolves.toMatchObject({ action: "move", sourceArchived: true });
    expect(requestNative).toHaveBeenCalledTimes(2);
    expect(requestNative.mock.calls[0]).toEqual(requestNative.mock.calls[1]);
  });
});
