import { appendFile, mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { RemoteClientError } from "@/shared/remote/clientErrors";
import { z } from "zod";

const objectSchema = z.record(z.string(), z.unknown());
const maxLogBytes = 1024 * 1024;
const maxEntryBytes = 16 * 1024;
let logQueue: Promise<void> = Promise.resolve();

export function summarizeAdapterInput(value: unknown): unknown {
  return summarize(value);
}

export function logAdapterError(input: {
  home: string;
  method: string;
  route: string;
  responseStatus?: number;
  input: unknown;
  error: unknown;
}) {
  const error = input.error;
  const remote =
    error instanceof RemoteClientError
      ? {
          status: error.status,
          code: error.code,
          requestPhase: error.requestPhase,
          requestMayHaveCommitted: error.requestMayHaveCommitted,
          details: summarize(
            "details" in error ? error.details : (error.responseEvidence ?? error.cause),
          ),
        }
      : undefined;
  const entry = {
    at: new Date().toISOString(),
    method: input.method,
    route: safeRoute(input.route),
    ...(input.responseStatus !== undefined ? { responseStatus: input.responseStatus } : {}),
    input: summarize(input.input),
    error: {
      name: error instanceof Error ? error.name : typeof error,
      message: safeText(error instanceof Error ? error.message : String(error)).slice(0, 1000),
      stack: safeText(error instanceof Error ? (error.stack ?? "") : "").slice(0, 6000),
      ...(remote ? { remote } : {}),
    },
  };
  const line = `${JSON.stringify(entry)}\n`;
  const boundedLine =
    Buffer.byteLength(line) <= maxEntryBytes
      ? line
      : `${JSON.stringify({
          at: entry.at,
          method: entry.method,
          route: entry.route,
          error: {
            name: entry.error.name,
            message: entry.error.message,
            stack: entry.error.stack.slice(0, 1000),
            ...(remote
              ? {
                  remote: {
                    status: remote.status,
                    code: remote.code,
                    requestPhase: remote.requestPhase,
                    requestMayHaveCommitted: remote.requestMayHaveCommitted,
                    details: safeText(JSON.stringify(remote.details)).slice(0, 1000),
                  },
                }
              : {}),
          },
        })}\n`;
  return appendLogLine(input.home, boundedLine);
}

export function logAdapterDebug(home: string, counters: Record<string, unknown>) {
  const entry = { at: new Date().toISOString(), kind: "debug", counters: summarize(counters) };
  const line = `${JSON.stringify(entry)}\n`;
  return appendLogLine(
    home,
    Buffer.byteLength(line) <= maxEntryBytes
      ? line
      : `${JSON.stringify({ at: entry.at, kind: "debug", truncated: true })}\n`,
  );
}

function appendLogLine(home: string, boundedLine: string) {
  logQueue = logQueue
    .then(async () => {
      const logDir = path.join(home, "log");
      const logPath = path.join(logDir, "adapter.log");
      await mkdir(logDir, { recursive: true });
      const currentSize = await stat(logPath)
        .then((file) => file.size)
        .catch(() => 0);
      if (currentSize + Buffer.byteLength(boundedLine) > maxLogBytes) {
        const rotated = `${logPath}.1`;
        await unlink(rotated).catch(() => undefined);
        await rename(logPath, rotated).catch(() => writeFile(logPath, "", "utf8"));
      }
      await appendFile(logPath, boundedLine, "utf8");
    })
    .catch(() => undefined);
  return logQueue;
}

function summarize(value: unknown, key = "", depth = 0): unknown {
  if (secretKey.test(key)) return "[redacted]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    const safe = safeText(value);
    if (promptKey.test(key)) return { length: value.length, preview: safe.slice(0, 200) };
    if (bodyKey.test(key)) return { length: value.length };
    return safe.slice(0, 200);
  }
  if (depth >= 4) return { type: Array.isArray(value) ? "array" : typeof value };
  if (Array.isArray(value)) {
    return {
      count: value.length,
      items: value.slice(0, 8).map((item) => summarize(item, key, depth + 1)),
    };
  }
  const object = objectSchema.safeParse(value);
  if (!object.success) return typeof value;
  return Object.fromEntries(
    Object.entries(object.data)
      .slice(0, 24)
      .map(([name, item]) => [name, summarize(item, name, depth + 1)]),
  );
}

const secretKey = /(?:token|password|credential|secret|authorization|cookie|pairing|api[_-]?key)/iu;
const promptKey = /^(?:prompt|text|command)$/iu;
const bodyKey = /^(?:data|content|image|payload|files)$/iu;

function safeText(value: string) {
  return value
    .replace(/https?:\/\/[^\s"'<>]+/giu, "<redacted-url>")
    .replace(
      /\b(access[_-]?token|refresh[_-]?token|pairing[_-]?token|client[_-]?secret|api[_-]?key|authorization|bearer|token|password|credential|secret)\b\s*[:=]?\s*(?:bearer\s+)?[^\s,;]+/giu,
      "$1=<redacted>",
    );
}

function safeRoute(value: string) {
  return value
    .replace(/\/session\/[^/]+/giu, "/session/:id")
    .replace(/\/threads\/[^/]+/giu, "/threads/:id");
}
