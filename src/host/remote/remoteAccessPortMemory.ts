import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { writeFileAtomic } from "@/shared/atomicFile";
import { DEFAULT_REMOTE_ACCESS_PORT } from "./config";

/**
 * The remote-access port each bind host last served on, kept in the host data
 * root. Paired clients store the full endpoint, so a host that restarts on
 * another port leaves every paired client offline until it is re-paired.
 * Startup therefore prefers this port over the first free one in the range.
 *
 * Version 1 is the first shape. A missing or malformed file means no memory:
 * startup prefers the default port, which is where every host before this
 * file served unless that port was taken. A future-version file is read as
 * no memory and never overwritten, so a downgrade cannot clobber it.
 */
export const REMOTE_ACCESS_PORT_MEMORY_VERSION = 1;
export const REMOTE_ACCESS_PORT_MEMORY_FILE = "remote-access-port.json";

const memorySchema = z.object({
  version: z.literal(REMOTE_ACCESS_PORT_MEMORY_VERSION),
  ports: z.record(z.string(), z.number().int().min(1).max(65_535)),
});

interface PortMemory {
  readonly writable: boolean;
  readonly ports: Readonly<Record<string, number>>;
}

function memoryPath(baseDir: string): string {
  return join(baseDir, REMOTE_ACCESS_PORT_MEMORY_FILE);
}

function readMemory(baseDir: string): PortMemory {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(memoryPath(baseDir), "utf8"));
  } catch {
    return { writable: true, ports: {} };
  }
  const version = (raw as { readonly version?: unknown } | null)?.version;
  if (typeof version === "number" && version > REMOTE_ACCESS_PORT_MEMORY_VERSION) {
    return { writable: false, ports: {} };
  }
  const parsed = memorySchema.safeParse(raw);
  return { writable: true, ports: parsed.success ? parsed.data.ports : {} };
}

/** The port to try first for `bindHost`: its remembered port, else the default. */
export function preferredRemoteAccessPort(baseDir: string, bindHost: string): number {
  return readMemory(baseDir).ports[bindHost] ?? DEFAULT_REMOTE_ACCESS_PORT;
}

/**
 * Records the port `bindHost` is serving on. Best effort: a failed write only
 * costs the next restart its preference, so it never fails startup.
 */
export function rememberRemoteAccessPort(baseDir: string, bindHost: string, port: number): void {
  try {
    const memory = readMemory(baseDir);
    if (!memory.writable || memory.ports[bindHost] === port) return;
    const next = {
      version: REMOTE_ACCESS_PORT_MEMORY_VERSION,
      ports: { ...memory.ports, [bindHost]: port },
    };
    writeFileAtomic(memoryPath(baseDir), `${JSON.stringify(next, null, 2)}\n`, {
      encoding: "utf8",
    });
  } catch (error) {
    console.warn("[poracode] could not remember the remote access port:", error);
  }
}

/** The port a started server actually listens on, from its local base URL. */
export function listeningPortOf(localHttpBaseUrl: string): number | null {
  try {
    const port = Number(new URL(localHttpBaseUrl).port);
    return Number.isSafeInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}
