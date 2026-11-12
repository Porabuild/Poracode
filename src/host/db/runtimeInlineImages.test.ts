import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isRemoteImageRef } from "@/shared/remote";
import { closeDatabase, getSqlite, initDatabase, reclaimDatabaseSpace } from "./connection";
import { readConversationSearchBatch } from "./conversationSearchReads";
import { dbReadThreadHistoryPagePhase1, dbReadThreadHistoryPhase2 } from "./historyReads";
import { dbMeasureLegacyHistoryCharge } from "./legacyReadCharge";
import {
  assertRequiredDatabaseSchema,
  LATEST_SCHEMA_VERSION,
  runDatabaseMigrations,
} from "./migrations";
import { dbDeleteThread, dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import {
  dbReadCommittedRuntimeItemImageBlob,
  isPersistedInlineImageStub,
  reclaimOrphanInlineImageBlobs,
} from "./runtimeInlineImages";
import {
  dbApplyThreadRuntimeEvents,
  dbFlushThreadRuntimeWrites,
  dbGetThreadRuntimeItem,
  dbGetThreadRuntimeItems,
  dbReadLatestThreadGoalItem,
  dbReplaceThreadRuntimeItems,
} from "./runtimeItems";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";
import { readRuntimePayloadOrigin } from "./runtimePayloadOrigins";
import {
  createSchema53PayloadOriginDatabase,
  installFixtureOrigin,
  migrateSchema53FixtureThrough,
  ORIGIN_A,
} from "./runtimePayloadOrigins.testFixtures";
import { dbReclaimDeletedThreadSpace } from "./threadHousekeeping";
import { resolveCatalogEffectiveCaps } from "@/host/remote/server/catalogPageBudget";
import { readProjectedHistoryWindow } from "@/host/remote/server/historyWindow";
import {
  projectPayloadImageRefs,
  resolveImageRef,
  resolveImageRefAfterFence,
} from "@/host/remote/server/imageRefProjection";
import { clearImageBytesCache } from "@/host/remote/server/imageBytesCache";

function makeCanonicalPngBytes(minRawBytes: number, seed = 7): Buffer {
  // Minimal valid 2x3 RGBA PNG header + IHDR + arbitrary payload + IEND so
  // readImageDimensions extracts width=2, height=3 deterministically.
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(2, 0); // width = 2
  ihdrData.writeUInt32BE(3, 4); // height = 3
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // RGBA
  const ihdrChunk = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x0d]),
    Buffer.from("IHDR", "ascii"),
    ihdrData,
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
  ]);
  const body = Buffer.alloc(Math.max(64, minRawBytes));
  for (let i = 0; i < body.length; i += 1) {
    body[i] = (i * 31 + seed) & 0xff;
  }
  const idatHeader = Buffer.alloc(8);
  idatHeader.writeUInt32BE(body.length, 0);
  idatHeader.write("IDAT", 4, "ascii");
  const iend = Buffer.from([
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  return Buffer.concat([signature, ihdrChunk, idatHeader, body, iend]);
}

function makeLargeSvg(minBytes = 10_000, label = "chart"): string {
  const filler = `<rect x="0" y="0" width="10" height="10" data-label="${label}" />`.repeat(
    Math.ceil(minBytes / 56),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80">${filler}</svg>`;
}

describe.skipIf(!sqliteAvailable)(
  "runtime inline image externalization & reclamation (schema 72)",
  () => {
    let root: string;
    let dbPath: string;
    const previousBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;

    beforeEach(() => {
      if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
      mkdirSync("tmp", { recursive: true });
      root = mkdtempSync(join("tmp", "runtime-inline-images-"));
      dbPath = join(root, "state.sqlite");
      clearImageBytesCache();
    });

    afterEach(async () => {
      clearImageBytesCache();
      closeDatabase();
      rmSync(root, { recursive: true, force: true });
      if (previousBinding === undefined) delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
      else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = previousBinding;
    });

    function seedProjectAndThread(threadId = "thread-1"): void {
      dbUpsertProject(
        {
          id: "project-1",
          name: "Inline images project",
          location: { kind: "posix", path: "/tmp/inline-images" },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        0,
      );
      dbUpsertThread({ ...testThread(), id: threadId }, 0);
    }

    it("externalizes canonical >= 8 KiB data_url, raw_base64, and raw_svg images while leaving small, non-canonical, and untrusted stub payloads untouched", async () => {
      initDatabase(dbPath);
      seedProjectAndThread("thread-1");

      const pngBytesA = makeCanonicalPngBytes(9_000, 11);
      const dataUrlPng = `data:image/png;base64,${pngBytesA.toString("base64")}`;
      const pngBytesB = makeCanonicalPngBytes(9_500, 29);
      const rawBase64Png = pngBytesB.toString("base64");
      const rawSvg = makeLargeSvg(10_500, "architecture");
      const smallPngUrl = `data:image/png;base64,${makeCanonicalPngBytes(128, 3).toString("base64")}`;
      // Non-canonical whitespace inside Base64 body must stay inline verbatim.
      const nonCanonicalDataUrl = `data:image/png;base64,${pngBytesA.toString("base64").slice(0, 64)}\n${pngBytesA.toString("base64").slice(64)}`;
      const forgedStub = {
        $poracodeInlineImageBlob: 1,
        hash: createHash("sha256").update(dataUrlPng, "utf8").digest("hex"),
        mime: "image/png",
        bytes: Buffer.byteLength(dataUrlPng, "utf8"),
        width: 2,
        height: 3,
      };

      const originalPayload = {
        text: "Check all image encodings",
        images: [dataUrlPng, smallPngUrl, nonCanonicalDataUrl],
        nested: {
          rawBase64: rawBase64Png,
          diagram: rawSvg,
          forged: forgedStub,
        },
      };

      expect(
        dbApplyThreadRuntimeEvents("thread-1", [
          {
            type: "item.started",
            threadId: "thread-1",
            itemId: "msg-1",
            itemType: "user_message",
            payload: originalPayload,
          },
          {
            type: "item.completed",
            threadId: "thread-1",
            itemId: "msg-1",
          },
        ]).kind,
      ).toBe("accepted");
      await dbFlushThreadRuntimeWrites("thread-1");

      const sqlite = getSqlite();
      const rawRow = sqlite
        .prepare(
          "SELECT payload FROM thread_runtime_items WHERE thread_id = 'thread-1' AND item_id = 'msg-1'",
        )
        .get() as { payload: string };
      expect(Buffer.byteLength(rawRow.payload, "utf8")).toBeLessThan(
        Buffer.byteLength(nonCanonicalDataUrl, "utf8") +
          Buffer.byteLength(smallPngUrl, "utf8") +
          2_048,
      );

      const persisted = JSON.parse(rawRow.payload) as typeof originalPayload;
      expect(isPersistedInlineImageStub(persisted.images[0])).toBe(true);
      expect(persisted.images[1]).toBe(smallPngUrl);
      expect(persisted.images[2]).toBe(nonCanonicalDataUrl);
      expect(isPersistedInlineImageStub(persisted.nested.rawBase64)).toBe(true);
      expect(isPersistedInlineImageStub(persisted.nested.diagram)).toBe(true);
      expect(persisted.nested.forged).toEqual(forgedStub);

      // Only the 3 genuine externalized paths have ref rows; forgedStub has none!
      const refPaths = (
        sqlite
          .prepare(
            "SELECT path_json FROM thread_runtime_item_image_refs WHERE thread_id = 'thread-1' AND item_id = 'msg-1' ORDER BY path_json",
          )
          .all() as Array<{ path_json: string }>
      ).map((r) => r.path_json);
      expect(refPaths).toEqual(['["images",0]', '["nested","diagram"]', '["nested","rawBase64"]']);

      // Forged stub must never resolve through image endpoints or rehydrate!
      expect(
        dbReadCommittedRuntimeItemImageBlob("thread-1", "msg-1", ["nested", "forged"]),
      ).toBeNull();
      expect(resolveImageRef("thread-1", "msg-1", ["nested", "forged"])).toBeNull();
      expect(await resolveImageRefAfterFence("thread-1", "msg-1", ["nested", "forged"])).toBeNull();

      // Direct rehydrated reads restore exact byte-for-byte strings, leaving forgedStub inert JSON.
      const rehydrated = await dbGetThreadRuntimeItem("thread-1", "msg-1");
      expect(rehydrated?.payload).toEqual(originalPayload);

      // Direct O(1) blob resolution returns exact decoded bytes & MIME for all 3 externalized kinds.
      expect(resolveImageRef("thread-1", "msg-1", ["images", 0])).toEqual({
        mime: "image/png",
        data: pngBytesA,
      });
      expect(resolveImageRef("thread-1", "msg-1", ["nested", "rawBase64"])).toEqual({
        mime: "image/png",
        data: pngBytesB,
      });
      expect(resolveImageRef("thread-1", "msg-1", ["nested", "diagram"])).toEqual({
        mime: "image/svg+xml",
        data: Buffer.from(rawSvg, "utf8"),
      });
    });

    it("deduplicates identical blobs across items/threads, preserves stubs across partial updates, and reclaims orphan blobs + SQLite pages on delete", async () => {
      initDatabase(dbPath);
      const sqlite = getSqlite();
      expect(sqlite.pragma("auto_vacuum", { simple: true })).toBe(2); // INCREMENTAL on fresh DB
      expect(sqlite.pragma("journal_size_limit", { simple: true })).toBe(33_554_432);
      expect(sqlite.pragma("mmap_size", { simple: true })).toBe(0);

      seedProjectAndThread("thread-1");
      dbUpsertThread({ ...testThread(), id: "thread-2" }, 1);

      const sharedBytes = makeCanonicalPngBytes(48_000, 99);
      const sharedDataUrl = `data:image/png;base64,${sharedBytes.toString("base64")}`;
      const replacementBytes = makeCanonicalPngBytes(32_000, 55);
      const replacementDataUrl = `data:image/png;base64,${replacementBytes.toString("base64")}`;

      expect(
        dbApplyThreadRuntimeEvents("thread-1", [
          {
            type: "item.started",
            threadId: "thread-1",
            itemId: "tool-1",
            itemType: "mcp_tool_call",
            payload: {
              toolName: "screenshot",
              status: "running",
              result: { image: sharedDataUrl },
            },
          },
        ]).kind,
      ).toBe("accepted");
      expect(
        dbApplyThreadRuntimeEvents("thread-2", [
          {
            type: "item.started",
            threadId: "thread-2",
            itemId: "tool-2",
            itemType: "mcp_tool_call",
            payload: {
              toolName: "screenshot",
              status: "completed",
              result: { image: sharedDataUrl },
            },
          },
          {
            type: "item.completed",
            threadId: "thread-2",
            itemId: "tool-2",
          },
        ]).kind,
      ).toBe("accepted");
      await dbFlushThreadRuntimeWrites();

      expect(
        sqlite.prepare("SELECT COUNT(*) AS count FROM runtime_inline_image_blobs").get(),
      ).toEqual({ count: 1 });
      expect(
        sqlite.prepare("SELECT COUNT(*) AS count FROM thread_runtime_item_image_refs").get(),
      ).toEqual({ count: 2 });

      // Partial item.updated + payload-less item.completed must retain the externalized image ref!
      expect(
        dbApplyThreadRuntimeEvents("thread-1", [
          {
            type: "item.updated",
            threadId: "thread-1",
            itemId: "tool-1",
            payload: { status: "completed", durationMs: 42 },
          },
          {
            type: "item.completed",
            threadId: "thread-1",
            itemId: "tool-1",
          },
        ]).kind,
      ).toBe("accepted");
      await dbFlushThreadRuntimeWrites("thread-1");

      const updatedItem = await dbGetThreadRuntimeItem("thread-1", "tool-1");
      expect(updatedItem).toMatchObject({
        state: "completed",
        payload: {
          toolName: "screenshot",
          status: "completed",
          durationMs: 42,
          result: { image: sharedDataUrl },
        },
      });

      // Replacing thread-1's items swaps its ref and leaves sharedDataUrl referenced only by thread-2.
      await dbReplaceThreadRuntimeItems("thread-1", [
        {
          id: "tool-replaced",
          type: "image_view",
          state: "completed",
          payload: { image: replacementDataUrl },
          streams: {},
        },
      ]);
      expect(
        sqlite.prepare("SELECT COUNT(*) AS count FROM runtime_inline_image_blobs").get(),
      ).toEqual({ count: 2 });

      // Delete both threads -> cascade clears all image_refs -> reclaim frees orphan blobs & pages.
      dbDeleteThread("thread-1");
      dbDeleteThread("thread-2");
      expect(
        sqlite.prepare("SELECT COUNT(*) AS count FROM thread_runtime_item_image_refs").get(),
      ).toEqual({ count: 0 });

      sqlite.pragma("wal_checkpoint(TRUNCATE)");
      const sizeBeforeReclaim = statSync(dbPath).size;

      const reclaimed = dbReclaimDeletedThreadSpace();
      expect(reclaimed.deletedOrphanBlobs).toBe(2);
      expect(
        sqlite.prepare("SELECT COUNT(*) AS count FROM runtime_inline_image_blobs").get(),
      ).toEqual({ count: 0 });

      sqlite.pragma("wal_checkpoint(TRUNCATE)");
      const sizeAfterReclaim = statSync(dbPath).size;
      expect(sizeAfterReclaim).toBeLessThan(sizeBeforeReclaim);
      expect(reclaimOrphanInlineImageBlobs(sqlite)).toBe(0);
      expect(reclaimDatabaseSpace(sqlite).deletedOrphanBlobs).toBe(0);
    });

    it("upgrades a real pre-72 database through migration 72 while preserving payload origin custody", async () => {
      const legacy = createSchema53PayloadOriginDatabase(dbPath);
      migrateSchema53FixtureThrough(legacy, 71);
      expect(
        legacy.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get(),
      ).toEqual({ value: "71" });

      const pngBytes = makeCanonicalPngBytes(12_000, 77);
      const dataUrl = `data:image/png;base64,${pngBytes.toString("base64")}`;
      const legacyPayload = JSON.stringify({
        title: "Captured tool screenshot",
        status: "completed",
        output: { image: dataUrl },
      });

      legacy
        .prepare(
          `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload, streams)
         VALUES ('thread-2', 'legacy-image-tool', 50, 'mcp_tool_call', 'completed', ?, '{}')`,
        )
        .run(legacyPayload);
      installFixtureOrigin(legacy, "legacy-image-tool", ORIGIN_A, "thread-2");
      expect(readRuntimePayloadOrigin(legacy, "thread-2", "legacy-image-tool")).toEqual(ORIGIN_A);
      legacy.close();

      // Validate-only open refuses pre-72 profile before migration 72 runs.
      expect(() => initDatabase(dbPath, { schemaMode: "validate" })).toThrow(
        /runtime_inline_image_blobs/,
      );
      closeDatabase();

      // Standard open runs migration 72, externalizes the image, and preserves ORIGIN_A custody!
      const upgraded = initDatabase(dbPath);
      expect(() => assertRequiredDatabaseSchema(upgraded)).not.toThrow();
      expect(
        upgraded.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get(),
      ).toEqual({ value: String(LATEST_SCHEMA_VERSION) });
      expect(readRuntimePayloadOrigin(upgraded, "thread-2", "legacy-image-tool")).toEqual(ORIGIN_A);

      const storedAfter = upgraded
        .prepare(
          "SELECT payload FROM thread_runtime_items WHERE thread_id = 'thread-2' AND item_id = 'legacy-image-tool'",
        )
        .get() as { payload: string };
      expect(Buffer.byteLength(storedAfter.payload, "utf8")).toBeLessThan(512);

      const rehydrated = await dbGetThreadRuntimeItem("thread-2", "legacy-image-tool");
      expect(rehydrated?.payload).toEqual(JSON.parse(legacyPayload));

      // Confirm a rollback-incompatible older schema check and re-run idempotency.
      runDatabaseMigrations(upgraded, LATEST_SCHEMA_VERSION);
      expect(readRuntimePayloadOrigin(upgraded, "thread-2", "legacy-image-tool")).toEqual(ORIGIN_A);

      // Raw handle check that foreign keys cascade cleanly.
      const rawCheck = new Database(dbPath, {
        readonly: true,
        ...(nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : {}),
      });
      try {
        expect(
          rawCheck.prepare("PRAGMA foreign_key_list(thread_runtime_item_image_refs)").all(),
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              table: "thread_runtime_items",
              on_delete: "CASCADE",
              on_update: "CASCADE",
            }),
          ]),
        );
      } finally {
        rawCheck.close();
      }
    });

    it("projects RemoteImageRefs in O(1) without reading raw_bytes, classifies display-image tools as timeline items, skips FTS blob decoding, and charges legacy reads", async () => {
      initDatabase(dbPath);
      seedProjectAndThread("thread-1");

      const pngBytes = makeCanonicalPngBytes(14_000, 123);
      const dataUrl = `data:image/png;base64,${pngBytes.toString("base64")}`;

      expect(
        dbApplyThreadRuntimeEvents("thread-1", [
          {
            type: "item.started",
            threadId: "thread-1",
            itemId: "user-msg-1",
            itemType: "user_message",
            payload: {
              content: [
                { kind: "text", text: "Searchable screenshot prompt" },
                { kind: "image", url: dataUrl },
              ],
            },
          },
          {
            type: "item.completed",
            threadId: "thread-1",
            itemId: "user-msg-1",
          },
          {
            type: "item.started",
            threadId: "thread-1",
            itemId: "goal-1",
            itemType: "goal",
            payload: { title: "Goal with attachment", image: dataUrl },
          },
          {
            type: "item.completed",
            threadId: "thread-1",
            itemId: "goal-1",
          },
          {
            type: "item.started",
            threadId: "thread-1",
            itemId: "display-tool-1",
            itemType: "mcp_tool_call",
            payload: {
              name: "browser_screenshot",
              status: "completed",
              result: { content: [{ type: "image", data: dataUrl }] },
            },
          },
          {
            type: "item.completed",
            threadId: "thread-1",
            itemId: "display-tool-1",
          },
        ]).kind,
      ).toBe("accepted");
      await dbFlushThreadRuntimeWrites("thread-1");

      // Latest goal read rehydrates externalized payload transparently.
      const latestGoal = dbReadLatestThreadGoalItem("thread-1");
      expect(latestGoal?.payload).toEqual({ title: "Goal with attachment", image: dataUrl });

      // Phase 1 + Phase 2 with preserveExternalizedImageStubs classifies display-tool-1 as "item"
      // (NOT collapsed into an activity_group) and projects RemoteImageRef with dimensions!
      const phase1 = dbReadThreadHistoryPagePhase1("thread-1", { limit: 20 });
      expect(phase1.rows.some((r) => r.kind === "item" && r.itemId === "display-tool-1")).toBe(
        true,
      );

      const phase2Preserved = dbReadThreadHistoryPhase2(
        "thread-1",
        phase1.rows.map((r) => r.itemId),
        {
          compactDetails: true,
          preserveExternalizedImageStubs: true,
        },
      );
      const preservedTool = phase2Preserved.find((item) => item.id === "display-tool-1")!;
      const projected = projectPayloadImageRefs(
        "thread-1",
        "display-tool-1",
        preservedTool.payload,
      );
      expect(projected.omittedBytes).toBe(Buffer.byteLength(dataUrl, "utf8"));
      const projectedContent = (
        projected.payload as { result: { content: Array<{ data: unknown }> } }
      ).result.content;
      expect(isRemoteImageRef(projectedContent[0]?.data)).toBe(true);
      expect(projectedContent[0]?.data).toMatchObject({
        __poracodeImageRef: {
          threadId: "thread-1",
          itemId: "display-tool-1",
          path: ["result", "content", 0, "data"],
          mime: "image/png",
          bytes: Buffer.byteLength(dataUrl, "utf8"),
          width: 2,
          height: 3,
        },
      });

      // End-to-end readProjectedHistoryWindow also projects RemoteImageRef cleanly.
      const caps = resolveCatalogEffectiveCaps({});
      const windowResult = readProjectedHistoryWindow(
        "thread-1",
        phase1.rows,
        caps.softPackWireBytes,
        caps,
      );
      const windowTool = windowResult.projectedDesc.find((item) => item.id === "display-tool-1");
      expect(
        isRemoteImageRef(
          (windowTool?.payload as { result: { content: Array<{ data: unknown }> } } | undefined)
            ?.result.content[0]?.data,
        ),
      ).toBe(true);

      // FTS conversation search batch skips blob rehydration while indexing prose text cleanly.
      const searchBatch = readConversationSearchBatch();
      const indexedText = searchBatch.map((doc) => doc.text).join("\n");
      expect(indexedText).toContain("Searchable screenshot prompt");
      expect(indexedText).not.toContain(pngBytes.toString("base64").slice(0, 64));

      // Legacy read charge accounts for externalized blob bytes so admission limits cannot be bypassed.
      const legacyCharge = dbMeasureLegacyHistoryCharge("thread-1");
      expect(legacyCharge.itemsStoredBytes).toBeGreaterThanOrEqual(pngBytes.byteLength * 3);

      // Full item list read rehydrates all items faithfully.
      const allItems = await dbGetThreadRuntimeItems("thread-1");
      expect(allItems.find((i) => i.id === "display-tool-1")?.payload).toEqual({
        name: "browser_screenshot",
        status: "completed",
        result: { content: [{ type: "image", data: dataUrl }] },
      });
    });
  },
);
