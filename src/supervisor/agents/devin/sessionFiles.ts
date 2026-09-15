import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import { withReadonlyDb } from "../../runtime/sqliteRead";
import { createKnownSessionRef, watchSessionPaths } from "../base";
import { devinCredentialsPath } from "./credentials";

// Verified on 3000.10.21. Read identifiers only, never provider transcripts.
function databasePath() {
  return join(dirname(devinCredentialsPath()), "cli", "sessions.db");
}

async function sessionIds(location: ProjectLocation): Promise<string[] | undefined> {
  if (location.kind === "wsl") return undefined;
  if (!existsSync(databasePath())) return [];
  return withReadonlyDb(databasePath(), (db) =>
    db
      .prepare("SELECT id FROM sessions WHERE working_directory = ?")
      .all(location.path)
      .flatMap((row) => {
        const id = (row as { id?: unknown }).id;
        return typeof id === "string" ? [id] : [];
      }),
  );
}

export function createDevinSessionDiscovery() {
  type Pending = { before?: Set<string>; ambiguous: boolean; count: number; ready: Promise<void> };
  const pending = new Map<string, Pending>();
  return {
    prepare(location: ProjectLocation): (() => void) | undefined {
      if (location.kind === "wsl") return undefined;
      let entry = pending.get(location.path);
      if (entry) {
        entry.ambiguous = true;
        entry.count += 1;
      } else {
        const created: Pending = { ambiguous: false, count: 1, ready: Promise.resolve() };
        entry = created;
        pending.set(location.path, created);
        created.ready = sessionIds(location).then((ids) => {
          if (ids) created.before = new Set(ids);
        });
      }
      const captured = entry;
      let disposed = false;
      // Ride AgentArgvSpec.cleanup, including abort/spawn failures before the
      // session watcher attaches. A watcher alone cannot own this reservation.
      return () => {
        if (disposed) return;
        disposed = true;
        if (--captured.count === 0 && pending.get(location.path) === captured)
          pending.delete(location.path);
      };
    },
    async ready(location: ProjectLocation) {
      if (location.kind !== "wsl") await pending.get(location.path)?.ready;
    },
    async discover(location: ProjectLocation) {
      if (location.kind === "wsl") return undefined;
      const entry = pending.get(location.path);
      if (!entry?.before || entry.ambiguous) return undefined;
      const candidates = (await sessionIds(location))?.filter((id) => !entry.before!.has(id));
      if (entry.ambiguous || candidates?.length !== 1 || pending.get(location.path) !== entry)
        return undefined;
      pending.delete(location.path);
      return createKnownSessionRef(candidates[0]!);
    },
    watch(location: ProjectLocation, onChanged: () => void) {
      if (location.kind === "wsl") return undefined;
      return watchSessionPaths(location, [dirname(databasePath())], onChanged, "devin-sessions");
    },
  };
}
