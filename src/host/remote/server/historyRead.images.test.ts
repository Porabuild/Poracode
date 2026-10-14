import { ThreadHistoryReplay } from "@/host/remote/server/threadHistoryReplay";
import { SessionConfigInventory } from "./sessionConfigInventory";
import { ThreadLiveReadState } from "@/host/remote/server/threadLiveReadState";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, initDatabase } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import {
  dbGetThreadRuntimeItemCommitted,
  dbReplaceThreadRuntimeItems,
} from "@/host/db/runtimeItems";
import { nativeBindingEnv, sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import { CATALOG_READS_CAPABILITY } from "@/shared/remote/historyReadContract";
import { readRemoteImageRef } from "@/shared/remote/imageRef";
import type { RemoteServerContext } from "./context";
import {
  buildBoundedThreadHistoryItems,
  buildBoundedThreadSnapshot,
  parseHistoryReadNegotiation,
} from "./historyRead";
import { resolveImageRef } from "./imageRefProjection";
import { resetImagePreviews } from "./imagePreview";

describe.skipIf(!sqliteAvailable)("bounded older-history image projection", () => {
  let dir: string;
  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-history-images-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Images",
        location: { kind: "posix", path: dir },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    dbUpsertThread(testThread(), 0);
  });
  it("fills tail and older windows using projected image sizes without sending the whole history", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><!--${"i".repeat(150_000)}--></svg>`;
    const items = Array.from({ length: 48 }, (_, index) =>
      index % 2 === 0
        ? {
            id: `row-${index}`,
            type: "image_view",
            state: "completed" as const,
            payload: { name: "Image", status: "success", images: [svg] },
            streams: {},
          }
        : {
            id: `row-${index}`,
            type: "assistant_message",
            state: "completed" as const,
            streams: { assistant_text: "text".repeat(2000) },
          },
    );
    await dbReplaceThreadRuntimeItems("thread-1", items);
    const negotiation = parseHistoryReadNegotiation(
      new URL(`http://host/history?reads=${CATALOG_READS_CAPABILITY}`),
    );
    const callSupervisor = vi.fn<RemoteServerContext["options"]["callSupervisor"]>(
      () => new Promise<never>(() => {}),
    );
    const ctx = {
      seq: 0,
      sessionConfigInventory: new SessionConfigInventory(),
      threadLiveReadState: new ThreadLiveReadState(),
      threadHistoryReplay: new ThreadHistoryReplay(),
      backgroundTasksByThread: new Map(),
      options: { callSupervisor },
    } as unknown as RemoteServerContext;
    const body = await buildBoundedThreadSnapshot(ctx, "thread-1", negotiation);
    const tail = JSON.parse(body);
    expect(tail.runtimeItems.map((entry: { id: string }) => entry.id)).toEqual(
      items.slice(8).map((entry) => entry.id),
    );
    expect(tail.runtimeNextCursor).toBe(8);
    expect(Buffer.byteLength(body)).toBeLessThan(1024 * 1024);
    expect(body).not.toContain(svg);
    expect(callSupervisor).not.toHaveBeenCalled();
    const olderBody = await buildBoundedThreadHistoryItems(
      { threadId: "thread-1", beforePosition: 8, limit: 500, targetTimelineEntryCount: 40 },
      negotiation.caps,
    );
    const older = JSON.parse(olderBody);
    expect(older.items.map((entry: { id: string }) => entry.id)).toEqual(
      items.slice(0, 8).map((entry) => entry.id),
    );
    expect(older.nextCursor).toBeNull();
    expect(olderBody).not.toContain(svg);
    expect(dbGetThreadRuntimeItemCommitted("thread-1", "row-0")?.payload).toEqual(
      items[0]!.payload,
    );
  });
  afterEach(() => {
    resetImagePreviews();
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("keeps older pages as lazy references like the tail while preserving canonical image bytes and cursors", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><!--${"fixture".repeat(2000)}--><rect width="1" height="1"/></svg>`;
    const image = {
      type: "image_view",
      state: "completed" as const,
      payload: { name: "Image", status: "success", images: [svg] },
      streams: {},
    };
    await dbReplaceThreadRuntimeItems("thread-1", [
      { ...image, id: "older-image" },
      {
        id: "middle",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "between images" },
      },
      { ...image, id: "newer-image" },
    ]);
    const negotiation = parseHistoryReadNegotiation(
      new URL(`http://host/api/threads/thread-1/history?reads=${CATALOG_READS_CAPABILITY}`),
    );
    const ctx = {
      seq: 42,
      sessionConfigInventory: new SessionConfigInventory(),
      backgroundTasksByThread: new Map(),
      threadLiveReadState: new ThreadLiveReadState(),
      threadHistoryReplay: new ThreadHistoryReplay(),
      options: { callSupervisor: async () => null },
    } as unknown as RemoteServerContext;
    const tail = JSON.parse(await buildBoundedThreadSnapshot(ctx, "thread-1", negotiation));
    const body = await buildBoundedThreadHistoryItems(
      { threadId: "thread-1", beforePosition: 2, limit: 2 },
      negotiation.caps,
    );
    const older = JSON.parse(body);
    expect(older.items.map((entry: { id: string }) => entry.id)).toEqual(["older-image", "middle"]);
    expect(older.nextCursor).toBeNull();
    const oldImage = older.items[0].payload.images[0];
    expect(readRemoteImageRef(oldImage)).toMatchObject({
      threadId: "thread-1",
      itemId: "older-image",
      path: ["images", 0],
      mime: "image/svg+xml",
      bytes: Buffer.byteLength(svg),
    });
    expect(oldImage).toEqual(
      tail.runtimeItems.find((entry: { id: string }) => entry.id === "older-image").payload
        .images[0],
    );
    expect(Buffer.byteLength(body)).toBeLessThan(Buffer.byteLength(svg) / 4);
    expect(
      dbGetThreadRuntimeItemCommitted("thread-1", "older-image", { includeStreams: false })
        ?.payload,
    ).toEqual(image.payload);
    expect(resolveImageRef("thread-1", "older-image", ["images", 0])?.data.toString()).toBe(svg);
    expect(resolveImageRef("thread-1", "older-image", ["missing"])).toBeNull();
  });
});
