import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getSqlite } from "@/host/db/connection";
import { RemoteDesktopClient } from "@/shared/remote/client";
import { useAppStore } from "@/renderer/state/appStore";
import { dispatchManagedRootThreadReorder } from "./rootCatalogIntents";
import {
  managedRootOrderGenerationFor,
  managedRootOrderIntentInFlightFor,
} from "./managedRootOrderFence";
import {
  activate,
  hostManualThreadOrder,
  rootThreads,
  seedThread,
  setupManagedRootFixture,
  teardownManagedRootFixture,
} from "./managedRootFixture";

beforeEach(setupManagedRootFixture);
afterEach(teardownManagedRootFixture);

it("retries failed order recovery when membership removes its anchor during the page walk", async () => {
  for (let index = 0; index < 250; index += 1) {
    seedThread(`t-${index.toString(16).padStart(4, "0")}`);
  }
  const inventory = Promise.withResolvers<void>();
  const recoveryPage = Promise.withResolvers<void>();
  const recoveryHeld = Promise.withResolvers<void>();
  let holdRecovery = false;
  const originalPage = RemoteDesktopClient.prototype.boundedThreadListPage;
  const pages = vi
    .spyOn(RemoteDesktopClient.prototype, "boundedThreadListPage")
    .mockImplementation(async function (this: RemoteDesktopClient, options) {
      if (options?.mode === "inventory") await inventory.promise;
      const result = await originalPage.call(this, options);
      if (holdRecovery && options?.mode === "page" && options.cursor) {
        recoveryHeld.resolve();
        await recoveryPage.promise;
      }
      return result;
    });
  const membership = vi.spyOn(RemoteDesktopClient.prototype, "boundedCatalogMembership");
  const commands = vi.spyOn(RemoteDesktopClient.prototype, "sendThreadCommand");
  try {
    await activate();
    // Let the initial manual paint finish while the independent inventory walk
    // remains held. The anchor is on page 1, in the inventory's known-before set.
    await vi.waitFor(() => expect(managedRootOrderGenerationFor("threads")).toBeGreaterThan(2), {
      timeout: 10_000,
    });
    expect(rootThreads().map((thread) => thread.id)).toEqual(hostManualThreadOrder());
    expect(rootThreads()).toHaveLength(251);
    await vi.waitFor(() =>
      expect(pages.mock.calls.some(([options]) => options?.mode === "inventory")).toBe(true),
    );

    useAppStore.setState((state) => ({ threads: [...state.threads].reverse() }));
    getSqlite().prepare("DELETE FROM threads WHERE id = 't-0030'").run();
    const authoritative = hostManualThreadOrder();
    holdRecovery = true;
    expect(dispatchManagedRootThreadReorder("t-0000", "t-0030", "after")).toBe(true);
    await recoveryHeld.promise;
    expect(commands).toHaveBeenCalledTimes(1);
    await expect(commands.mock.results[0]!.value).rejects.toMatchObject({
      status: 404,
      code: "thread_not_found",
    });
    expect(managedRootOrderIntentInFlightFor("threads")).toBe(false);
    const generation = managedRootOrderGenerationFor("threads");
    const optimisticOrder = rootThreads().map((thread) => thread.id);

    // Complete real inventory + membership HTTP reads while the recovery's
    // real continuation response is held. No synthetic row removal or event.
    inventory.resolve();
    await vi.waitFor(() => expect(rootThreads().some((row) => row.id === "t-0030")).toBe(false), {
      timeout: 10_000,
    });
    expect(membership.mock.calls.some(([request]) => request.threadIds?.includes("t-0030"))).toBe(
      true,
    );
    expect(managedRootOrderGenerationFor("threads")).toBe(generation);
    expect(rootThreads().map((thread) => thread.id)).toEqual(
      optimisticOrder.filter((id) => id !== "t-0030"),
    );
    expect(rootThreads().map((thread) => thread.id)).not.toEqual(authoritative);

    holdRecovery = false;
    recoveryPage.resolve();
    await vi.waitFor(
      () => expect(rootThreads().map((thread) => thread.id)).toEqual(authoritative),
      { timeout: 10_000 },
    );
    // The refused walk requests one ordinary manual refresh, including all
    // continuation pages. It does not resend the rejected relative command.
    expect(
      pages.mock.calls.filter(([options]) => options?.mode === "page" && !options.cursor),
    ).toHaveLength(1);
    expect(commands).toHaveBeenCalledTimes(1);
    expect(new Set(rootThreads().map((thread) => thread.id)).size).toBe(250);
  } finally {
    holdRecovery = false;
    inventory.resolve();
    recoveryPage.resolve();
  }
}, 30_000);
