import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { closeDatabase, initDatabase } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import {
  dbApplyThreadRuntimeEvents,
  dbGetThreadRuntimeItem,
  dbGetThreadRuntimeItemCommitted,
  dbHasPendingThreadRuntimeWrites,
  dbReplaceThreadRuntimeItems,
} from "@/host/db/runtimeItems";
import { nativeBindingEnv, sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import {
  beginRuntimeFence,
  flushRuntimeFence,
  releaseRuntimeFence,
} from "@/host/db/runtimePersistenceRuntime";
import { RemoteDesktopClient } from "@/shared/remote/client";
import { runtimeRequestItemId } from "@/host/db/runtimeRequestItemId";
import { remoteImageRefPath } from "@/shared/remote";
import { RemoteAccessServer } from "../RemoteAccessServer";
import { baseOptions, exchangeToken } from "../environments/environmentProxyTestFixtures";
import { resolveImageRefAfterFence } from "./imageRefProjection";
import { clearImageBytesCache } from "./imageBytesCache";

const image = "data:image/png;base64,iVBORw0KGgo=";
const bytes = Buffer.from("iVBORw0KGgo=", "base64");

function admit(events: RuntimeEvent[]) {
  return dbApplyThreadRuntimeEvents("thread-1", events);
}

describe.skipIf(!sqliteAvailable)("image reference readiness", () => {
  let dir: string;

  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-image-readiness-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Images",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    dbUpsertThread({ ...testThread(), agentKind: "acp-generic", config: { model: "fixture" } }, 0);
    await dbReplaceThreadRuntimeItems("thread-1", [
      {
        id: "image",
        type: "image_view",
        state: "completed",
        payload: { images: [image] },
        streams: {},
      },
      { id: "reply", type: "assistant_message", state: "started", streams: {} },
    ]);
  });

  afterEach(() => {
    clearImageBytesCache();
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("serves a committed image while the thread's history fence is held", async () => {
    const history = beginRuntimeFence("thread-1");
    expect((await flushRuntimeFence(history)).kind).toBe("committed");
    let resolved = false;
    const request = resolveImageRefAfterFence("thread-1", "image", ["images", 0]).then((result) => {
      resolved = true;
      return result;
    });
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(resolved).toBe(true);
      expect((await request)?.data).toEqual(bytes);
    } finally {
      releaseRuntimeFence(history);
      await request;
    }
  });

  it("does not flush unrelated background output to read an already committed image", async () => {
    const admission = admit([
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: "reply",
        stream: "assistant_text",
        delta: "Still streaming in the background",
      },
    ]);
    expect(admission.kind).toBe("accepted");
    expect(dbHasPendingThreadRuntimeWrites("thread-1")).toBe(true);
    expect((await resolveImageRefAfterFence("thread-1", "image", ["images", 0]))?.data).toEqual(
      bytes,
    );
    expect(dbHasPendingThreadRuntimeWrites("thread-1")).toBe(true);
    expect(dbGetThreadRuntimeItemCommitted("thread-1", "reply")?.streams).toEqual({});
    expect((await dbGetThreadRuntimeItem("thread-1", "reply"))?.streams.assistant_text).toBe(
      "Still streaming in the background",
    );
  });

  it("fences an image added to an existing row before its payload has committed", async () => {
    const admission = admit([
      {
        type: "item.completed",
        threadId: "thread-1",
        itemId: "reply",
        payload: { images: [image] },
      },
    ]);
    expect(admission.kind).toBe("accepted");
    expect(dbGetThreadRuntimeItemCommitted("thread-1", "reply")?.payload).toBeUndefined();
    expect((await resolveImageRefAfterFence("thread-1", "reply", ["images", 0]))?.data).toEqual(
      bytes,
    );
    expect(dbHasPendingThreadRuntimeWrites("thread-1")).toBe(false);
  });

  it.each(["item.updated", "item.completed"] as const)(
    "fences a queued %s that replaces a committed image",
    async (type) => {
      const replacementBytes = Buffer.concat([bytes, Buffer.from([1, 2, 3])]);
      const admission = admit([
        {
          type,
          threadId: "thread-1",
          itemId: "image",
          payload: { images: [`data:image/png;base64,${replacementBytes.toString("base64")}`] },
        },
      ]);
      expect(admission.kind).toBe("accepted");
      expect((await resolveImageRefAfterFence("thread-1", "image", ["images", 0]))?.data).toEqual(
        replacementBytes,
      );
    },
  );

  it("serves replacement bytes after a cached committed image is replaced and removed", async () => {
    // First resolve populates the decoded-bytes cache.
    expect((await resolveImageRefAfterFence("thread-1", "image", ["images", 0]))?.data).toEqual(
      bytes,
    );
    const replacementBytes = Buffer.concat([bytes, Buffer.from([4, 5, 6])]);
    const admission = admit([
      {
        type: "item.updated",
        threadId: "thread-1",
        itemId: "image",
        payload: { images: [`data:image/png;base64,${replacementBytes.toString("base64")}`] },
      },
    ]);
    expect(admission.kind).toBe("accepted");
    // The fence flush commits the replacement and the writer's post-commit
    // listener must drop the cached entry: new bytes, never the cached ones.
    expect((await resolveImageRefAfterFence("thread-1", "image", ["images", 0]))?.data).toEqual(
      replacementBytes,
    );
    const removal = admit([
      {
        type: "item.updated",
        threadId: "thread-1",
        itemId: "image",
        payload: { images: [] },
      },
    ]);
    expect(removal.kind).toBe("accepted");
    expect(await resolveImageRefAfterFence("thread-1", "image", ["images", 0])).toBeNull();
  });

  it.each(["replacement", "removal"] as const)(
    "does not cache fenced image bytes after a queued history %s",
    async (mutation) => {
      expect(
        admit([
          {
            type: "item.updated",
            threadId: "thread-1",
            itemId: "image",
            payload: { images: [image] },
          },
        ]).kind,
      ).toBe("accepted");
      const replacementBytes = Buffer.concat([bytes, Buffer.from([7, 8, 9])]);
      const request = resolveImageRefAfterFence("thread-1", "image", ["images", 0]);
      const replacement = dbReplaceThreadRuntimeItems(
        "thread-1",
        mutation === "replacement"
          ? [
              {
                id: "image",
                type: "image_view",
                state: "completed",
                payload: {
                  images: [`data:image/png;base64,${replacementBytes.toString("base64")}`],
                },
                streams: {},
              },
            ]
          : [],
      );
      expect((await request)?.data).toEqual(bytes);
      await replacement;
      const current = await resolveImageRefAfterFence("thread-1", "image", ["images", 0]);
      expect(current?.data ?? null).toEqual(mutation === "replacement" ? replacementBytes : null);
    },
  );

  it("does not serve a committed image removed by a queued payload update", async () => {
    const admission = admit([
      {
        type: "item.updated",
        threadId: "thread-1",
        itemId: "image",
        payload: { images: [] },
      },
    ]);
    expect(admission.kind).toBe("accepted");
    expect(await resolveImageRefAfterFence("thread-1", "image", ["images", 0])).toBeNull();
  });

  it("fences a request payload replacement under the same request item id", async () => {
    const itemId = runtimeRequestItemId("approval");
    await dbReplaceThreadRuntimeItems("thread-1", [
      {
        id: itemId,
        type: "pending_request",
        state: "started",
        payload: {
          requestId: "approval",
          requestType: "file_read_approval",
          payload: { summary: "Read image", details: { images: [image] } },
        },
        streams: {},
      },
    ]);
    const admission = admit([
      {
        type: "request.opened",
        threadId: "thread-1",
        requestId: "approval",
        requestType: "file_read_approval",
        payload: { summary: "Read image", details: { images: [] } },
      },
    ]);
    expect(admission.kind).toBe("accepted");
    expect(
      await resolveImageRefAfterFence("thread-1", itemId, ["payload", "details", "images", 0]),
    ).toBeNull();
  });

  it.each(["interrupted", "cancelled"] as const)(
    "fences a %s turn that prunes an image-bearing reasoning row",
    async (state) => {
      await dbReplaceThreadRuntimeItems("thread-1", [
        { id: "reply", type: "assistant_message", state: "completed", streams: {} },
        {
          id: "reasoning",
          type: "reasoning",
          state: "started",
          payload: { images: [image] },
          streams: { reasoning_text: "In progress" },
        },
      ]);
      const admission = admit([
        { type: "turn.completed", threadId: "thread-1", turnId: "turn-1", state },
      ]);
      expect(admission.kind).toBe("accepted");
      expect(await resolveImageRefAfterFence("thread-1", "reasoning", ["images", 0])).toBeNull();
    },
  );

  it("waits for a queued history replacement rather than serving the removed image", async () => {
    const history = beginRuntimeFence("thread-1");
    expect((await flushRuntimeFence(history)).kind).toBe("committed");
    const replacement = dbReplaceThreadRuntimeItems("thread-1", []);
    let resolved = false;
    const request = resolveImageRefAfterFence("thread-1", "image", ["images", 0]).then((result) => {
      resolved = true;
      return result;
    });
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(resolved).toBe(false);
      releaseRuntimeFence(history);
      await replacement;
      expect(await request).toBeNull();
    } finally {
      releaseRuntimeFence(history);
      await replacement;
      await request;
    }
  });

  it("serves ticketed image bytes when history readers occupy the thread's fence slots", async () => {
    const server = new RemoteAccessServer(baseOptions());
    const info = await server.start();
    const first = beginRuntimeFence("thread-1");
    const second = beginRuntimeFence("thread-1");
    try {
      const accessToken = await exchangeToken(server, ["session:read"]);
      const client = new RemoteDesktopClient(info.httpBaseUrl, accessToken);
      const result = await client.fetchTicketedImageBytes(
        remoteImageRefPath({
          threadId: "thread-1",
          itemId: "image",
          path: ["images", 0],
          mime: "image/png",
          bytes: bytes.length,
        }),
        new AbortController().signal,
      );
      expect(result.contentType).toBe("image/png");
      expect(Buffer.from(result.bytes)).toEqual(bytes);
    } finally {
      releaseRuntimeFence(first);
      releaseRuntimeFence(second);
      await server.dispose();
    }
  });
});
