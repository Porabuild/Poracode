import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { estimateRuntimeEventBytes } from "@/shared/runtimeEventSize";
import type { RuntimeEvent } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { RuntimeEventBuffer } from "../../runtime/threadSession/runtimeEventBuffer";
import { RuntimeEventRouter } from "../../runtime/threadSession/runtimeEventRouter";
import { createCodexMapperState, mapCodexNotification } from "./canonicalMapping";
import { readCodexImageViewPreview } from "./canonicalMapping/toolExtraction";
import { setupCodexStructuredSession } from "./structuredSessionTestHarness";

describe("Codex image view admission", () => {
  it("finishes a large image tool and the next turn without overflowing canonical admission", async () => {
    const dir = await mkdtemp(join(tmpdir(), "poracode-codex-large-image-"));
    try {
      const path = join(dir, "display.png");
      const source = await sharp(randomBytes(2048 * 1200 * 3), {
        raw: { width: 2048, height: 1200, channels: 3 },
      })
        .png()
        .toBuffer();
      await writeFile(path, source);
      // The previous released shape put the entire original in one completion.
      expect(
        estimateRuntimeEventBytes({
          type: "item.completed",
          threadId: "local-thread",
          itemId: "image",
          payload: {
            status: "success",
            images: [`data:image/png;base64,${source.toString("base64")}`],
          },
        }),
      ).toBeGreaterThan(8 * 1024 * 1024);

      const harness = setupCodexStructuredSession();
      const item = { id: "image", type: "imageView", path };
      harness.notify("item/started", { threadId: "provider-thread", item });
      harness.notify("item/completed", { threadId: "provider-thread", item });
      harness.notify("turn/completed", {
        threadId: "provider-thread",
        turn: { id: "turn-1", status: "completed" },
      });
      await vi.waitFor(
        () =>
          expect(
            harness.events.some(
              (event) =>
                event.type === "item.completed" &&
                !!(event.payload as { images?: string[] }).images,
            ),
          ).toBe(true),
        { timeout: 10_000 },
      );
      const previewEvent = harness.events.find((event) => event.type === "item.completed")!;
      const image = (previewEvent as { payload: { images: string[] } }).payload.images[0]!;
      const metadata = await sharp(Buffer.from(image.split(",")[1]!, "base64")).metadata();
      expect(metadata.format).toBe("webp");
      expect(metadata.width).toBeLessThanOrEqual(1600);
      const started = harness.events.find((event) => event.type === "item.started")!;
      expect(previewEvent).toMatchObject({ itemId: (started as { itemId: string }).itemId });
      expect(harness.events).toContainEqual(expect.objectContaining({ type: "item.completed" }));
      harness.notify("turn/started", { threadId: "provider-thread", turn: { id: "turn-2" } });
      harness.notify("item/completed", {
        threadId: "provider-thread",
        item: { id: "reply", type: "agentMessage", text: "still working" },
      });
      harness.notify("turn/completed", {
        threadId: "provider-thread",
        turn: { id: "turn-2", status: "completed" },
      });
      const onOverflow = vi.fn<() => void>();
      const emit = vi.fn<() => void>();
      const buffer = new RuntimeEventBuffer(emit, { onOverflow });
      for (const event of harness.events) buffer.append(event.threadId, event);
      buffer.flush();
      expect(onOverflow).not.toHaveBeenCalled();
      expect(buffer.hasPending()).toBe(false);
      expect(harness.events).toContainEqual(
        expect.objectContaining({
          type: "turn.completed",
          turnId: "turn-2",
          state: "completed",
        }),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not embed oversized files when the mapper is used without a session", async () => {
    const dir = await mkdtemp(join(tmpdir(), "poracode-codex-image-bound-"));
    try {
      const path = join(dir, "large.png");
      await writeFile(path, Buffer.alloc(9 * 1024 * 1024));
      const events = mapCodexNotification(
        "item/completed",
        {
          item: { id: "image", type: "imageView", path },
        },
        createCodexMapperState("thread"),
      );
      expect(events.at(-1)).toMatchObject({
        type: "item.completed",
        payload: { status: "success" },
      });
      expect(events.every((event) => estimateRuntimeEventBytes(event) < 1024 * 1024)).toBe(true);
      expect(await readCodexImageViewPreview(path)).toBeUndefined();
      expect(await readCodexImageViewPreview(join(dir, "missing.png"))).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("snapshots reused image paths and admits unopened child previews in lifecycle order", async () => {
    const dir = await mkdtemp(join(tmpdir(), "poracode-codex-child-image-"));
    try {
      const path = join(dir, "display.png");
      const source = await sharp({
        create: {
          width: 800,
          height: 800,
          channels: 3,
          background: "red",
        },
      })
        .png({ compressionLevel: 0 })
        .toBuffer();
      await writeFile(path, source);
      const harness = setupCodexStructuredSession();
      const emit = (
        harness.session as unknown as {
          emitRuntimeEvents(events: RuntimeEvent[]): void;
        }
      ).emitRuntimeEvents.bind(harness.session);
      emit([
        { type: "item.started", threadId: "local-thread", itemId: "parent", itemType: "tool_call" },
        {
          type: "item.started",
          threadId: "local-thread",
          itemId: "image",
          itemType: "image_view",
          parentItemId: "parent",
          payload: { args: { path } },
        },
        {
          type: "item.completed",
          threadId: "local-thread",
          itemId: "image",
          payload: { status: "success" },
        },
      ]);
      // The source can disappear immediately after the tool returns.
      await rm(path);
      await vi.waitFor(() =>
        expect(harness.events.some((event) => event.type === "item.completed")).toBe(true),
      );
      const completed = harness.events.find((event) => event.type === "item.completed")!;
      const image = (completed as { payload: { images: string[] } }).payload.images[0]!;
      const pixel = await sharp(Buffer.from(image.split(",")[1]!, "base64"))
        .resize(1, 1)
        .raw()
        .toBuffer();
      expect(pixel[0]).toBeGreaterThan(240);
      expect(pixel[1]).toBeLessThan(10);
      const published: SupervisorEvent[] = [];
      const router = new RuntimeEventRouter((event) => {
        published.push(event);
      });
      for (const event of harness.events) router.append(event.threadId, event);
      router.flush();
      // A small child preview must stay behind its unopened overlay's start.
      expect(JSON.stringify(published)).not.toContain("data:image/webp");
      router.append("local-thread", {
        type: "item.completed",
        threadId: "local-thread",
        itemId: "parent",
      });
      router.flush();
      expect(JSON.stringify(published)).toContain("data:image/webp");
      expect(
        JSON.stringify(published).indexOf('"itemId":"image","itemType":"image_view"'),
      ).toBeLessThan(JSON.stringify(published).indexOf("data:image/webp"));

      await writeFile(path, source);
      const previews = [
        readCodexImageViewPreview(path),
        readCodexImageViewPreview(path),
        readCodexImageViewPreview(path),
      ];
      const results = await Promise.all(previews);
      expect(results[0]).toMatch(/^data:image\/webp;base64,/);
      expect(results[1]).toMatch(/^data:image\/webp;base64,/);
      expect(results[2]).toBeUndefined();
      const disposed = setupCodexStructuredSession();
      const item = { id: "disposed-image", type: "imageView", path };
      disposed.notify("item/completed", { threadId: "provider-thread", item });
      (disposed.session as unknown as { isDisposed: boolean }).isDisposed = true;
      // Await the decoder independently to let its earlier queued work settle.
      await readCodexImageViewPreview(path);
      expect(disposed.events.some((event) => event.type === "item.completed")).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
