import { randomUUID } from "node:crypto";
import { open, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { reportSettingsError } from "../BackendSettingsNotifications";

export interface SettingsPersistenceOptions {
  assertActive(): void;
  /** Runs synchronously immediately after rename: publication now reflects a committed file. */
  committed(): void;
  reportError?(error: unknown): void;
}

/** File sync precedes rename. Directory sync is a post-commit durability step, not rollback. */
export async function persistSettingsDocument(
  path: string,
  contents: string,
  options: SettingsPersistenceOptions,
): Promise<void> {
  options.assertActive();
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let renamed = false;
  try {
    const file = await open(temporary, "wx", 0o600);
    try {
      options.assertActive();
      await file.writeFile(contents, "utf8");
      options.assertActive();
      await file.sync();
    } finally {
      await file.close();
    }
    options.assertActive();
    for (let attempt = 0; ; attempt += 1) {
      options.assertActive();
      try {
        await rename(temporary, path);
        break;
      } catch (error) {
        if (
          attempt >= 5 ||
          !["EPERM", "EACCES", "EBUSY"].includes((error as NodeJS.ErrnoException).code ?? "")
        )
          throw error;
        await delay(10);
      }
    }
    renamed = true;
    options.committed();
    try {
      const directory = await open(dirname(path), "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } catch (error) {
      // Some platforms/filesystems cannot fsync directories. The file is already
      // committed; returning failure here would invite an incorrect second mutation.
      reportSettingsError(error, options.reportError);
    }
  } finally {
    if (!renamed)
      await rm(temporary, { force: true }).catch((error: unknown) =>
        reportSettingsError(error, options.reportError),
      );
  }
}
