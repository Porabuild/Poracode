import { act, renderHook } from "@testing-library/react";
import { toast } from "@heroui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteDesktopClient } from "@/shared/remote/client";
import type { RemoteEnvironmentDescriptor } from "@/shared/remote";
import { getSqlite } from "@/host/db/connection";
import { useAppStore } from "@/renderer/state/appStore";
import { useDndHandlers } from "@/renderer/hooks/useDndHandlers";
import { readManagedLoopbackActivation } from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { resetDesktopLoopbackIntakeForTest } from "@/renderer/clientRuntime";
import { FLAT_THREAD_LIST_SORT_GROUP } from "@/renderer/views/MainView/parts/Sidebar/parts/sidebarProjectRows";
import { managedRootOrderIntentInFlightFor } from "./managedRootOrderFence";
import { __resetManagedRootLaunchMetadataCapabilityForTest } from "./rootLaunchMetadataCapability";
import {
  activate,
  externalClientFor,
  hostManualThreadOrder,
  hostThreadRow,
  rootThreads,
  seedProject,
  seedThread,
  setupManagedRootFixture,
  teardownManagedRootFixture,
} from "./managedRootFixture";

const originalOrder = ["t-1", "a2", "b1", "b2"];

function flatDrop() {
  const { result } = renderHook(() => useDndHandlers());
  act(() =>
    result.current.handleSortEnd(
      {
        type: "thread",
        threadId: "b1",
        projectId: "p-2",
        sortGroup: FLAT_THREAD_LIST_SORT_GROUP,
        sortIndex: 2,
      },
      2,
      0,
      FLAT_THREAD_LIST_SORT_GROUP,
      FLAT_THREAD_LIST_SORT_GROUP,
      {
        type: "thread",
        threadId: "t-1",
        projectId: "p-1",
        sortGroup: FLAT_THREAD_LIST_SORT_GROUP,
        sortIndex: 0,
      },
    ),
  );
}

async function liveFixture() {
  const server = await activate();
  await vi.waitFor(() => expect(rootThreads().map((thread) => thread.id)).toEqual(originalOrder));
  const activation = readManagedLoopbackActivation();
  if (!activation) throw new Error("fixture activation missing");
  return { server, activation };
}

beforeEach(async () => {
  await setupManagedRootFixture();
  __resetManagedRootLaunchMetadataCapabilityForTest();
  seedProject("p-2", 1);
  seedThread("a2", "p-1", undefined, 1);
  seedThread("b1", "p-2", undefined, 2);
  seedThread("b2", "p-2", undefined, 3);
});
afterEach(teardownManagedRootFixture);

