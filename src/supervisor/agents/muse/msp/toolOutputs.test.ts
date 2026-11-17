import { appendFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, toNamespacedPath } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { MuseMspToolOutputs } from "./toolOutputs";

let root: string;
let path: string;
let png: string;
let media: MuseMspToolOutputs;
let events: RuntimeEvent[];

function frame(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    payload_schema_version: 1,
    payload_type: "runtime.session",
    stream: { kind: "session", id: "session-1" },
    payload: {
      kind: "run",
      run_id: "turn-1",
      event: {
        kind: "tool_result_model_visible_content",
        call_id: "call-1",
        content: [{ kind: "image", media_type: "image/png", path: "mcp-image", base64_data: png }],
      },
    },
    ...overrides,
  };
}

function tool(overrides: Record<string, unknown> = {}) {
  return {
    kind: "toolCall",
    status: "completed",
    callId: "call-1",
    turnId: "turn-1",
    tool: "mcp__browser__screenshot",
    visibleOutput: "[MCP image content: media_type=image/png, bytes=100]",
    ...overrides,
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "poracode-muse-media-"));
  path = join(root, "session.jsonl");
  png = (
    await sharp({ create: { width: 40, height: 25, channels: 3, background: "blue" } })
      .png()
      .toBuffer()
  ).toString("base64");
  events = [];
  media = new MuseMspToolOutputs({ kind: "windows", path: root }, "thread-1", (event) =>
    events.push(event),
  );
  media.open("session-1", path);
});

afterEach(async () => {
  media.dispose();
  await rm(root, { recursive: true, force: true });
});

