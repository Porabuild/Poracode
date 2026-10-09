import { beforeEach, describe, expect, it } from "vitest";
import type { Project, SessionConfigOptions, SessionRef, Thread } from "@/shared/contracts";
import { useAppStore } from "../appStore";
import { remoteThreadId } from "../remoteProjection";
import { removeRemoteAppRows, syncRemoteAppRows } from "./appRows";

const desktopId = "desktop-1";

const inventory: SessionConfigOptions = [
  {
    id: "mode",
    type: "select",
    role: "mode",
    currentValue: "fast",
    values: [{ value: "fast" }, { value: "careful" }],
    groups: [],
  },
];

const sessionRef: SessionRef = {
  providerSessionId: "session-a",
  discoveredAt: "2026-10-08T00:00:00.000Z",
  executionIdentity: "execution-scope-1",
};

const hostProject: Project = {
  id: "proj-1",
  name: "Remote Repo",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-10-08T00:00:00.000Z",
};

/** A host-durable thread: the volatile inventory key is always omitted. */
function hostThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "host-thread-1",
    projectId: hostProject.id,
    title: "Host thread",
    agentKind: "test-agent",
    config: { model: "auto" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
    sessionRef,
    ...overrides,
  };
}

const appId = remoteThreadId(desktopId, hostThread().id);

function residentRow(): Thread {
  const row = useAppStore.getState().threads.find((thread) => thread.id === appId);
  if (!row) throw new Error(`mirrored row ${appId} not found`);
  return row;
}

/**
 * Bootstrap one synced mirror, then apply the inventory the way the live
 * event stream does — the shared runtime write path on the mirrored row.
 */
function seedLiveMirrorThread(pageOverrides: Partial<Thread> = {}): Thread {
  syncRemoteAppRows(desktopId, [hostProject], [hostThread(pageOverrides)]);
  useAppStore.getState().updateThreadRuntime(appId, {
    status: "idle",
    attention: "none",
    agentKind: hostThread().agentKind,
    canResumeWithConfig: true,
    config: hostThread().config,
    sessionRef,
    sessionConfigOptions: inventory,
  });
  return residentRow();
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
  // Clears mirrored rows AND the identity-preserving projection cache.
  removeRemoteAppRows(desktopId);
});

describe("remote mirror rows keep live session inventories", () => {
  it("carries the live inventory through a durable page refresh that omits the field", () => {
    seedLiveMirrorThread();

    syncRemoteAppRows(desktopId, [hostProject], [hostThread({ title: "Refreshed" })]);

    const row = residentRow();
    expect(row.sessionConfigOptions).toBe(inventory);
    expect(row.title).toBe("Refreshed");
  });

  it("carries through a bounded partial page too", () => {
    seedLiveMirrorThread();

    syncRemoteAppRows(desktopId, [hostProject], [hostThread({ title: "Bounded page" })], {
      partial: true,
    });

    const row = residentRow();
    expect(row.sessionConfigOptions).toBe(inventory);
    expect(row.title).toBe("Bounded page");
  });

  it("keeps replaced rows reference-stable while the page and inventory are unchanged", () => {
    seedLiveMirrorThread();
    const page = hostThread();

    syncRemoteAppRows(desktopId, [hostProject], [page]);
    const first = residentRow();
    syncRemoteAppRows(desktopId, [hostProject], [page]);
    expect(residentRow()).toBe(first);
    expect(first.sessionConfigOptions).toBe(inventory);

    // A live inventory update (new object from the event stream) installs a
    // new row; the next unchanged sync is stable again on the new pair.
    const nextInventory: SessionConfigOptions = [
      {
        id: "mode",
        type: "select",
        role: "mode",
        currentValue: "careful",
        values: [{ value: "fast" }, { value: "careful" }],
        groups: [],
      },
    ];
    useAppStore.getState().updateThreadRuntime(appId, {
      status: "idle",
      attention: "none",
      agentKind: hostThread().agentKind,
      canResumeWithConfig: true,
      config: hostThread().config,
      sessionRef,
      sessionConfigOptions: nextInventory,
    });
    syncRemoteAppRows(desktopId, [hostProject], [page]);
    const second = residentRow();
    expect(second).not.toBe(first);
    expect(second.sessionConfigOptions).toBe(nextInventory);
    syncRemoteAppRows(desktopId, [hostProject], [page]);
    expect(residentRow()).toBe(second);
  });

  it("does not carry the inventory to a page owned by a new session or provider", () => {
    seedLiveMirrorThread();

    syncRemoteAppRows(
      desktopId,
      [hostProject],
      [hostThread({ sessionRef: { ...sessionRef, providerSessionId: "session-b" } })],
    );
    expect(residentRow().sessionConfigOptions).toBeUndefined();

    seedLiveMirrorThread();
    syncRemoteAppRows(desktopId, [hostProject], [hostThread({ agentKind: "other-agent" })]);
    expect(residentRow().sessionConfigOptions).toBeUndefined();

    seedLiveMirrorThread();
    syncRemoteAppRows(
      desktopId,
      [hostProject],
      [hostThread({ sessionRef: { ...sessionRef, executionIdentity: "execution-scope-2" } })],
    );
    expect(residentRow().sessionConfigOptions).toBeUndefined();
  });

  it("lets an explicit page inventory win and does not resurrect onto retirement", () => {
    seedLiveMirrorThread();
    syncRemoteAppRows(desktopId, [hostProject], [hostThread({ sessionConfigOptions: null })]);
    expect(residentRow().sessionConfigOptions).toBeNull();

    seedLiveMirrorThread();
    syncRemoteAppRows(desktopId, [hostProject], [hostThread({ status: "inactive" })]);
    expect(residentRow().sessionConfigOptions).toBeUndefined();
  });
});
