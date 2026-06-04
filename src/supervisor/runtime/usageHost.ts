import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  HostPort,
  HttpClient,
  HttpRequest,
  HttpResponse,
  Logger,
} from "@lightcode/agents-usage";
import { createNativeCredentialStore } from "./usageCredentials";

/**
 * Node implementation of the usage-collection HostPort. Supplies real HTTP
 * (global fetch), native credential resolution, and a wall clock. This is the
 * only place the otherwise-pure `@lightcode/agents-usage` package touches the
 * outside world.
 */

const DEFAULT_TIMEOUT_MS = 15_000;

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });
  return record;
}

function createNodeHttpClient(): HttpClient {
  return {
    async request(req: HttpRequest): Promise<HttpResponse> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      try {
        const res = await fetch(req.url, {
          method: req.method ?? "GET",
          ...(req.headers ? { headers: req.headers } : {}),
          ...(req.bodyBytes !== undefined
            ? { body: Buffer.from(req.bodyBytes) }
            : req.body !== undefined
              ? { body: req.body }
              : {}),
          signal: controller.signal,
        });
        const bodyBytes = new Uint8Array(await res.arrayBuffer());
        const body = Buffer.from(bodyBytes).toString("utf8");
        return { status: res.status, headers: headersToRecord(res.headers), body, bodyBytes };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

/** Dev-only file logger: dumps collector debug payloads to `<cacheDir>/usage-debug.json`. */
function createDevFileLogger(cacheDir: string): Logger {
  const path = join(cacheDir, "usage-debug.json");
  return {
    debug: (message, meta) => {
      try {
        writeFileSync(path, JSON.stringify({ message, meta, at: Date.now() }, null, 2));
      } catch {
        // best-effort diagnostics; never throw
      }
    },
    warn: () => {},
  };
}

export function createNodeUsageHost(cacheDir?: string): HostPort {
  const devLog =
    process.env.LIGHTCODE_IS_DEV === "1" && cacheDir ? createDevFileLogger(cacheDir) : undefined;
  return {
    http: createNodeHttpClient(),
    credentials: createNativeCredentialStore(cacheDir),
    now: () => Date.now(),
    ...(devLog ? { log: devLog } : {}),
  };
}
