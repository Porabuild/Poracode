import { existsSync, readFileSync, watch, type FSWatcher } from "node:fs";
import { dirname } from "node:path";
import { defaultSharedSettings, normalizeSharedSettings } from "@/shared/settings";
import { decryptSecret, transformSensitiveAgentSecrets } from "../secretStorage";

export function readSupervisorSharedSettings(settingsPath: string) {
  if (!existsSync(settingsPath)) return { ...defaultSharedSettings };
  try {
    return transformSensitiveAgentSecrets(
      normalizeSharedSettings(JSON.parse(readFileSync(settingsPath, "utf8"))),
      dirname(settingsPath),
      decryptSecret,
    );
  } catch {
    return { ...defaultSharedSettings };
  }
}

export class SupervisorSharedSettingsCache {
  private cached: ReturnType<typeof readSupervisorSharedSettings> | undefined;
  private watcher: FSWatcher | undefined;

  constructor(private readonly settingsPath: string) {}

  read(): ReturnType<typeof readSupervisorSharedSettings> {
    this.cached ??= readSupervisorSharedSettings(this.settingsPath);
    this.ensureWatcher();
    return this.cached;
  }

  readFresh(): ReturnType<typeof readSupervisorSharedSettings> {
    this.cached = readSupervisorSharedSettings(this.settingsPath);
    this.ensureWatcher();
    return this.cached;
  }

  invalidate(): void {
    this.cached = undefined;
  }

  dispose(): void {
    this.watcher?.close();
    this.watcher = undefined;
    this.cached = undefined;
  }

  private ensureWatcher(): void {
    if (this.watcher) return;
    try {
      this.watcher = watch(this.settingsPath, () => {
        this.cached = undefined;
      });
      this.watcher.on("error", () => {
        this.watcher?.close();
        this.watcher = undefined;
        this.cached = undefined;
      });
    } catch {
      // Settings may not exist on first boot; the next read will retry.
    }
  }
}
