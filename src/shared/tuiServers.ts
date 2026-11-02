import { createHash } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { writeFileAtomic } from "./atomicFile";

/**
 * Remote hosts the TUI has paired with (`<profile>/tui/servers.json`, 0600).
 * The file holds labels and endpoints only; each server's refreshable session
 * lives in `servers/<id>/session.json` with the same shape as the local
 * `session.json`. The local host is implicit and never listed. Bump
 * TUI_SERVERS_VERSION when the persisted shape changes; an unknown version
 * reads as an empty list and is never overwritten.
 */
export const TUI_SERVERS_VERSION = 1;
export const TUI_SERVERS_FILE_NAME = "servers.json";
export const TUI_SERVERS_DIRECTORY = "servers";

/**
 * The TUI's request to relaunch against another server
 * (`<profile>/tui/server-switch.json`, 0600). The CLI consumes and deletes it
 * when the TUI exits with TUI_SWITCH_SERVER_EXIT_CODE. A `pair` target carries
 * a one-time pairing link, so the file never outlives that relaunch.
 */
export const TUI_SERVER_SWITCH_VERSION = 1;
export const TUI_SERVER_SWITCH_FILE_NAME = "server-switch.json";
/** Child exit code meaning "relaunch against the server in server-switch.json". */
export const TUI_SWITCH_SERVER_EXIT_CODE = 78;

const tuiServerIdSchema = z.string().regex(/^s-[0-9a-f]{12}$/u);

export const tuiServerSchema = z.strictObject({
  id: tuiServerIdSchema,
  name: z.string().min(1).max(80),
  endpoint: z.string().url(),
  addedAt: z.string().min(1),
});
export type TuiServer = z.infer<typeof tuiServerSchema>;

const tuiServersFileSchema = z.strictObject({
  version: z.literal(TUI_SERVERS_VERSION),
  servers: z.array(tuiServerSchema),
});

export const tuiServerSwitchSchema = z.strictObject({
  version: z.literal(TUI_SERVER_SWITCH_VERSION),
  target: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("local") }),
    z.strictObject({ kind: z.literal("server"), id: tuiServerIdSchema }),
    z.strictObject({
      kind: z.literal("pair"),
      pairingUrl: z.string().url(),
      name: z.string().min(1).max(80).optional(),
    }),
  ]),
});
export type TuiServerSwitchTarget = z.infer<typeof tuiServerSwitchSchema>["target"];

/** One stable slot per endpoint, so re-pairing a server replaces its session. */
export function tuiServerIdForEndpoint(endpoint: string): string {
  return `s-${createHash("sha256").update(endpoint).digest("hex").slice(0, 12)}`;
}

/** Where a server's saved session lives; the local host keeps the profile root. */
export function tuiSessionDirectory(home: string, serverId?: string): string {
  return serverId ? join(home, TUI_SERVERS_DIRECTORY, serverId) : home;
}

const readJson = (path: string): unknown => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
};

/** Saved servers; a missing, unreadable, or unknown-version file is empty. */
export function readTuiServers(home: string): TuiServer[] {
  const parsed = tuiServersFileSchema.safeParse(readJson(join(home, TUI_SERVERS_FILE_NAME)));
  return parsed.success ? parsed.data.servers : [];
}

/** Adds or replaces the server with the same id. Refuses to clobber a newer file. */
export function saveTuiServer(home: string, server: TuiServer): void {
  const path = join(home, TUI_SERVERS_FILE_NAME);
  const existing = readJson(path);
  const version = z.object({ version: z.unknown() }).safeParse(existing);
  if (version.success && version.data.version !== TUI_SERVERS_VERSION)
    throw new Error("The saved server list was written by a newer Poracode; update first.");
  const servers = readTuiServers(home).filter((value) => value.id !== server.id);
  writeFileAtomic(
    path,
    `${JSON.stringify({ version: TUI_SERVERS_VERSION, servers: [...servers, server] }, null, 2)}\n`,
    { mode: 0o600, exactMode: true },
  );
}

/** Matches a `--server` argument against a saved server's id or name. */
export function findTuiServer(servers: readonly TuiServer[], query: string): TuiServer | undefined {
  const lowered = query.trim().toLowerCase();
  return (
    servers.find((value) => value.id === query) ??
    servers.find((value) => value.name.toLowerCase() === lowered)
  );
}

export function writeTuiServerSwitch(home: string, target: TuiServerSwitchTarget): void {
  writeFileAtomic(
    join(home, TUI_SERVER_SWITCH_FILE_NAME),
    `${JSON.stringify({ version: TUI_SERVER_SWITCH_VERSION, target })}\n`,
    { mode: 0o600, exactMode: true },
  );
}

/** Reads and deletes the switch request; undefined when absent or invalid. */
export function takeTuiServerSwitch(home: string): TuiServerSwitchTarget | undefined {
  const path = join(home, TUI_SERVER_SWITCH_FILE_NAME);
  const parsed = tuiServerSwitchSchema.safeParse(readJson(path));
  rmSync(path, { force: true });
  return parsed.success ? parsed.data.target : undefined;
}