describe("managed flat Manual reorder through real HTTP and SQLite", () => {
  it("dispatches the distinct receipt command and converges all ranks from a second client's bounded event", async () => {
    const { server, activation } = await liveFixture();
    const commands = vi.spyOn(activation.client, "sendThreadCommand");
    const paint = vi.spyOn(useAppStore.getState(), "reorderThreadsAcrossProjects");
    const beforeRows = originalOrder.map((id) => hostThreadRow(id)!);
    const outsideRange = hostThreadRow("b2");
    flatDrop();
    await vi.waitFor(() => expect(hostManualThreadOrder()).toEqual(["b1", "t-1", "a2", "b2"]));
    await vi.waitFor(() => expect(managedRootOrderIntentInFlightFor("threads")).toBe(false));
    expect(rootThreads().map((thread) => thread.id)).toEqual(hostManualThreadOrder());
    expect(commands).toHaveBeenCalledExactlyOnceWith(
      {
        kind: "reorder-flat",
        threadId: "b1",
        projectId: "p-2",
        targetThreadId: "t-1",
        placement: "before",
      },
      { commandId: expect.any(String) },
    );
    expect(commands.mock.invocationCallOrder[0]!).toBeLessThan(paint.mock.invocationCallOrder[0]!);
    expect(hostThreadRow("b2")).toEqual(outsideRange);

    const external = await externalClientFor(server);
    const pages = vi.spyOn(activation.client, "boundedThreadListPage");
    // Only b2/b1 are named by the event, while t-1 and a2 also change rank.
    // The existing manual-order pass must recover the complete id sequence.
    await external.sendThreadCommand(
      {
        kind: "reorder-flat",
        threadId: "b2",
        projectId: "p-2",
        targetThreadId: "b1",
        placement: "before",
      },
      { commandId: "external-flat-order" },
    );
    const externalOrder = ["b2", "b1", "t-1", "a2"];
    expect(hostManualThreadOrder()).toEqual(externalOrder);
    await vi.waitFor(() => expect(rootThreads().map((thread) => thread.id)).toEqual(externalOrder));
    expect(pages.mock.calls.some(([options]) => options?.order === "manual")).toBe(true);
    for (const before of beforeRows) {
      const { sort_order: _sortOrder, ...data } = before;
      const { sort_order: _nextSortOrder, ...nextData } = hostThreadRow(before.id as string)!;
      expect(nextData).toEqual(data);
    }
  });

  it.each(["absent", "future", "unavailable"] as const)(
    "refuses a %s capability without any optimistic cross-project order",
    async (scenario) => {
      const { activation } = await liveFixture();
      const descriptor = await activation.client.environment();
      const { flatThreadReorder: _flat, ...oldCapabilities } = descriptor.capabilities ?? {};
      const environment = vi.spyOn(activation.client, "environment");
      if (scenario === "unavailable")
        environment.mockRejectedValue(new Error("descriptor unavailable"));
      else
        environment.mockResolvedValue({
          ...descriptor,
          capabilities: {
            ...oldCapabilities,
            ...(scenario === "future" ? { flatThreadReorder: { versions: [2] } } : {}),
          },
        });
      const commands = vi.spyOn(activation.client, "sendThreadCommand");
      const refusals = vi.spyOn(toast, "danger").mockReturnValue("flat-refusal");
      const paints: string[][] = [];
      const unsubscribe = useAppStore.subscribe(() =>
        paints.push(rootThreads().map((thread) => thread.id)),
      );
      try {
        flatDrop();
        expect(rootThreads().map((thread) => thread.id)).toEqual(originalOrder);
        await vi.waitFor(() => expect(refusals).toHaveBeenCalledTimes(1));
        expect(commands).not.toHaveBeenCalled();
        expect(managedRootOrderIntentInFlightFor("threads")).toBe(false);
        expect(hostManualThreadOrder()).toEqual(originalOrder);
        expect(rootThreads().map((thread) => thread.id)).toEqual(originalOrder);
        expect(
          paints.every((order) => JSON.stringify(order) === JSON.stringify(originalOrder)),
        ).toBe(true);
        expect(getSqlite().prepare("SELECT command_id FROM remote_command_receipts").all()).toEqual(
          [],
        );
      } finally {
        unsubscribe();
      }
    },
  );

  it("refuses a retired activation's late capability before paint or command preparation", async () => {
    const { activation } = await liveFixture();
    const descriptor = await activation.client.environment();
    const pending = Promise.withResolvers<RemoteEnvironmentDescriptor>();
    vi.spyOn(activation.client, "environment").mockReturnValue(pending.promise);
    const commands = vi.spyOn(RemoteDesktopClient.prototype, "sendThreadCommand");
    const refusals = vi.spyOn(toast, "danger").mockReturnValue("flat-retired-refusal");
    flatDrop();
    expect(rootThreads().map((thread) => thread.id)).toEqual(originalOrder);
    resetDesktopLoopbackIntakeForTest();
    pending.resolve(descriptor);
    await vi.waitFor(() => expect(refusals).toHaveBeenCalledTimes(1));
    expect(commands).not.toHaveBeenCalled();
    expect(rootThreads().map((thread) => thread.id)).toEqual(originalOrder);
    expect(hostManualThreadOrder()).toEqual(originalOrder);
  });

  it("restores authoritative order after a supported command fails", async () => {
    const { activation } = await liveFixture();
    vi.spyOn(activation.client, "sendThreadCommand").mockRejectedValue(
      new Error("host refused move"),
    );
    const refusals = vi.spyOn(toast, "danger").mockReturnValue("flat-command-refusal");
    const paints: string[][] = [];
    const unsubscribe = useAppStore.subscribe(() =>
      paints.push(rootThreads().map((thread) => thread.id)),
    );
    try {
      flatDrop();
      await vi.waitFor(() => expect(refusals).toHaveBeenCalledTimes(1));
      await vi.waitFor(() =>
        expect(rootThreads().map((thread) => thread.id)).toEqual(originalOrder),
      );
      expect(paints).toContainEqual(["b1", "t-1", "a2", "b2"]);
      expect(hostManualThreadOrder()).toEqual(originalOrder);
      expect(managedRootOrderIntentInFlightFor("threads")).toBe(false);
    } finally {
      unsubscribe();
    }
  });
});
