import { beforeEach, describe, expect, it } from "vitest";
import type { Project } from "@/shared/contracts";
import { useAppStore } from "../appStore";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import {
  NATIVE_VISUAL_UI_KEY,
  nativeVisualUiKey,
  useNativeVisualUiStore,
} from "../nativeVisualUiStore";
import {
  clearManagedParentAuthority,
  publishManagedParentAuthority,
} from "../remoteServers/managedLoopbackOwner";
import {
  clearTimelineMeasurementCache,
  readTimelineMeasurements,
  writeTimelineMeasurements,
} from "../timelineMeasurementCache";
import {
  applyRootCatalogThreadRows,
  removeRootCatalogProjects,
  removeRootCatalogThreads,
} from "./rootCatalogRows";

const signature = "500:14px";
const measurement = { key: "completed-row", index: 0, size: 184 };

function createThread(id: string, projectId = "project", remote = false) {
  return useAppStore.getState().createThread({
    threadId: id,
    projectId,
    agentKind: "test-agent",
    config: { model: "auto" },
    prompt: "Measurement owner",
    focus: false,
    suppressHostCreateIntent: true,
    ...(remote ? { remoteServerId: "paired", remoteId: "host-thread" } : {}),
  });
}

function cache(id: string) {
  writeTimelineMeasurements(id, signature, [measurement]);
}

beforeEach(() => {
  clearTimelineMeasurementCache();
  useAppStore.setState({ projects: [], threads: [], view: { kind: "home" } });
});

describe("accepted root catalog measurement retirement", () => {
  it("retains native inputs across resident eviction and clears only a confirmed owning-host deletion", () => {
    const originalEntries = useNativeVisualUiStore.getState().entries;
    const stored = localStorage.getItem(NATIVE_VISUAL_UI_KEY);
    publishManagedParentAuthority({
      hostDesktopId: "host-a",
      endpoint: "http://127.0.0.1:1/",
      sshEnvironments: false,
      scopes: [],
      client: {} as RemoteDesktopClient,
      accessToken: () => undefined,
    });
    try {
      const a = nativeVisualUiKey("host-a", "unopened", "item", 0, "source");
      const b = nativeVisualUiKey("host-b", "unopened", "item", 0, "source");
      for (const [key, hostId] of [
        [a, "host-a"],
        [b, "host-b"],
      ]) {
        useNativeVisualUiStore
          .getState()
          .put(key!, { hostId: hostId!, threadId: "unopened", inputs: [["n", 2]], zoom: 100 });
      }
      createThread("unopened");
      applyRootCatalogThreadRows([], new Set());
      useAppStore.getState().deleteThread("unopened");
      expect(useNativeVisualUiStore.getState().entries.has(a)).toBe(true);
      removeRootCatalogThreads(["unopened"]);
      expect(useNativeVisualUiStore.getState().entries.has(a)).toBe(false);
      expect(useNativeVisualUiStore.getState().entries.has(b)).toBe(true);
    } finally {
      clearManagedParentAuthority();
      useNativeVisualUiStore.setState({ entries: originalEntries });
      if (stored === null) localStorage.removeItem(NATIVE_VISUAL_UI_KEY);
      else localStorage.setItem(NATIVE_VISUAL_UI_KEY, stored);
    }
  });

  it("forgets accepted thread removals while preserving other root and projected rows", () => {
    createThread("removed");
    createThread("survivor");
    createThread("projected", "project", true);
    for (const id of ["removed", "survivor", "projected"]) cache(id);

    removeRootCatalogThreads(["removed"]);

    expect(useAppStore.getState().threads.map((thread) => thread.id)).toEqual([
      "projected",
      "survivor",
    ]);
    expect(readTimelineMeasurements("removed", signature)).toEqual([]);
    expect(readTimelineMeasurements("survivor", signature)).toEqual([measurement]);
    expect(readTimelineMeasurements("projected", signature)).toEqual([measurement]);
  });

  it("keeps omitted and uncertain rows through incremental catalog pages", () => {
    const retained = createThread("retained");
    createThread("omitted");
    cache("retained");
    cache("omitted");

    applyRootCatalogThreadRows([], new Set());
    applyRootCatalogThreadRows([{ ...retained, title: "Refreshed row" }], new Set());

    expect(useAppStore.getState().threads).toHaveLength(2);
    expect(readTimelineMeasurements("retained", signature)).toEqual([measurement]);
    expect(readTimelineMeasurements("omitted", signature)).toEqual([measurement]);
  });

  it("keeps a surviving thread snapshot when accepted project repair remaps its project", () => {
    const duplicate: Project = {
      id: "duplicate",
      name: "Duplicate",
      location: { kind: "posix", path: "/measurement-repaired" },
      createdAt: "2025-01-01T00:00:00.000Z",
    };
    const canonical = { ...duplicate, id: "canonical" };
    useAppStore.setState({ projects: [duplicate, canonical] });
    createThread("survivor", duplicate.id);
    cache("survivor");

    removeRootCatalogProjects([duplicate.id]);

    expect(
      useAppStore.getState().threads.find((thread) => thread.id === "survivor")?.projectId,
    ).toBe(canonical.id);
    expect(readTimelineMeasurements("survivor", signature)).toEqual([measurement]);
  });
});
