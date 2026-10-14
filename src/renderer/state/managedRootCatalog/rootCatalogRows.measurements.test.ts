import { beforeEach, describe, expect, it } from "vitest";
import type { Project } from "@/shared/contracts";
import { useAppStore } from "../appStore";
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
