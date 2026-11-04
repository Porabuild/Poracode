import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { catalogOrderIntentInFlightFor } from "@/renderer/state/remoteServers/catalog/catalogOrderFence";
import type { EntityHost } from "./entityHost";
import { dispatchHostProjectReorder, dispatchHostThreadReorder } from "./hostCatalogReorder";

const toastDanger = vi.hoisted(() => vi.fn<(message: string) => void>());
vi.mock("@heroui/react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, toast: { ...(actual.toast as object), danger: toastDanger } };
});

const hostRef = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("./entityHost", () => ({
  intentHost: () => hostRef.current,
  entityHost: (row: { readonly id: string } | undefined) =>
    row?.id.startsWith("h:") ? hostRef.current : undefined,
  isSameHost: (left: EntityHost, right: EntityHost) =>
    left.kind === right.kind && left.connectionKey === right.connectionKey,
}));

const FENCE_KEY = "fake-host";

function makeThread(id: string, projectId = "h:p1"): Thread {
  return {
    id,
    projectId,
    title: id,
    agentKind: "claude",
    config: {},
    status: "idle",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as Thread;
}

function makeProject(id: string): Project {
  return {
    id,
    name: id,
    location: { kind: "posix", path: `/tmp/${id}` },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

// A host owns ids shaped `h:<hostId>`; any other id belongs to a different host.
const hostIdOf = (id: string) => (id.startsWith("h:") ? id.slice(2) : undefined);

function makeHost() {
  const release = vi.fn<() => void>();
  const catalogOrder = {
    fenceKey: FENCE_KEY,
    persistsOrder: vi.fn<() => boolean>(() => true),
    supportsFlatThreadReorder: vi.fn<() => Promise<boolean>>(async () => true),
    flatRefusal: vi.fn<() => Error | undefined>(() => new Error("flat refused")),
    confirmOrder: vi.fn<(kind: string) => void>(),
    recoverOrder: vi.fn<(kind: string) => void>(),
  };
  const host = {
    kind: "paired" as const,
    connectionKey: "d1",
    hostId: "t1",
    sessionKey: "paired:d1:0",
    isCurrent: vi.fn<() => boolean>(() => true),
    sendThreadCommand: vi.fn<(command: unknown) => Promise<void>>(async () => {}),
    runProjectCommand: vi.fn<(command: unknown) => Promise<void>>(async () => {}),
    pinThread: vi.fn<(id: string) => () => void>(() => release),
    hostThreadId: hostIdOf,
    hostProjectId: hostIdOf,
    catalogOrder,
  };
  hostRef.current = host;
  return { host, catalogOrder, release };
}

beforeEach(() => {
  toastDanger.mockReset();
  hostRef.current = undefined;
  useAppStore.setState({
    projects: [makeProject("h:p1"), makeProject("h:p2")],
    threads: [makeThread("h:t1"), makeThread("h:t2"), makeThread("h:t3", "h:p2")],
  });
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("dispatchHostProjectReorder", () => {
  const request = (paint: () => void) => ({
    projectId: "h:p1",
    targetProjectId: "h:p2",
    placement: "after" as const,
    paint,
  });

  it("paints, fences, and sends the host-id command, then converges on success", async () => {
    const { host, catalogOrder } = makeHost();
    const pending = Promise.withResolvers<void>();
    host.runProjectCommand.mockReturnValueOnce(pending.promise);
    const paint = vi.fn<() => void>();

    expect(dispatchHostProjectReorder(request(paint))).toBe(true);

    expect(paint).toHaveBeenCalledTimes(1);
    expect(host.runProjectCommand).toHaveBeenCalledWith({
      kind: "reorder",
      projectId: "t1",
      targetProjectId: "p2",
      placement: "after",
    });
    expect(catalogOrderIntentInFlightFor(FENCE_KEY, "projects")).toBe(true);
    pending.resolve();
    await flush();
    expect(catalogOrderIntentInFlightFor(FENCE_KEY, "projects")).toBe(false);
    expect(catalogOrder.confirmOrder).toHaveBeenCalledWith("projects");
    expect(catalogOrder.recoverOrder).not.toHaveBeenCalled();
  });

  it("surfaces a refusal and restores the host's order", async () => {
    const { host, catalogOrder } = makeHost();
    host.runProjectCommand.mockRejectedValueOnce(new Error("nope"));

    expect(dispatchHostProjectReorder(request(vi.fn<() => void>()))).toBe(true);
    await flush();

    expect(toastDanger).toHaveBeenCalledTimes(1);
    expect(catalogOrderIntentInFlightFor(FENCE_KEY, "projects")).toBe(false);
    expect(catalogOrder.recoverOrder).toHaveBeenCalledWith("projects");
    expect(catalogOrder.confirmOrder).not.toHaveBeenCalled();
  });

  it("keeps a move local when no host owns the row", () => {
    hostRef.current = undefined;
    const paint = vi.fn<() => void>();
    expect(dispatchHostProjectReorder(request(paint))).toBe(false);
    expect(paint).toHaveBeenCalledTimes(1);
  });

  it("keeps a move local while the host cannot persist it", () => {
    const { host, catalogOrder } = makeHost();
    catalogOrder.persistsOrder.mockReturnValue(false);
    const paint = vi.fn<() => void>();

    expect(dispatchHostProjectReorder(request(paint))).toBe(false);

    expect(paint).toHaveBeenCalledTimes(1);
    expect(host.runProjectCommand).not.toHaveBeenCalled();
  });

  it("drops a move onto another host's project without painting", () => {
    const { host } = makeHost();
    const paint = vi.fn<() => void>();

    expect(dispatchHostProjectReorder({ ...request(paint), targetProjectId: "other:p9" })).toBe(
      false,
    );

    expect(paint).not.toHaveBeenCalled();
    expect(host.runProjectCommand).not.toHaveBeenCalled();
  });
});

describe("dispatchHostThreadReorder", () => {
  const request = (paint: () => void, scope?: "project" | "catalog", targetThreadId = "h:t2") => ({
    threadId: "h:t1",
    targetThreadId,
    placement: "before" as const,
    ...(scope ? { scope } : {}),
    paint,
  });

  it("paints, pins, and sends the project-scope command in host ids", async () => {
    const { host, catalogOrder, release } = makeHost();
    const paint = vi.fn<() => void>();

    expect(dispatchHostThreadReorder(request(paint))).toBe(true);

    expect(paint).toHaveBeenCalledTimes(1);
    expect(host.pinThread).toHaveBeenCalledWith("h:t1");
    expect(host.sendThreadCommand).toHaveBeenCalledWith({
      kind: "reorder",
      threadId: "t1",
      projectId: "p1",
      threadIds: ["t1"],
      targetThreadId: "t2",
      placement: "before",
    });
    await flush();
    expect(release).toHaveBeenCalledTimes(1);
    expect(catalogOrderIntentInFlightFor(FENCE_KEY, "threads")).toBe(false);
    expect(catalogOrder.confirmOrder).toHaveBeenCalledWith("threads");
  });

  it("surfaces a refusal, restores the host's order, and unpins", async () => {
    const { host, catalogOrder, release } = makeHost();
    host.sendThreadCommand.mockRejectedValueOnce(new Error("nope"));

    expect(dispatchHostThreadReorder(request(vi.fn<() => void>()))).toBe(true);
    await flush();

    expect(toastDanger).toHaveBeenCalledTimes(1);
    expect(catalogOrder.recoverOrder).toHaveBeenCalledWith("threads");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("keeps a project-scope move local across projects or without persistence", () => {
    const { host, catalogOrder } = makeHost();
    const paint = vi.fn<() => void>();
    expect(dispatchHostThreadReorder(request(paint, "project", "h:t3"))).toBe(false);
    expect(paint).toHaveBeenCalledTimes(1);

    catalogOrder.persistsOrder.mockReturnValue(false);
    const secondPaint = vi.fn<() => void>();
    expect(dispatchHostThreadReorder(request(secondPaint))).toBe(false);
    expect(secondPaint).toHaveBeenCalledTimes(1);
    expect(host.sendThreadCommand).not.toHaveBeenCalled();
  });

  it("drops a move onto another host's thread without painting", () => {
    const { host } = makeHost();
    const paint = vi.fn<() => void>();
    expect(dispatchHostThreadReorder(request(paint, "catalog", "other:t9"))).toBe(false);
    expect(paint).not.toHaveBeenCalled();
    expect(host.sendThreadCommand).not.toHaveBeenCalled();
  });

  it("keeps a move local when no host owns the row", () => {
    hostRef.current = undefined;
    const paint = vi.fn<() => void>();
    expect(dispatchHostThreadReorder(request(paint, "catalog"))).toBe(false);
    expect(paint).toHaveBeenCalledTimes(1);
  });

  describe("flat catalog scope", () => {
    it("sends reorder-flat first and paints only once the host accepted the capability", async () => {
      const { host } = makeHost();
      const order: string[] = [];
      host.sendThreadCommand.mockImplementation(async () => {
        order.push("send");
      });
      const paint = vi.fn<() => void>(() => void order.push("paint"));

      expect(dispatchHostThreadReorder(request(paint, "catalog", "h:t3"))).toBe(true);
      expect(paint).not.toHaveBeenCalled();
      await flush();

      expect(host.sendThreadCommand).toHaveBeenCalledWith({
        kind: "reorder-flat",
        threadId: "t1",
        projectId: "p1",
        targetThreadId: "t3",
        placement: "before",
      });
      expect(order).toEqual(["send", "paint"]);
    });

    it("refuses with the host's message and no paint when the capability is absent", async () => {
      const { host, catalogOrder, release } = makeHost();
      catalogOrder.supportsFlatThreadReorder.mockResolvedValue(false);
      const paint = vi.fn<() => void>();

      expect(dispatchHostThreadReorder(request(paint, "catalog"))).toBe(true);
      await flush();

      expect(paint).not.toHaveBeenCalled();
      expect(host.sendThreadCommand).not.toHaveBeenCalled();
      expect(toastDanger).toHaveBeenCalledWith("flat refused");
      expect(catalogOrder.recoverOrder).toHaveBeenCalledWith("threads");
      expect(release).toHaveBeenCalledTimes(1);
      expect(catalogOrderIntentInFlightFor(FENCE_KEY, "threads")).toBe(false);
    });

    it("refuses silently when the host supplies no refusal message", async () => {
      const { host, catalogOrder } = makeHost();
      catalogOrder.persistsOrder.mockReturnValue(false);
      catalogOrder.flatRefusal.mockReturnValue(undefined);
      const paint = vi.fn<() => void>();

      expect(dispatchHostThreadReorder(request(paint, "catalog"))).toBe(true);
      await flush();

      expect(paint).not.toHaveBeenCalled();
      expect(host.sendThreadCommand).not.toHaveBeenCalled();
      expect(toastDanger).not.toHaveBeenCalled();
    });

    it("refuses when the connection was replaced while the capability was read", async () => {
      const { host } = makeHost();
      host.isCurrent.mockReturnValue(false);
      const paint = vi.fn<() => void>();

      expect(dispatchHostThreadReorder(request(paint, "catalog"))).toBe(true);
      await flush();

      expect(paint).not.toHaveBeenCalled();
      expect(host.sendThreadCommand).not.toHaveBeenCalled();
      expect(toastDanger).toHaveBeenCalledTimes(1);
    });

    it("refuses when the source row left its project while the capability was read", async () => {
      const { host, catalogOrder } = makeHost();
      catalogOrder.supportsFlatThreadReorder.mockImplementation(async () => {
        useAppStore.setState((state) => ({
          threads: state.threads.map((thread) =>
            thread.id === "h:t1" ? { ...thread, projectId: "h:p2" } : thread,
          ),
        }));
        return true;
      });
      const paint = vi.fn<() => void>();

      expect(dispatchHostThreadReorder(request(paint, "catalog"))).toBe(true);
      await flush();

      expect(paint).not.toHaveBeenCalled();
      expect(host.sendThreadCommand).not.toHaveBeenCalled();
    });
  });
});
