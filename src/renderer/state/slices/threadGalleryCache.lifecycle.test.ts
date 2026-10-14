import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Project } from "@/shared/contracts";
import {
  getCachedThreadGallery,
  invalidateCachedThreadGallery,
} from "@/renderer/components/thread/ChatPane/parts/items/threadGalleryImages";
import { useAppStore } from "../appStore";
import {
  applyRootCatalogThreadRows,
  removeRootCatalogProjects,
  removeRootCatalogThreads,
} from "../managedRootCatalog/rootCatalogRows";
import { createInitialRuntimeEventState, type RuntimeChatItem } from "./runtimeEventSlice";

const cachedIds = new Set<string>();

function createThread(id: string, projectId = "project", remote = false) {
  return useAppStore.getState().createThread({
    threadId: id,
    projectId,
    agentKind: "test-agent",
    config: { model: "auto" },
    prompt: "Gallery owner",
    presentationMode: "gui",
    focus: false,
    suppressHostCreateIntent: true,
    ...(remote ? { remoteServerId: "paired", remoteId: "host-thread" } : {}),
  });
}

function cache(threadId: string, image = false, itemIds = ["row"]) {
  cachedIds.add(threadId);
  const itemsById: Record<string, RuntimeChatItem> = Object.fromEntries(
    itemIds.map((id) => [
      id,
      {
        id,
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "Image-free history ".repeat(512) },
        ...(image
          ? { payload: { content: [{ kind: "image", dataUrl: "data:image/png;base64,eA==" }] } }
          : {}),
      },
    ]),
  );
  useAppStore.setState((state) => ({
    runtimeItemIdsByThread: { ...state.runtimeItemIdsByThread, [threadId]: itemIds },
    runtimeItemsByIdByThread: { ...state.runtimeItemsByIdByThread, [threadId]: itemsById },
  }));
  const revision = { structuralVersion: 1, remoteRevision: "", locale: "en", imageAuthority: null };
  const read = () => getCachedThreadGallery(threadId, itemIds, itemsById, {}, revision);
  return { read, result: read() };
}

beforeEach(() => {
  useAppStore.setState({
    ...createInitialRuntimeEventState(),
    projects: [],
    threads: [],
    view: { kind: "home" },
    keepAlivePaneIds: [],
  });
});

afterEach(() => {
  for (const id of cachedIds) invalidateCachedThreadGallery(id);
  cachedIds.clear();
});

