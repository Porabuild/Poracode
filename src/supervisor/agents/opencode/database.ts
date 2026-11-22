import type { ProjectLocation } from "@/shared/contracts";

export type OpenCodeDatabase = "native" | "legacy-isolated";

/** Previous Poracode releases allocated sessions in this separate database. */
export const OPENCODE_LEGACY_DATABASE_ENV = { OPENCODE_DB: "opencode-v2.db" };

const sessionDatabases = new Map<string, OpenCodeDatabase>();

function sessionKey(location: ProjectLocation, sessionID: string): string {
  const runtime = location.kind === "wsl" ? `wsl:${location.distro}` : location.kind;
  return JSON.stringify([runtime, sessionID]);
}

export function rememberOpenCodeSessionDatabase(
  location: ProjectLocation,
  sessionID: string,
  database: OpenCodeDatabase,
): void {
  sessionDatabases.set(sessionKey(location, sessionID), database);
}

export function cachedOpenCodeSessionDatabase(
  location: ProjectLocation,
  sessionID: string,
): OpenCodeDatabase | undefined {
  return sessionDatabases.get(sessionKey(location, sessionID));
}

/** Terminal attachment must use the same database as structured preparation. */
export function openCodeSessionDatabaseEnv(
  location: ProjectLocation,
  sessionID: string | undefined,
): Record<string, string> | undefined {
  if (!sessionID) return undefined;
  const database = cachedOpenCodeSessionDatabase(location, sessionID);
  if (!database) {
    throw new Error(
      "OpenCode session database was not resolved. Resume preparation must complete before terminal attachment.",
    );
  }
  return database === "legacy-isolated" ? OPENCODE_LEGACY_DATABASE_ENV : undefined;
}

export function clearOpenCodeSessionDatabases(): void {
  sessionDatabases.clear();
}

export function isOpenCodeSessionNotFound(error: unknown, sessionID: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === "SessionNotFoundError" &&
    "sessionID" in error &&
    error.sessionID === sessionID
  );
}
