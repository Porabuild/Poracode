import { existsSync } from "node:fs";
import type Database from "better-sqlite3";

const BETTER_SQLITE_NATIVE_BINDING_ENV = "PORACODE_BETTER_SQLITE3_NATIVE_BINDING";

export function resolveBetterSqliteNativeBindingOptions(
  env: NodeJS.ProcessEnv = process.env,
  bindingExists: (path: string) => boolean = existsSync,
): ConstructorParameters<typeof Database>[1] | undefined {
  const explicit = env[BETTER_SQLITE_NATIVE_BINDING_ENV]?.trim();
  if (explicit) {
    if (!bindingExists(explicit)) {
      throw new Error(
        `${BETTER_SQLITE_NATIVE_BINDING_ENV} points to a file that does not exist: ${explicit}. ` +
          "Set it to a compatible better-sqlite3 13 N-API binary, or unset it.",
      );
    }
    return { nativeBinding: explicit };
  }
  // SQLite 13 bundles N-API binaries. Never load a stale pre-13 server-native artifact.
  return undefined;
}