describe("unread thread gallery retirement", () => {
  it.each([false, true])("retires a deleted closed history (has image: %s)", (image) => {
    createThread("removed");
    createThread("survivor");
    const removed = cache("removed", image);
    const survivor = cache("survivor");

    useAppStore.getState().deleteThread("removed");

    expect(useAppStore.getState().runtimeItemsByIdByThread.removed).toBeUndefined();
    expect(removed.read()).not.toBe(removed.result);
    expect(survivor.read()).toBe(survivor.result);
  });

  it("retires accepted deletion even when the thread row is already absent", () => {
    const removed = cache("absent");
    useAppStore.getState().deleteThread("absent");
    expect(removed.read()).not.toBe(removed.result);
  });

  it("retires only expired archived rows actually purged", () => {
    createThread("expired");
    createThread("active");
    const expired = cache("expired");
    const active = cache("active");
    useAppStore.setState((state) => ({
      threads: state.threads.map((thread) =>
        thread.id === "expired"
          ? { ...thread, archived: true, archivedAt: "2020-01-01T00:00:00.000Z" }
          : thread,
      ),
    }));
    useAppStore.getState().purgeStaleArchivedThreads(7);
    expect(expired.read()).not.toBe(expired.result);
    expect(active.read()).toBe(active.result);
  });

  it("retires confirmed managed catalog removals and keeps other owners", () => {
    createThread("removed");
    createThread("survivor");
    createThread("projected", "project", true);
    const removed = cache("removed");
    const survivor = cache("survivor");
    const projected = cache("projected");

    removeRootCatalogThreads(["removed", "projected"]);

    expect(removed.read()).not.toBe(removed.result);
    expect(survivor.read()).toBe(survivor.result);
    expect(projected.read()).toBe(projected.result);
  });

  it("retires a repeated confirmed catalog removal after metadata is already absent", () => {
    const removed = cache("absent-root");
    removeRootCatalogThreads(["absent-root"]);
    expect(removed.read()).not.toBe(removed.result);
  });

  it("retires all histories deleted with a project and keeps unrelated owners", () => {
    const project = useAppStore.getState().addProject({ kind: "posix", path: "/gallery-removed" });
    createThread("removed-a", project.id);
    createThread("removed-b", project.id);
    createThread("survivor");
    const a = cache("removed-a");
    const b = cache("removed-b");
    const survivor = cache("survivor");

    useAppStore.getState().deleteProject(project.id);

    expect(a.read()).not.toBe(a.result);
    expect(b.read()).not.toBe(b.result);
    expect(survivor.read()).toBe(survivor.result);
  });

  it.each(["clearThreadRuntimeEvents", "evictThreadRuntimeItems"] as const)(
    "retires unread history on %s, including repeated cleanup",
    (action) => {
      const removed = cache("removed");
      const survivor = cache("survivor");
      useAppStore.getState()[action]("removed");
      expect(removed.read()).not.toBe(removed.result);
      const recached = removed.read();
      useAppStore.getState()[action]("removed");
      expect(removed.read()).not.toBe(recached);
      expect(survivor.read()).toBe(survivor.result);
    },
  );

  it("retires discarded rows on actual trim and known-checkpoint truncation", () => {
    const trimmed = cache("trimmed", false, ["head", "tail"]);
    const truncated = cache("truncated", false, ["checkpoint", "tail"]);
    useAppStore.getState().trimThreadRuntimeItems("trimmed", 1, 1);
    useAppStore.getState().applyRuntimeEvent("truncated", {
      type: "runtime.truncated",
      threadId: "truncated",
      itemId: "checkpoint",
      removedCompletedTurnAnchors: [],
    });
    expect(trimmed.read()).not.toBe(trimmed.result);
    expect(truncated.read()).not.toBe(truncated.result);
  });

  it("keeps warm galleries through pane close, archive and a pure text tick", () => {
    createThread("warm");
    createThread("visible");
    const warm = cache("warm");
    useAppStore.setState({ view: { kind: "thread", panes: ["warm", "visible"] } });
    useAppStore.getState().closePane("warm");
    useAppStore.getState().archiveThread("warm");
    useAppStore.getState().applyRuntimeEvent("warm", {
      type: "content.delta",
      threadId: "warm",
      itemId: "row",
      stream: "assistant_text",
      delta: " live",
    });
    expect(warm.read()).toBe(warm.result);
  });

  it("keeps no-op trim/truncate and declined hydration", () => {
    const retained = cache("retained");
    useAppStore.getState().trimThreadRuntimeItems("retained", 0, 1, new Set(["row"]));
    useAppStore.getState().applyRuntimeEvent("retained", {
      type: "runtime.truncated",
      threadId: "retained",
      itemId: "not-loaded",
      removedCompletedTurnAnchors: [],
    });
    useAppStore.getState().hydrateThreadRuntimeItems("retained", []);
    expect(retained.read()).toBe(retained.result);
  });

  it("retires an accepted empty-dictionary hydration replacement", () => {
    const previous = cache("empty-baseline", false, []);
    useAppStore.getState().hydrateThreadRuntimeItems("empty-baseline", [
      {
        id: "fresh",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "Fresh" },
      },
    ]);
    expect(useAppStore.getState().runtimeItemIdsByThread["empty-baseline"]).toEqual(["fresh"]);
    expect(previous.read()).not.toBe(previous.result);
  });

  it("keeps omitted/uncertain rows and surviving project repairs", () => {
    const duplicate: Project = {
      id: "duplicate",
      name: "Duplicate",
      location: { kind: "posix", path: "/gallery-repaired" },
      createdAt: "2025-01-01T00:00:00.000Z",
    };
    const canonical = { ...duplicate, id: "canonical" };
    useAppStore.setState({ projects: [duplicate, canonical] });
    const thread = createThread("retained", duplicate.id);
    const retained = cache("retained");
    applyRootCatalogThreadRows([], new Set());
    applyRootCatalogThreadRows([{ ...thread, title: "Refreshed row" }], new Set([thread.id]));
    removeRootCatalogProjects([duplicate.id]);
    expect(useAppStore.getState().threads.find((row) => row.id === thread.id)?.projectId).toBe(
      canonical.id,
    );
    expect(retained.read()).toBe(retained.result);
  });
});
