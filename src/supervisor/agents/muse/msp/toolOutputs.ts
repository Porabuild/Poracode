import type { ProjectLocation, RuntimeEvent } from "@/shared/contracts";
import { isUserAttachmentImageReadPayload } from "@/shared/inlineImagePayload";
import { open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep, toNamespacedPath } from "node:path";
import { toWslUncPath } from "@/shared/wsl";
import { readTailLines } from "../../base/sessionImport";
import { museJsonRecord, museRecord, museString } from "./subagentDiscovery";

const MAX_LOG_TAIL_BYTES = 32 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_INLINE_IMAGE_BYTES = 512 * 1024;
const MAX_STDOUT_BYTES = 16 * 1024;

/** Recover rich output that MSP 1.4.23 retains but omits from its tool snapshots. */
export class MuseMspToolOutputs {
  private readonly paths = new Map<string, string>();
  private readonly pending = new Set<string>();
  private reading = Promise.resolve();
  private disposed = false;

  constructor(
    private readonly location: ProjectLocation,
    private readonly threadId: string,
    private readonly emit: (event: RuntimeEvent) => void,
  ) {}

  open(sessionId: string, path: unknown): void {
    if (typeof path === "string" && path.endsWith("session.jsonl")) {
      this.paths.set(sessionId, path);
    }
  }

  observe(sessionId: string, itemId: string, item: Record<string, unknown>): Promise<void> {
    if (this.disposed || item["kind"] !== "toolCall") return this.reading;
    const callId = museString(item["callId"]);
    const turnId = museString(item["turnId"]);
    const path = this.paths.get(sessionId);
    const output = museString(item["visibleOutput"]) ?? "";
    const tool = museString(item["tool"]) ?? "";
    const ref = museRecord(item["outputRef"]);
    const stdoutPath = museString(ref["path"]);
    const stdoutKey = `stdout:${sessionId}/${itemId}`;
    if (
      path &&
      tool === "monitor" &&
      item["status"] !== "inProgress" &&
      ref["kind"] === "monitor-stdout" &&
      ref["availability"] === "available" &&
      stdoutPath &&
      !this.pending.has(stdoutKey)
    ) {
      this.pending.add(stdoutKey);
      this.reading = this.reading.then(() => this.publishStdout(itemId, path, stdoutPath, output));
    }
    if (item["status"] !== "completed") return this.reading;
    const toolArgs = museJsonRecord(item["args"] ?? item["input"]);
    if (isUserAttachmentImageReadPayload({ name: tool, args: toolArgs, result: output })) {
      return this.reading;
    }
    const hasMedia =
      Array.isArray(item["modelVisibleContent"]) ||
      /image/i.test(tool) ||
      output.includes("[MCP image content:") ||
      output.startsWith("Read image file ");
    const key = `${sessionId}/${itemId}`;
    if (!path || !callId || !turnId || !hasMedia || this.pending.has(key)) return this.reading;
    this.pending.add(key);
    this.reading = this.reading.then(() => this.publish(sessionId, itemId, callId, turnId, path));
    return this.reading;
  }

  dispose(): void {
    this.disposed = true;
    this.paths.clear();
    this.pending.clear();
  }

  private hostPath(path: string): string {
    return this.location.kind === "wsl" ? toWslUncPath(this.location.distro, path) : path;
  }

  private async publishStdout(
    itemId: string,
    logPath: string,
    outputPath: string,
    receipt: string,
  ): Promise<void> {
    if (this.disposed) return;
    const sessionDir = dirname(this.hostPath(logPath));
    const candidate = this.hostPath(outputPath);
    // OutputRef paths are allowed only in this native session's output bucket.
    // Check before filesystem access, then again after resolving symlinks.
    if (!within(join(sessionDir, "tool-outputs"), candidate)) return;
    try {
      const [realSession, realOutput] = await Promise.all([
        realpath(sessionDir),
        realpath(candidate),
      ]);
      if (this.disposed || !within(join(realSession, "tool-outputs"), realOutput)) return;
      const file = await open(realOutput, "r");
      let output = "";
      let truncated = false;
      try {
        const info = await file.stat();
        if (!info.isFile()) return;
        const length = Math.min(info.size, MAX_STDOUT_BYTES);
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await file.read(buffer, 0, length, Math.max(0, info.size - length));
        truncated = info.size > length;
        let start = 0;
        while (start < bytesRead && (buffer[start]! & 0xc0) === 0x80) start++;
        output = buffer.subarray(start, bytesRead).toString("utf8");
      } finally {
        await file.close();
      }
      if (output && !this.disposed)
        this.emit({
          type: "item.updated",
          threadId: this.threadId,
          itemId,
          payload: { result: { receipt, output, truncated } },
        });
    } catch {
      // A missing output file must not replace the native operation receipt.
    }
  }

  private async publish(
    sessionId: string,
    itemId: string,
    callId: string,
    turnId: string,
    path: string,
  ): Promise<void> {
    const hostPath = this.location.kind === "wsl" ? toWslUncPath(this.location.distro, path) : path;
    // The durable image record can follow item/completed. Retry that short
    // write window without polling idle sessions or replaying their history.
    for (let attempt = 0; attempt < 3 && !this.disposed; attempt++) {
      try {
        const lines = await readTailLines(hostPath, MAX_LOG_TAIL_BYTES);
        if (this.disposed) return;
        for (const line of lines) {
          if (!line.includes('"tool_result_model_visible_content"')) continue;
          const frame = museJsonRecord(line);
          const payload = museRecord(frame["payload"]);
          const event = museRecord(payload["event"]);
          if (
            frame["schema_version"] !== 1 ||
            frame["payload_schema_version"] !== 1 ||
            frame["payload_type"] !== "runtime.session" ||
            museRecord(frame["stream"])["kind"] !== "session" ||
            museRecord(frame["stream"])["id"] !== sessionId ||
            payload["kind"] !== "run" ||
            payload["run_id"] !== turnId ||
            event["kind"] !== "tool_result_model_visible_content" ||
            event["call_id"] !== callId ||
            !Array.isArray(event["content"])
          )
            continue;
          const images = await museToolImages(event["content"]);
          if (images.length && !this.disposed) {
            this.emit({
              type: "item.updated",
              threadId: this.threadId,
              itemId,
              payload: { images },
            });
          }
          return;
        }
      } catch {
        // Missing/rotated logs and unavailable image previews keep the text result.
      }
      if (attempt < 2 && !this.disposed)
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
    }
  }
}

function within(root: string, path: string): boolean {
  const child = relative(toNamespacedPath(root), toNamespacedPath(path));
  return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

async function museToolImages(content: unknown[]): Promise<string[]> {
  const images: string[] = [];
  for (const part of content) {
    const image = museRecord(part);
    const data = museString(image["base64_data"]);
    if (
      image["kind"] !== "image" ||
      !museString(image["media_type"])?.startsWith("image/") ||
      !data ||
      data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4
    )
      continue;
    try {
      const { default: sharp } = await import("sharp");
      const bytes = Buffer.from(data, "base64");
      for (const width of [1600, 800]) {
        const preview = await sharp(bytes, { limitInputPixels: 64 * 1024 * 1024 })
          .rotate()
          .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
        if (preview.length <= MAX_INLINE_IMAGE_BYTES) {
          images.push(`data:image/webp;base64,${preview.toString("base64")}`);
          break;
        }
      }
    } catch {
      // Never promote a path/URL or non-image bytes into the display channel.
    }
    if (images.length === 4) break;
  }
  return images;
}
