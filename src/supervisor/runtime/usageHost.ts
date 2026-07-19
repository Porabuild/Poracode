import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HostPort, Logger } from "@poracode/agents-usage";
import { createNativeCredentialStore } from "./usageCredentials";
import { createNodeHttpClient } from "./usageHttpClient";

/**
 * Node implementation of the usage-collection HostPort. Supplies real HTTP
 * (global fetch), native credential resolution, and a wall clock. This is the
 * only place the otherwise-pure `@poracode/agents-usage` package touches the
 * outside world.
 */

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

export function createNodeUsageHost(cacheDir?: string, settingsPath?: string): HostPort {
  const devLog =
    process.env.PORACODE_IS_DEV === "1" && cacheDir ? createDevFileLogger(cacheDir) : undefined;
  return {
    http: createNodeHttpClient(),
    credentials: createNativeCredentialStore(cacheDir, settingsPath),
    now: () => Date.now(),
    ...(devLog ? { log: devLog } : {}),
  };
}
