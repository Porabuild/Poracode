import { lstatSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { msg } from "@/shared/messages";
import { getSqlite } from "./connection";
import { LATEST_SCHEMA_VERSION } from "./migrations";

type AdmissionFailure = "connection" | "root" | "file" | "schema";
export class PreparedDatabaseUnavailableError extends Error {
  constructor(
    readonly reason: AdmissionFailure,
    options?: ErrorOptions,
  ) {
    super(msg("settings.dataNotPrepared"), options);
    this.name = "PreparedDatabaseUnavailableError";
  }
}

function identity(path: string, directory: boolean) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()))
    throw new PreparedDatabaseUnavailableError(directory ? "root" : "file");
  return { path: realpathSync(path), dev: stat.dev, ino: stat.ino, birth: stat.birthtimeMs };
}

/**
 * Capture only the identity of a successfully prepared, file-backed connection
 * for later comparison. No schema version or admission is cached. The owning
 * composition must independently assert its live lease/data-fence custody.
 */
export function capturePreparedDatabaseWriteAdmission(
  database: ReturnType<typeof getSqlite>,
  dataRoot: string,
  dbPath: string,
): (settingsRoot: string) => void {
  const rootPath = resolve(dataRoot);
  const filePath = resolve(dbPath);
  if (dirname(filePath) !== rootPath || !database.open || getSqlite() !== database)
    throw new PreparedDatabaseUnavailableError("connection");
  const root = identity(rootPath, true);
  const file = identity(filePath, false);
  if (realpathSync(database.name) !== file.path) throw new PreparedDatabaseUnavailableError("file");

  return (settingsRoot) => {
    try {
      if (!database.open || getSqlite() !== database)
        throw new PreparedDatabaseUnavailableError("connection");
      const currentRoot = identity(rootPath, true);
      const currentFile = identity(filePath, false);
      if (
        realpathSync(settingsRoot) !== root.path ||
        currentRoot.path !== root.path ||
        currentRoot.dev !== root.dev ||
        currentRoot.ino !== root.ino ||
        currentRoot.birth !== root.birth
      )
        throw new PreparedDatabaseUnavailableError("root");
      if (
        currentFile.path !== file.path ||
        currentFile.dev !== file.dev ||
        currentFile.ino !== file.ino ||
        currentFile.birth !== file.birth ||
        realpathSync(database.name) !== file.path
      )
        throw new PreparedDatabaseUnavailableError("file");
      const row = database
        .prepare("SELECT value FROM app_state WHERE key = 'schema_version'")
        .get() as { value: unknown } | undefined;
      if (row?.value !== String(LATEST_SCHEMA_VERSION))
        throw new PreparedDatabaseUnavailableError("schema");
    } catch (error) {
      if (error instanceof PreparedDatabaseUnavailableError) throw error;
      throw new PreparedDatabaseUnavailableError("connection", { cause: error });
    }
  };
}