describe("Muse tool outputs", () => {
  it("waits for resumed monitors to finish before recovering their final output", async () => {
    const output = join(root, "tool-outputs", "monitor.txt");
    await mkdir(join(root, "tool-outputs"));
    await writeFile(output, "");
    const monitor = tool({
      tool: "monitor",
      status: "inProgress",
      outputRef: { kind: "monitor-stdout", availability: "available", path: output },
    });
    await media.observe("session-1", "monitor-1", monitor);
    expect(events).toEqual([]);
    await appendFile(output, "MONITOR_FINAL_EVENT");
    await media.observe("session-1", "monitor-1", { ...monitor, status: "completed" });
    expect(events).toEqual([
      {
        type: "item.updated",
        threadId: "thread-1",
        itemId: "monitor-1",
        payload: {
          result: {
            receipt: monitor.visibleOutput,
            output: "MONITOR_FINAL_EVENT",
            truncated: false,
          },
        },
      },
    ]);
  });

  it("recovers monitor stdout when the native output reference reports zero bytes", async () => {
    const output = join(root, "tool-outputs", "monitor.txt");
    await mkdir(join(root, "tool-outputs"));
    await writeFile(output, "MONITOR_EVENT_ALPHA\r\nMONITOR_EVENT_BETA\r\n");
    await media.observe(
      "session-1",
      "monitor-1",
      tool({
        tool: "monitor",
        visibleOutput: "Monitor started",
        outputRef: {
          kind: "monitor-stdout",
          availability: "available",
          byteLen: 0,
          path: toNamespacedPath(output),
        },
      }),
    );
    expect(events).toEqual([
      {
        type: "item.updated",
        threadId: "thread-1",
        itemId: "monitor-1",
        payload: {
          result: {
            receipt: "Monitor started",
            output: "MONITOR_EVENT_ALPHA\r\nMONITOR_EVENT_BETA\r\n",
            truncated: false,
          },
        },
      },
    ]);
  });

  it("keeps cancelled monitor output bounded and does not revive the native status", async () => {
    const output = join(root, "tool-outputs", "monitor.txt");
    await mkdir(join(root, "tool-outputs"));
    await writeFile(output, `${"x".repeat(20000)}MONITOR_LAST_EVENT`);
    await media.observe(
      "session-1",
      "monitor-1",
      tool({
        tool: "monitor",
        status: "cancelled",
        outputRef: { kind: "monitor-stdout", availability: "available", path: output },
      }),
    );
    expect(events[0]).toMatchObject({
      type: "item.updated",
      payload: {
        result: { output: expect.stringContaining("MONITOR_LAST_EVENT"), truncated: true },
      },
    });
    const payload = (events[0] as Extract<RuntimeEvent, { type: "item.updated" }>)
      .payload as Record<string, unknown>;
    expect(payload["status"]).toBeUndefined();
    expect((payload["result"] as { output: string }).output.length).toBeLessThanOrEqual(16384);
  });

  it("refuses advertised files outside the session output bucket, including symlink escapes", async () => {
    const bucket = join(root, "tool-outputs");
    const other = join(root, "private");
    await mkdir(bucket);
    await mkdir(other);
    await writeFile(join(other, "secret.txt"), "DO_NOT_RENDER");
    await symlink(other, join(bucket, "linked"), process.platform === "win32" ? "junction" : "dir");
    await media.observe(
      "session-1",
      "outside-1",
      tool({
        tool: "monitor",
        outputRef: {
          kind: "monitor-stdout",
          availability: "available",
          path: join(other, "secret.txt"),
        },
      }),
    );
    await media.observe(
      "session-1",
      "outside-2",
      tool({
        tool: "monitor",
        outputRef: {
          kind: "monitor-stdout",
          availability: "available",
          path: join(bucket, "linked", "secret.txt"),
        },
      }),
    );
    expect(events).toEqual([]);
  });

  it("projects retained image bytes onto the original tool without reading its recorded path", async () => {
    await writeFile(path, `${JSON.stringify(frame())}\n`);
    void media.observe("session-1", "tool-1", tool());
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({
      type: "item.updated",
      threadId: "thread-1",
      itemId: "tool-1",
    });
    const { images: image } = (events[0] as Extract<RuntimeEvent, { type: "item.updated" }>)
      .payload as { images: string[] };
    const metadata = await sharp(Buffer.from(image[0]!.split(",")[1]!, "base64")).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 40, height: 25 });
    void media.observe("session-1", "tool-1", tool());
    expect(events).toHaveLength(1);
  });

  it("waits for a complete durable line written after the tool completes", async () => {
    const line = JSON.stringify(frame());
    await writeFile(path, line.slice(0, -20));
    void media.observe("session-1", "tool-1", tool());
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(events).toEqual([]);
    await appendFile(path, `${line.slice(-20)}\n`);
    await vi.waitFor(() => expect(events).toHaveLength(1));
  });

  it("keeps same-call images scoped to the native session, turn, and schema", async () => {
    const wrongTurn = frame();
    wrongTurn.payload.run_id = "old-turn";
    const wrongCall = frame();
    wrongCall.payload.event.call_id = "other-call";
    await writeFile(
      path,
      [
        frame({ stream: { kind: "session", id: "another-session" } }),
        frame({ schema_version: 2 }),
        frame({ payload_schema_version: 2 }),
        wrongTurn,
        wrongCall,
        frame(),
      ]
        .map((entry) => JSON.stringify(entry))
        .join("\n") + "\n",
    );
    void media.observe("session-1", "parent/child/tool-1", tool());
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({ itemId: "parent/child/tool-1" });
  });

  it("ignores failed tools, unknown sessions, and missing native call identities", async () => {
    await writeFile(path, `${JSON.stringify(frame())}\n`);
    void media.observe("session-1", "failed", tool({ status: "failed" }));
    void media.observe("other-session", "other", tool());
    void media.observe("session-1", "no-call", tool({ callId: null }));
    void media.observe("session-1", "no-turn", tool({ turnId: null }));
    expect(events).toEqual([]);
  });

  it("retains multiple images and skips malformed, URL, and non-image content", async () => {
    const entry = frame();
    entry.payload.event.content = [
      {
        kind: "image",
        media_type: "image/png",
        path: "https://example.com/tracker.png",
        base64_data: "not-image-data",
      },
      { kind: "image", media_type: "text/plain", path: "secret.txt", base64_data: png },
      ...entry.payload.event.content,
      ...entry.payload.event.content,
    ];
    await writeFile(path, `${JSON.stringify(entry)}\n`);
    void media.observe("session-1", "tool-1", tool());
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({
      payload: { images: [expect.stringMatching(/^data:image\/webp;base64,/), expect.any(String)] },
    });
  });

  it("publishes no late media after disposal", async () => {
    await writeFile(path, `${JSON.stringify(frame())}\n`);
    void media.observe("session-1", "tool-1", tool());
    media.dispose();
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(events).toEqual([]);
  });
});
