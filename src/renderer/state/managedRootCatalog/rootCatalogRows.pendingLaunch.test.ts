import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import { useAppStore } from "../appStore";
import { applyRootCatalogThreadRows } from "./rootCatalogRows";
import {
  __resetManagedRootCatalogStoreForTest,
  notePendingManagedRootLaunch,
} from "./rootCatalogStore";

function seedLaunchingThread(id: string): Thread {
  return useAppStore.getState().createThread({
    threadId: id,
    projectId: "project",
    agentKind: "test-agent",
    config: { model: "auto" },
    prompt: "Pending launch",
    presentationMode: "gui",
    focus: false,
    suppressHostCreateIntent: true,
  });
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    projects: [],
    threads: [],
    view: { kind: "home" },
    lastRuntimeConfigByThreadId: {},
    runtimeLaunchConfigByThreadId: {},
    threadMentionToolsAvailableByThreadId: {},
  });
});

afterEach(() => {
  __resetManagedRootCatalogStoreForTest();
});

describe("root catalog pages during a pending launch", () => {
  it("keeps the local launching status when the just-created host row lands before creation is marked", () => {
    const resident = seedLaunchingThread("thread-pending");
    expect(resident.status).toBe("launching");
    // The create command is still in flight: creation is not marked yet, so
    // only the pending launch itself proves this row is mid-launch.
    notePendingManagedRootLaunch(resident.id, true);

    applyRootCatalogThreadRows(
      [{ ...resident, status: "inactive", attention: "none", title: "Host row" }],
      new Set(),
    );

    const row = useAppStore.getState().threads.find((candidate) => candidate.id === resident.id)!;
    expect(row.status).toBe("launching");
    // Durable page fields still apply on top of the carried runtime status.
    expect(row.title).toBe("Host row");
  });

  it("applies an inactive host status when no launch is pending", () => {
    const resident = seedLaunchingThread("thread-settled");

    applyRootCatalogThreadRows([{ ...resident, status: "inactive", attention: "none" }], new Set());

    expect(useAppStore.getState().threads.find((row) => row.id === resident.id)?.status).toBe(
      "inactive",
    );
  });
});
