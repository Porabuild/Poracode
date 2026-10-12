import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
      backgroundTasksByThread: new Map(),
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
