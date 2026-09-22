import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getSqlite } from "@/host/db/connection";
import { useAppStore } from "@/renderer/state/appStore";
import {
  hasHydratedThreadRuntimeItems,
  hydrateThreadRuntimeItems,
} from "@/renderer/state/chatRuntimePersister";
import {
  activate,
  preloadCalls,
  seedRuntimeItems,
  seedThread,
  setupManagedRootFixture,
  teardownManagedRootFixture,
  threadRow,
} from "./managedRootFixture";

beforeEach(setupManagedRootFixture);
afterEach(teardownManagedRootFixture);

it("hydrates the out-of-window goal from bounded history without a legacy supervisor read", async () => {
  seedThread("t-goal-history");
  seedRuntimeItems("t-goal-history", 700);
  getSqlite()
    .prepare(
      "UPDATE thread_runtime_items SET type = 'goal', state = 'updated', payload = ? WHERE thread_id = ? AND item_id = ?",
    )
    .run(
      JSON.stringify({ action: "set", objective: "Keep the durable goal", status: "active" }),
      "t-goal-history",
      "item-0",
    );
  const legacyReads: string[] = [];
  await activate({
    supervisorObserver: (procedure) => {
      if (procedure === "dbGetLatestThreadGoalItem") {
        legacyReads.push(procedure);
        throw new Error("The supervisor does not own database goal reads");
      }
    },
  });
  await vi.waitFor(() => expect(threadRow("t-goal-history")).toBeDefined(), { timeout: 15_000 });

  await hydrateThreadRuntimeItems("t-goal-history");

  expect(hasHydratedThreadRuntimeItems("t-goal-history")).toBe(true);
  expect(useAppStore.getState().runtimeHydrationStatus["t-goal-history"] ?? null).toBeNull();
  expect(
    useAppStore.getState().runtimeItemsByIdByThread["t-goal-history"]?.["item-0"],
  ).toMatchObject({
    type: "goal",
    payload: { objective: "Keep the durable goal", status: "active" },
  });
  expect(useAppStore.getState().runtimeItemIdsByThread["t-goal-history"]).toContain("item-699");
  expect(legacyReads).toEqual([]);
  expect(preloadCalls).not.toContain("dbGetLatestThreadGoalItem");
}, 60_000);
