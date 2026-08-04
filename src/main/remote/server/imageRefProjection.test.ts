import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import { readRemoteImageRef, remoteImageRef } from "@/shared/remote";
import { closeDatabase, initDatabase } from "../../db/connection";
import { dbUpsertProject, dbUpsertThread } from "../../db/projectsThreads";
import { dbReplaceThreadRuntimeItems } from "../../db/runtimeItems";
import { resetImagePreviews, setImagePreviewGenerator } from "./imagePreview";
import {
  parseImageRefPath,
  projectPayloadImageRefs,
  projectRuntimeItemsImageRefs,
  resolveImageRef,
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
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  function persist(payload: unknown): void {
    dbReplaceThreadRuntimeItems("thread-1", [
      { id: "item-1", type: "image_view", state: "completed", payload, streams: {} },
    ]);
  }

  it("resolves a projected reference back to the exact bytes", () => {
    persist({ images: [bigPngDataUrl] });
    const resolved = resolveImageRef("thread-1", "item-1", ["images", 0]);
    expect(resolved?.mime).toBe("image/png");
    expect(resolved?.data.equals(Buffer.from(bigPngBase64, "base64"))).toBe(true);
  });

  it("resolves bare base64 as well as data URLs", () => {
    persist({ images: [bigPngBase64] });
    expect(resolveImageRef("thread-1", "item-1", ["images", 0])?.data.byteLength).toBeGreaterThan(
      0,
    );
  });

  it("round-trips a reference produced by the projection", () => {
    const payload = { images: [bigPngDataUrl] };
    persist(payload);
    const projected = projectRuntimeItemsImageRefs("thread-1", [
      { id: "item-1", type: "image_view", state: "completed", payload, streams: {} },
    ]);
    const ref = readRemoteImageRef((projected[0]!.payload as { images: unknown[] }).images[0]);
    expect(ref).not.toBeNull();
    expect(resolveImageRef(ref!.threadId, ref!.itemId, ref!.path)?.data.byteLength).toBe(
      Buffer.from(bigPngBase64, "base64").byteLength,
    );
  });

  it("refuses to serve a filesystem path even though the payload holds one", () => {
    // The security boundary: `path` addresses a location in our own row, and the
    // value there is re-verified as an inline image. A tool result naming a local
    // file resolves to nothing rather than being read off disk.
    persist({ images: ["/etc/passwd"], args: { path: "/etc/passwd" } });
    expect(resolveImageRef("thread-1", "item-1", ["images", 0])).toBeNull();
    expect(resolveImageRef("thread-1", "item-1", ["args", "path"])).toBeNull();
  });

  it("refuses to serve an agent-supplied http(s) or file URL", () => {
    persist({ images: ["https://tracker.example/pixel.png", "file:///etc/hosts"] });
    expect(resolveImageRef("thread-1", "item-1", ["images", 0])).toBeNull();
    expect(resolveImageRef("thread-1", "item-1", ["images", 1])).toBeNull();
  });

  it("returns null for an unknown thread, item, or path", () => {
    persist({ images: [bigPngDataUrl] });
    expect(resolveImageRef("nope", "item-1", ["images", 0])).toBeNull();
    expect(resolveImageRef("thread-1", "nope", ["images", 0])).toBeNull();
    expect(resolveImageRef("thread-1", "item-1", ["images", 9])).toBeNull();
    expect(resolveImageRef("thread-1", "item-1", ["missing"])).toBeNull();
  });

  it("does not resolve a reference object left in place of the image", () => {
    // Guards against a projected payload ever being persisted by mistake.
    persist({
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
  });
});
