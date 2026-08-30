import { describe, expect, it } from "vitest";
import { REMOTE_HTTP_ROUTES } from "../routes";
import {
  pathScopedEmptyBodySchema,
  projectNotesWriteBodySchema,
  requestResolveBodySchema,
  startExistingThreadBodySchema,
  terminalResizeBodySchema,
  terminalWriteBodySchema,
  threadCommandBodySchema,
  threadGoalHttpBodySchema,
  threadRuntimeTruncateBodySchema,
  threadSendBodySchema,
  threadSteerSetBodySchema,
} from "../routeBodies";
import { LOSSY_QUERY_METADATA_KINDS } from "../queryCodecs";
import { compareUnicodeCodePoints } from "../unicodeOrder";

const EMPTY_THREAD_ROUTES = [
  "thread-interrupt",
  "thread-close",
  "thread-steer-clear",
  "terminal-close",
] as const;

const PATH_SCOPED_BODIES = {
  "thread-send": threadSendBodySchema,
  "thread-goal": threadGoalHttpBodySchema,
  "thread-steer-set": threadSteerSetBodySchema,
  "terminal-write": terminalWriteBodySchema,
  "terminal-resize": terminalResizeBodySchema,
  "request-resolve": requestResolveBodySchema,
  "thread-runtime-truncate": threadRuntimeTruncateBodySchema,
  "thread-command": threadCommandBodySchema,
  "thread-start-existing": startExistingThreadBodySchema,
  "project-notes-write": projectNotesWriteBodySchema,
} as const;

describe("remote HTTP route goldens", () => {
  it("covers exactly 61 unique routes", () => {
    expect(REMOTE_HTTP_ROUTES).toHaveLength(61);
    expect(new Set(REMOTE_HTTP_ROUTES.map((route) => route.id)).size).toBe(61);
  });

  it("emits explicit query codecs and never infers them from z.coerce", () => {
    for (const route of REMOTE_HTTP_ROUTES) {
      if (!route.queryParameters?.length) continue;
      expect(route.queryCodecs?.map((codec) => codec.name)).toEqual([...route.queryParameters]);
      for (const codec of route.queryCodecs ?? []) {
        expect(LOSSY_QUERY_METADATA_KINDS).not.toContain(codec.kind);
        expect(["string", "int", "decimal", "0-or-1", "JSON-string"]).toContain(codec.kind);
      }
    }
  });

  it("omits path threadId from path-scoped bodies", () => {
    for (const id of EMPTY_THREAD_ROUTES) {
      const route = REMOTE_HTTP_ROUTES.find((candidate) => candidate.id === id);
      expect(route?.request.jsonSchema).toBe(pathScopedEmptyBodySchema);
      expect(pathScopedEmptyBodySchema.safeParse({}).success).toBe(true);
      expect(pathScopedEmptyBodySchema.parse({ threadId: "t1" })).toEqual({});
    }

    const send = threadSendBodySchema.parse({
      threadId: "t1",
      prompt: "hi",
      config: { model: "m" },
    });
    expect(send.prompt).toBe("hi");
    expect(send).not.toHaveProperty("threadId");

    expect(threadGoalHttpBodySchema.parse({ action: "clear" }).action).toBe("clear");
    expect(threadGoalHttpBodySchema.parse({ action: "clear", threadId: "t1" })).not.toHaveProperty(
      "threadId",
    );

    const steer = threadSteerSetBodySchema.parse({
      threadId: "t1",
      prompt: "nudge",
      config: { model: "m" },
    });
    expect(steer.prompt).toBe("nudge");
    expect(steer).not.toHaveProperty("threadId");

    expect(terminalWriteBodySchema.parse({ data: "a" }).data).toBe("a");
    expect(terminalWriteBodySchema.parse({ threadId: "t1", data: "a" })).not.toHaveProperty(
      "threadId",
    );

    expect(terminalResizeBodySchema.parse({ cols: 80, rows: 24 })).toEqual({ cols: 80, rows: 24 });
    expect(
      terminalResizeBodySchema.parse({ threadId: "t1", cols: 80, rows: 24 }),
    ).not.toHaveProperty("threadId");

    const resolved = requestResolveBodySchema.parse({
      threadId: "t1",
      requestId: "r1",
      method: "ask",
      response: true,
    });
    expect(resolved.method).toBe("ask");
    expect(resolved).not.toHaveProperty("threadId");

    expect(threadRuntimeTruncateBodySchema.parse({ itemId: "i1" }).itemId).toBe("i1");
    expect(
      threadRuntimeTruncateBodySchema.parse({ threadId: "t1", itemId: "i1" }),
    ).not.toHaveProperty("threadId");

    expect(threadCommandBodySchema.parse({ kind: "acknowledge" }).kind).toBe("acknowledge");
    expect(threadCommandBodySchema.parse({ kind: "clear-group" }).kind).toBe("clear-group");
    expect(
      threadCommandBodySchema.parse({ kind: "acknowledge", threadId: "t1" }),
    ).not.toHaveProperty("threadId");

    expect(
      startExistingThreadBodySchema.safeParse({
        projectLocation: { kind: "posix", path: "/repo" },
        agentKind: "claude",
        config: { model: "m" },
        initialSize: { cols: 80, rows: 24 },
      }).success,
    ).toBe(false);
    expect(
      startExistingThreadBodySchema.parse({
        threadId: "t1",
        projectLocation: { kind: "posix", path: "/repo" },
        agentKind: "claude",
        config: { model: "m" },
        initialSize: { cols: 80, rows: 24 },
      }).threadId,
    ).toBe("t1");

    expect(
      projectNotesWriteBodySchema.parse({
        projectId: "project-1",
        doc: null,
        todos: [],
        updatedAt: "2026-08-12T00:00:00.000Z",
      }),
    ).toEqual({ doc: null, todos: [], updatedAt: "2026-08-12T00:00:00.000Z" });
  });

  it("keeps every path-scoped schema attached to its route", () => {
    const ids = Object.keys(PATH_SCOPED_BODIES).sort(compareUnicodeCodePoints);
    for (const id of ids) {
      const route = REMOTE_HTTP_ROUTES.find((candidate) => candidate.id === id);
      expect(route?.request.jsonSchema).toBe(
        PATH_SCOPED_BODIES[id as keyof typeof PATH_SCOPED_BODIES],
      );
    }
  });
});
