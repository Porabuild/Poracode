import type { ProjectLocation } from "@/shared/contracts";

export type OpenCode2Database = "native" | "legacy-isolated";

/** Previous Poracode releases allocated sessions in this separate database. */
export const OPENCODE2_LEGACY_DATABASE_ENV = { OPENCODE_DB: "opencode-v2.db" };

const sessionDatabases = new Map<string, OpenCode2Database>();

function sessionKey(location: ProjectLocation, sessionID: string): string {
  const runtime = location.kind === "wsl" ? `wsl:${location.distro}` : location.kind;
  return JSON.stringify([runtime, sessionID]);
}

export function rememberOpenCode2SessionDatabase(
  location: ProjectLocation,
  sessionID: string,
  database: OpenCode2Database,
): void {
  sessionDatabases.set(sessionKey(location, sessionID), database);
}

export function cachedOpenCode2SessionDatabase(
  location: ProjectLocation,
  sessionID: string,
): OpenCode2Database | undefined {
  return sessionDatabases.get(sessionKey(location, sessionID));
}

/** Terminal attachment must use the same database as structured preparation. */
export function openCode2SessionDatabaseEnv(
  location: ProjectLocation,
  sessionID: string | undefined,
): Record<string, string> | undefined {
  if (!sessionID) return undefined;
  const database = cachedOpenCode2SessionDatabase(location, sessionID);
  if (!database) {
    throw new Error(
      "OpenCode 2 session database was not resolved. Resume preparation must complete before terminal attachment.",
    );
  }
  return database === "legacy-isolated" ? OPENCODE2_LEGACY_DATABASE_ENV : undefined;
}

export function clearOpenCode2SessionDatabases(): void {
  sessionDatabases.clear();
}

export function isOpenCode2SessionNotFound(error: unknown, sessionID: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === "SessionNotFoundError" &&
    "sessionID" in error &&
    error.sessionID === sessionID
  );
}
