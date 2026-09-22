import { describe, expect, it } from "vitest";
import { REMOTE_HTTP_ROUTES } from "./routes";
import {
  decodedProjectListQuerySchema,
  decodedShellSnapshotQuerySchema,
  decodedThreadHistoryItemsQuerySchema,
  decodedThreadHistoryQuerySchema,
  decodedThreadListQuerySchema,
  decodedThreadTurnsQuerySchema,
} from "./queryCodecs";

/**
 * B4 compatibility proof for the generated contract boundary: every route
 * addition is optional, so a LEGACY response/request shape still validates
 * against the new registry schemas, while a bounded shape keeps its new fields
 * (the route schemas are the same zod schemas the generator emits, so this is
 * the compatibility property the native bundles compile from).
 */

function routeSchema(routeId: string): {
  parse(value: unknown): unknown;
  safeParse(value: unknown): { success: boolean };
} {
  const route = REMOTE_HTTP_ROUTES.find((candidate) => candidate.id === routeId);
  if (!route?.response.jsonSchema) throw new Error(`No registry response schema for ${routeId}`);
  return route.response.jsonSchema as never;
}

const LEGACY_SHELL_SNAPSHOT = {
  snapshotSeq: 1,
  projects: [],
  threads: [],
  runtimeSummariesByThread: {},
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const LEGACY_THREAD_LIST_PAGE = {
  threads: [],
  runtimeSummariesByThread: {},
  nextCursor: null,
};

const LEGACY_THREAD_SNAPSHOT = {
  snapshotSeq: 1,
  thread: {
    id: "t1",
    projectId: "p1",
    title: "T",
    agentKind: "claude",
    config: { model: "m" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  runtimeItems: [],
  completedTurns: [],
  contextUsage: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const LEGACY_RUNTIME_ITEMS_PAGE = { items: [], nextCursor: null };

describe("B4 bounded-read contract compatibility", () => {
  it("keeps every legacy response shape valid through the new registry schemas", () => {
    expect(routeSchema("shell-snapshot").safeParse(LEGACY_SHELL_SNAPSHOT).success).toBe(true);
    expect(routeSchema("thread-list").safeParse(LEGACY_THREAD_LIST_PAGE).success).toBe(true);
    expect(routeSchema("thread-history").safeParse(LEGACY_THREAD_SNAPSHOT).success).toBe(true);
    expect(routeSchema("thread-history-items").safeParse(LEGACY_RUNTIME_ITEMS_PAGE).success).toBe(
      true,
    );
  });

  it("preserves the bounded fields through the same registry schemas", () => {
    const snapshot = routeSchema("shell-snapshot").parse({
      ...LEGACY_SHELL_SNAPSHOT,
      reads: "bounded-v1",
      threadsNextCursor: "tp1.abc",
      projectsNextCursor: "pj1.def",
    }) as Record<string, unknown>;
    expect(snapshot.reads).toBe("bounded-v1");
    expect(snapshot.projectsNextCursor).toBe("pj1.def");

    const threadPage = routeSchema("thread-list").parse({
      ...LEGACY_THREAD_LIST_PAGE,
      reads: "bounded-v1",
      inventoryFrontier: "thread-9",
    }) as Record<string, unknown>;
    expect(threadPage.reads).toBe("bounded-v1");
    expect(threadPage.inventoryFrontier).toBe("thread-9");

    const history = routeSchema("thread-history").parse({
      ...LEGACY_THREAD_SNAPSHOT,
      reads: "bounded-v1",
      completedTurnsNextCursor: "ct1.eyJpIjowfQ",
    }) as Record<string, unknown>;
    expect(history.reads).toBe("bounded-v1");
    expect(history.completedTurnsNextCursor).toBe("ct1.eyJpIjowfQ");

    const items = routeSchema("thread-history-items").parse({
      ...LEGACY_RUNTIME_ITEMS_PAGE,
      reads: "bounded-v1",
    }) as Record<string, unknown>;
    expect(items.reads).toBe("bounded-v1");
  });

  it("accepts the legacy query shapes of every widened route", () => {
    expect(decodedThreadListQuerySchema.parse({ limit: 100 })).toEqual({ limit: 100 });
    expect(decodedShellSnapshotQuerySchema.parse({ threadLimit: 100 })).toEqual({
      threadLimit: 100,
    });
    expect(decodedThreadHistoryItemsQuerySchema.parse({ limit: 500 })).toEqual({ limit: 500 });
    expect(decodedThreadHistoryQuerySchema.parse({ runtimePage: "1" })).toEqual({
      runtimePage: "1",
    });
    // Declared clients may omit the limit; the host applies the bounded default.
    expect(decodedThreadListQuerySchema.parse({ reads: "bounded-v1" })).toEqual({
      reads: "bounded-v1",
    });
    expect(decodedThreadHistoryItemsQuerySchema.parse({ reads: "bounded-v1" })).toEqual({
      reads: "bounded-v1",
    });
    expect(decodedProjectListQuerySchema.parse({ reads: "bounded-v1", projectLimit: 50 })).toEqual({
      reads: "bounded-v1",
      projectLimit: 50,
    });
    expect(decodedThreadTurnsQuerySchema.parse({ reads: "bounded-v1", cursor: "ct1.x" })).toEqual({
      reads: "bounded-v1",
      cursor: "ct1.x",
    });
  });

  it("registers the three additive routes with session:read and no mutation", () => {
    for (const id of ["project-list", "catalog-membership", "thread-turns"]) {
      const route = REMOTE_HTTP_ROUTES.find((candidate) => candidate.id === id);
      if (!route) throw new Error(`Missing additive route ${id}`);
      expect(route.scopes).toEqual(["session:read"]);
      expect(route.response.jsonSchema).toBeDefined();
    }
  });
});
