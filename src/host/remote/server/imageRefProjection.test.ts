import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { readRemoteImageRef, remoteImageRef } from "@/shared/remote";
import { closeDatabase, getSqlite, initDatabase } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import {
  dbApplyThreadRuntimeEvents,
  dbGetThreadRuntimeItem,
  dbReplaceThreadRuntimeItems,
} from "@/host/db/runtimeItems";
import {
  getImagePreviewRetentionSnapshot,
  imagePreviewKey,
  resetImagePreviews,
  setImagePreviewGenerator,
  type ImagePreviewGenerator,
} from "./imagePreview";
import {
  parseImageRefPath,
  projectPayloadImageRefs,
  projectRuntimeItemsImageRefs,
  resolveImageRef,
  resolveImageRefAfterFence,
} from "./imageRefProjection";

const serverNativeBinding = join(process.cwd(), "dist", "server-native", "better_sqlite3.node");
let nativeBindingEnv: string | undefined;
let sqliteAvailable = true;
try {
  new Database(":memory:").close();
} catch {
  if (existsSync(serverNativeBinding)) {
    nativeBindingEnv = serverNativeBinding;
  } else {
    sqliteAvailable = false;
  }
}

/** A real 1x1 PNG, base64-encoded, padded so it clears the 8KB ref threshold. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AABAwMDAwMDAAAAP//AwABAAEAAQABAAEA";
const bigPngBase64 = `${PNG_1X1}${"A".repeat(9000)}`;
const bigPngDataUrl = `data:image/png;base64,${bigPngBase64}`;
const flushPreviews = () =>
  new Promise<void>((resolve) => setImmediate(() => setImmediate(resolve)));

function pngDataUrlOfSize(bytes: number): string {
  const prefix = `data:image/png;base64,${PNG_1X1}`;
  return `${prefix}${"A".repeat(bytes - Buffer.byteLength(prefix, "utf8"))}`;
}

async function drainPreviews(): Promise<void> {
  for (let i = 0; i < 40; i += 1) await flushPreviews();
}

function testThread(): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Images",
    agentKind: "codex",
    config: { model: "gpt-5" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("projectPayloadImageRefs", () => {
  it("replaces a large inline image with a reference carrying its metadata", () => {
    const payload = {
      name: "imageView",
      args: { path: "/tmp/shot.png" },
      status: "success",
      images: [bigPngDataUrl],
    };
    const { payload: projected, omittedBytes } = projectPayloadImageRefs("t1", "i1", payload);
    expect(omittedBytes).toBeGreaterThan(9000);
    const record = projected as { images: unknown[]; name: string; args: unknown };
    const ref = readRemoteImageRef(record.images[0]);
    expect(ref).toMatchObject({
      threadId: "t1",
      itemId: "i1",
      path: ["images", 0],
      mime: "image/png",
    });
    // Dimensions ride along so the timeline can reserve layout without fetching.
    expect(ref?.width).toBe(1);
    expect(ref?.height).toBe(1);
    // Descriptive fields are untouched.
    expect(record.name).toBe("imageView");
    expect(record.args).toEqual({ path: "/tmp/shot.png" });
  });

  it("leaves small images inline — a round trip would cost more than the bytes", () => {
    const payload = { images: [`data:image/png;base64,${PNG_1X1}`] };
    const { payload: projected, omittedBytes } = projectPayloadImageRefs("t1", "i1", payload);
    expect(omittedBytes).toBe(0);
    expect(projected).toBe(payload);
  });

  it("leaves a payload with no image untouched by identity", () => {
    const payload = { name: "bash", result: "ok" };
    expect(projectPayloadImageRefs("t1", "i1", payload).payload).toBe(payload);
  });

  it("does not mutate the original payload", () => {
    const payload = { images: [bigPngDataUrl] };
    const before = JSON.stringify(payload);
    projectPayloadImageRefs("t1", "i1", payload);
    expect(JSON.stringify(payload)).toBe(before);
  });

  it("projects an image nested in a structured result", () => {
    const payload = { result: { content: [{ type: "text" }, { data: bigPngBase64 }] } };
    const { payload: projected } = projectPayloadImageRefs("t1", "i1", payload);
    const nested = (projected as { result: { content: Array<Record<string, unknown>> } }).result
      .content[1]!;
    expect(readRemoteImageRef(nested.data)?.path).toEqual(["result", "content", 1, "data"]);
  });

  it("projects every image when a payload carries several", () => {
    const { payload: projected, omittedBytes } = projectPayloadImageRefs("t1", "i1", {
      images: [bigPngDataUrl, bigPngDataUrl],
    });
    const images = (projected as { images: unknown[] }).images;
    expect(readRemoteImageRef(images[0])?.path).toEqual(["images", 0]);
    expect(readRemoteImageRef(images[1])?.path).toEqual(["images", 1]);
    expect(omittedBytes).toBeGreaterThan(18000);
  });
});

describe("parseImageRefPath", () => {
  it("accepts a key/index list", () => {
    expect(parseImageRefPath('["images",0]')).toEqual(["images", 0]);
  });

  it("rejects malformed, empty, over-long, and non-scalar paths", () => {
    for (const raw of [
      null,
      "",
      "not json",
      "[]",
      '{"images":0}',
      '[{"a":1}]',
      '["a","b","c","d","e","f","g","h","i"]',
      '["a",1.5]',
    ]) {
      expect(parseImageRefPath(raw)).toBeNull();
    }
  });
});

describe.skipIf(!sqliteAvailable)("resolveImageRef", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "poracode-imageref-test-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Test project",
        location: { kind: "posix", path: "/tmp/project" },
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

  async function persist(payload: unknown): Promise<void> {
    await dbReplaceThreadRuntimeItems("thread-1", [
      { id: "item-1", type: "image_view", state: "completed", payload, streams: {} },
    ]);
  }

  it("resolves images without reading unrelated retained streams and leaves full reads intact", async () => {
    const stream = "unrelated output\n".repeat(200_000);
    await dbReplaceThreadRuntimeItems("thread-1", [
      {
        id: "item-1",
        type: "image_view",
        state: "completed",
        payload: { images: [bigPngDataUrl] },
        streams: { command_output: stream },
      },
    ]);
    const prepare = vi.spyOn(getSqlite(), "prepare");
    expect(resolveImageRef("thread-1", "item-1", ["images", 0])?.data).toEqual(
      Buffer.from(bigPngBase64, "base64"),
    );
    expect(prepare.mock.calls).toHaveLength(1);
    expect(prepare.mock.calls[0]![0]).toContain("NULL AS streams");
    prepare.mockClear();
    expect((await resolveImageRefAfterFence("thread-1", "item-1", ["images", 0]))?.data).toEqual(
      Buffer.from(bigPngBase64, "base64"),
    );
    expect(prepare.mock.calls.some(([sql]) => sql.includes("NULL AS streams"))).toBe(true);
    expect(
      prepare.mock.calls.some(([sql]) => /thread_runtime_item_stream_(?:state|chunks)/.test(sql)),
    ).toBe(false);
    prepare.mockRestore();
    expect((await dbGetThreadRuntimeItem("thread-1", "item-1"))?.streams.command_output).toBe(
      stream,
    );
  });

  it("resolves a live image reference whose canonical row is still queued", async () => {
    const admission = dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "live-image",
        itemType: "tool_call",
        payload: { name: "Read", status: "success", images: [bigPngDataUrl] },
      },
      { type: "item.completed", threadId: "thread-1", itemId: "live-image" },
    ]);
    expect(admission.kind).toBe("accepted");
    // The former endpoint reads only the committed prefix and reports 404 here.
    expect(resolveImageRef("thread-1", "live-image", ["images", 0])).toBeNull();
    const resolved = await resolveImageRefAfterFence("thread-1", "live-image", ["images", 0]);
    expect(resolved?.data).toEqual(Buffer.from(bigPngBase64, "base64"));
    expect(await resolveImageRefAfterFence("thread-1", "missing", ["images", 0])).toBeNull();
  });

  it("resolves a projected reference back to the exact bytes", async () => {
    await persist({ images: [bigPngDataUrl] });
    const resolved = resolveImageRef("thread-1", "item-1", ["images", 0]);
    expect(resolved?.mime).toBe("image/png");
    expect(resolved?.data.equals(Buffer.from(bigPngBase64, "base64"))).toBe(true);
  });

  it("preserves canonical bytes and dimensions above the optional preview input budget", async () => {
    const generator = vi.fn<ImagePreviewGenerator>(() => "data:image/jpeg;base64,QQ==");
    setImagePreviewGenerator(generator);
    const image = pngDataUrlOfSize(8 * 1024 * 1024 + 1);
    const payload = { images: [image] };
    await persist(payload);
    const { payload: projected, omittedBytes } = projectPayloadImageRefs(
      "thread-1",
      "item-1",
      payload,
    );
    const ref = readRemoteImageRef((projected as { images: unknown[] }).images[0]);
    expect(ref).toEqual({
      threadId: "thread-1",
      itemId: "item-1",
      path: ["images", 0],
      mime: "image/png",
      bytes: Buffer.byteLength(image, "utf8"),
      width: 1,
      height: 1,
    });
    expect(omittedBytes).toBe(Buffer.byteLength(image, "utf8"));
    expect(payload.images[0]).toBe(image);
    await flushPreviews();
    expect(generator).not.toHaveBeenCalled();
    expect(getImagePreviewRetentionSnapshot()).toMatchObject({
      retainedCount: 0,
      retainedBytes: 0,
    });
    const expected = Buffer.from(image.slice(image.indexOf(",") + 1), "base64");
    expect(resolveImageRef(ref!.threadId, ref!.itemId, ref!.path)?.data.equals(expected)).toBe(
      true,
    );
    expect(
      (await resolveImageRefAfterFence(ref!.threadId, ref!.itemId, ref!.path))?.data.equals(
        expected,
      ),
    ).toBe(true);
  });

  it("resolves bare base64 as well as data URLs", async () => {
    await persist({ images: [bigPngBase64] });
    expect(resolveImageRef("thread-1", "item-1", ["images", 0])?.data.byteLength).toBeGreaterThan(
      0,
    );
  });

  it("round-trips a reference produced by the projection", async () => {
    const payload = { images: [bigPngDataUrl] };
    await persist(payload);
    const projected = projectRuntimeItemsImageRefs("thread-1", [
      { id: "item-1", type: "image_view", state: "completed", payload, streams: {} },
    ]);
    const ref = readRemoteImageRef((projected[0]!.payload as { images: unknown[] }).images[0]);
    expect(ref).not.toBeNull();
    expect(resolveImageRef(ref!.threadId, ref!.itemId, ref!.path)?.data.byteLength).toBe(
      Buffer.from(bigPngBase64, "base64").byteLength,
    );
  });

  it("refuses to serve a filesystem path even though the payload holds one", async () => {
    // The security boundary: `path` addresses a location in our own row, and the
    // value there is re-verified as an inline image. A tool result naming a local
    // file resolves to nothing rather than being read off disk.
    await persist({ images: ["/etc/passwd"], args: { path: "/etc/passwd" } });
    expect(resolveImageRef("thread-1", "item-1", ["images", 0])).toBeNull();
    expect(resolveImageRef("thread-1", "item-1", ["args", "path"])).toBeNull();
  });

  it("refuses to serve an agent-supplied http(s) or file URL", async () => {
    await persist({ images: ["https://tracker.example/pixel.png", "file:///etc/hosts"] });
    expect(resolveImageRef("thread-1", "item-1", ["images", 0])).toBeNull();
    expect(resolveImageRef("thread-1", "item-1", ["images", 1])).toBeNull();
  });

  it("returns null for an unknown thread, item, or path", async () => {
    await persist({ images: [bigPngDataUrl] });
    expect(resolveImageRef("nope", "item-1", ["images", 0])).toBeNull();
    expect(resolveImageRef("thread-1", "nope", ["images", 0])).toBeNull();
    expect(resolveImageRef("thread-1", "item-1", ["images", 9])).toBeNull();
    expect(resolveImageRef("thread-1", "item-1", ["missing"])).toBeNull();
  });

  it("does not resolve a reference object left in place of the image", async () => {
    // Guards against a projected payload ever being persisted by mistake.
    await persist({
      images: [
        remoteImageRef({
          threadId: "thread-1",
          itemId: "item-1",
          path: ["images", 0],
          mime: "image/png",
          bytes: 10,
        }),
      ],
    });
    expect(resolveImageRef("thread-1", "item-1", ["images", 0])).toBeNull();
  });
});

describe("preview attachment", () => {
  afterEach(() => {
    resetImagePreviews();
  });

  it("omits the preview on first sight and includes it once generated", async () => {
    setImagePreviewGenerator(() => "data:image/jpeg;base64,QQ==");
    const payload = { images: [bigPngDataUrl] };

    // First projection: nothing cached yet, so the reference ships without a
    // preview rather than blocking on a decode.
    const first = projectPayloadImageRefs("t1", "i1", payload).payload;
    expect(readRemoteImageRef((first as { images: unknown[] }).images[0])?.preview).toBeUndefined();

    await new Promise<void>((resolve) => setImmediate(() => setImmediate(resolve)));

    // Second projection picks up the cached preview.
    const second = projectPayloadImageRefs("t1", "i1", payload).payload;
    const ref = readRemoteImageRef((second as { images: unknown[] }).images[0]);
    expect(ref?.preview).toBe("data:image/jpeg;base64,QQ==");
    // Intrinsic size still rides along so the slot is reserved either way.
    expect(ref?.width).toBe(1);
    expect(ref?.height).toBe(1);
  });

  it("still mints usable references when the host cannot make previews", () => {
    const projected = projectPayloadImageRefs("t1", "i1", { images: [bigPngDataUrl] }).payload;
    const ref = readRemoteImageRef((projected as { images: unknown[] }).images[0]);
    expect(ref).not.toBeNull();
    expect(ref?.preview).toBeUndefined();
    expect(getImagePreviewRetentionSnapshot()).toMatchObject({
      retainedCount: 0,
      retainedBytes: 0,
    });
  });

  it("retains at most 32 preview sources while projecting every image with dimensions", async () => {
    const held = Promise.withResolvers<string | null>();
    const generator = vi.fn<ImagePreviewGenerator>(() => held.promise);
    setImagePreviewGenerator(generator);
    const payload = { images: Array.from({ length: 40 }, () => bigPngDataUrl) };
    const { payload: projected, omittedBytes } = projectPayloadImageRefs("t1", "i1", payload);
    const refs = (projected as { images: unknown[] }).images.map(readRemoteImageRef);
    expect(refs).toHaveLength(40);
    for (const [index, ref] of refs.entries()) {
      expect(ref).toMatchObject({
        path: ["images", index],
        width: 1,
        height: 1,
        bytes: Buffer.byteLength(bigPngDataUrl),
      });
      expect(ref?.preview).toBeUndefined();
    }
    expect(omittedBytes).toBe(40 * Buffer.byteLength(bigPngDataUrl));
    expect(payload.images.every((image) => image === bigPngDataUrl)).toBe(true);
    await flushPreviews();
    expect(getImagePreviewRetentionSnapshot()).toMatchObject({
      activeCount: 1,
      pendingCount: 31,
      retainedCount: 32,
    });
    expect(generator).toHaveBeenCalledTimes(1);
    held.resolve("data:image/jpeg;base64,QQ==");
    await drainPreviews();
    expect(generator).toHaveBeenCalledTimes(32);
    expect(getImagePreviewRetentionSnapshot()).toMatchObject({
      retainedCount: 0,
      retainedBytes: 0,
    });
  });

  it("passes truthful retained source costs, refuses optional work at capacity, and retries after drain", async () => {
    const held = Promise.withResolvers<string | null>();
    const generator = vi.fn<ImagePreviewGenerator>(() => held.promise);
    setImagePreviewGenerator(generator);
    const image = pngDataUrlOfSize(1024 * 1024);
    const payload = { images: Array.from({ length: 12 }, () => image) };
    const { payload: projected } = projectPayloadImageRefs("t1", "i1", payload);
    const refs = (projected as { images: unknown[] }).images.map(readRemoteImageRef);
    expect(
      refs.every(
        (ref) => ref?.bytes === Buffer.byteLength(image) && ref.width === 1 && ref.height === 1,
      ),
    ).toBe(true);
    const retainedBytes = Array.from(
      { length: 7 },
      (_, i) =>
        Buffer.byteLength(image, "utf8") +
        Buffer.byteLength(imagePreviewKey("t1", "i1", ["images", i]), "utf8"),
    ).reduce((sum, cost) => sum + cost, 0);
    await flushPreviews();
    expect(getImagePreviewRetentionSnapshot()).toMatchObject({
      retainedBytes,
      activeCount: 1,
      pendingCount: 6,
      retainedCount: 7,
    });
    const blocked = getImagePreviewRetentionSnapshot();
    projectPayloadImageRefs("t1", "i1", payload);
    expect(getImagePreviewRetentionSnapshot()).toEqual(blocked);
    expect(generator).toHaveBeenCalledTimes(1);
    held.resolve("data:image/jpeg;base64,QQ==");
    await drainPreviews();
    expect(generator).toHaveBeenCalledTimes(7);
    const retry = projectPayloadImageRefs("t1", "i1", payload).payload as { images: unknown[] };
    expect(
      retry.images.slice(0, 7).every((value) => readRemoteImageRef(value)?.preview !== undefined),
    ).toBe(true);
    expect(
      retry.images.slice(7).every((value) => readRemoteImageRef(value)?.preview === undefined),
    ).toBe(true);
    expect(getImagePreviewRetentionSnapshot().pendingCount).toBe(5);
    await drainPreviews();
    const ready = projectPayloadImageRefs("t1", "i1", payload).payload as { images: unknown[] };
    expect(
      ready.images.every(
        (value) => readRemoteImageRef(value)?.preview === "data:image/jpeg;base64,QQ==",
      ),
    ).toBe(true);
    expect(generator).toHaveBeenCalledTimes(12);
    expect(payload.images.every((value) => value === image)).toBe(true);
    expect(getImagePreviewRetentionSnapshot()).toMatchObject({
      retainedCount: 0,
      retainedBytes: 0,
    });
  });

  it("uses UTF-8 bytes rather than string length when admitting a multibyte image source", async () => {
    const generator = vi.fn<ImagePreviewGenerator>(() => "data:image/jpeg;base64,QQ==");
    setImagePreviewGenerator(generator);
    const image = `<svg width="18" height="24"><text>${"é".repeat(6000)}</text></svg>`;
    const { payload: projected } = projectPayloadImageRefs("t1", "i1", { images: [image] });
    const ref = readRemoteImageRef((projected as { images: unknown[] }).images[0]);
    expect(ref).toMatchObject({ bytes: Buffer.byteLength(image, "utf8"), width: 18, height: 24 });
    expect(getImagePreviewRetentionSnapshot().retainedBytes).toBe(
      Buffer.byteLength(image, "utf8") +
        Buffer.byteLength(imagePreviewKey("t1", "i1", ["images", 0]), "utf8"),
    );
    expect(Buffer.byteLength(image, "utf8")).toBeGreaterThan(image.length);
    await flushPreviews();
    expect(generator).not.toHaveBeenCalled(); // vector sources need no native downscale
    expect(getImagePreviewRetentionSnapshot()).toMatchObject({
      retainedCount: 0,
      retainedBytes: 0,
    });
  });
});
