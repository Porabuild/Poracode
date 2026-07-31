import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { writeFileAtomic } from "@/shared/atomicFile";
import type { RemotePushRegistration } from "@/shared/remote";

/** Reference to a single token on a device, for APNs 410 pruning. */
export type PushTokenRef =
  | { readonly kind: "device" }
  | { readonly kind: "pushToStart" }
  | { readonly kind: "activity"; readonly activityId: string }
  | { readonly kind: "web" };

const storedPushRegistrationSchema = z.object({
  deviceId: z.string().min(1),
  platform: z.enum(["ios", "android", "web"]),
  deviceToken: z.string().min(1).optional(),
  pushToStartToken: z.string().min(1).optional(),
  activityTokens: z.record(z.string().min(1), z.string().min(1)),
  webPushSubscription: z
    .object({
      endpoint: z.string().url(),
      expirationTime: z.number().int().nonnegative().nullable(),
      keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
    })
    .optional(),
  webAppBasePath: z.string().min(1).optional(),
  appVersion: z.string().min(1).optional(),
  updatedAt: z.number().int().nonnegative(),
});

/**
 * A single token record stored for a paired device. `activityTokens` is always
 * present (possibly empty) so callers don't branch on undefined; scalar token
 * fields are optional and preserved across partial upserts. Derived from the
 * persistence schema so the optional shape matches what parsing yields.
 */
export type StoredPushRegistration = z.infer<typeof storedPushRegistrationSchema>;

const pushRegistrationsFileSchema = z.object({
  registrations: z.array(storedPushRegistrationSchema),
});

export function pushRegistrationsFilePath(baseDir: string): string {
  return join(baseDir, "push-registrations.json");
}

/**
 * Persists per-device APNs push registrations to a JSON file in the same base
 * dir the remote auth store uses. Registrations are cached in memory (lazy
 * load) and written atomically (temp + rename) on every mutation, mirroring
 * `RemoteAuthStore`'s persistence style.
 */
export class PushRegistrationStore {
  private cache: Map<string, StoredPushRegistration> | null = null;

  constructor(
    private readonly baseDir: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Partial-upsert per {@link RemotePushRegistration} semantics: any token
   * field present replaces the stored value; absent fields are preserved.
   * `activityTokens` merges per-activity so re-registering one rotated token
   * does not drop the others.
   */
  upsert(registration: RemotePushRegistration): StoredPushRegistration {
    const map = this.load();
    const stored = map.get(registration.deviceId);
    // A browser/native install should normally have a distinct device id, but
    // if storage migration ever reuses one, never carry platform-specific
    // credentials across that boundary.
    const existing = stored?.platform === registration.platform ? stored : undefined;
    const activityTokens: Record<string, string> = { ...(existing?.activityTokens ?? {}) };
    if (registration.activityTokens) {
      for (const [activityId, token] of Object.entries(registration.activityTokens)) {
        activityTokens[activityId] = token;
      }
    }
    const deviceToken = registration.deviceToken ?? existing?.deviceToken;
    const pushToStartToken = registration.pushToStartToken ?? existing?.pushToStartToken;
    const appVersion = registration.appVersion ?? existing?.appVersion;
    const webPushSubscription = registration.webPushSubscription ?? existing?.webPushSubscription;
    const webAppBasePath = registration.webAppBasePath ?? existing?.webAppBasePath;
    const next: StoredPushRegistration = {
      deviceId: registration.deviceId,
      platform: registration.platform,
      activityTokens,
      updatedAt: this.now(),
      ...(deviceToken ? { deviceToken } : {}),
      ...(pushToStartToken ? { pushToStartToken } : {}),
      ...(webPushSubscription ? { webPushSubscription } : {}),
      ...(webAppBasePath ? { webAppBasePath } : {}),
      ...(appVersion ? { appVersion } : {}),
    };
    map.set(next.deviceId, next);
    this.persist();
    return next;
  }

  remove(deviceId: string): void {
    const map = this.load();
    if (map.delete(deviceId)) {
      this.persist();
    }
  }

  /** Prunes a single token after APNs reports it unregistered (410). Removes
   * the whole device record if it has no tokens left. */
  removeToken(deviceId: string, ref: PushTokenRef): void {
    const map = this.load();
    const existing = map.get(deviceId);
    if (!existing) return;
    let next: StoredPushRegistration;
    if (ref.kind === "device") {
      const { deviceToken: _removed, ...rest } = existing;
      next = rest;
    } else if (ref.kind === "pushToStart") {
      const { pushToStartToken: _removed, ...rest } = existing;
      next = rest;
    } else if (ref.kind === "activity") {
      if (!(ref.activityId in existing.activityTokens)) return;
      const activityTokens = { ...existing.activityTokens };
      delete activityTokens[ref.activityId];
      next = { ...existing, activityTokens };
    } else {
      const { webPushSubscription: _removed, webAppBasePath: _path, ...rest } = existing;
      next = rest;
    }
    const hasAnyToken =
      next.deviceToken !== undefined ||
      next.pushToStartToken !== undefined ||
      next.webPushSubscription !== undefined ||
      Object.keys(next.activityTokens).length > 0;
    if (hasAnyToken) {
      map.set(deviceId, { ...next, updatedAt: this.now() });
    } else {
      map.delete(deviceId);
    }
    this.persist();
  }

  get(deviceId: string): StoredPushRegistration | undefined {
    return this.load().get(deviceId);
  }

  list(): StoredPushRegistration[] {
    return [...this.load().values()];
  }

  private load(): Map<string, StoredPushRegistration> {
    if (this.cache) return this.cache;
    const map = new Map<string, StoredPushRegistration>();
    const path = pushRegistrationsFilePath(this.baseDir);
    if (existsSync(path)) {
      try {
        const parsed = pushRegistrationsFileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
        for (const entry of parsed.registrations) {
          map.set(entry.deviceId, entry);
        }
      } catch {
        // Corrupt / unreadable registration file: start empty rather than crash.
      }
    }
    this.cache = map;
    return map;
  }

  private persist(): void {
    const map = this.cache;
    if (!map) return;
    const registrations = [...map.values()].map((entry) =>
      storedPushRegistrationSchema.parse(entry),
    );
    writeFileAtomic(
      pushRegistrationsFilePath(this.baseDir),
      `${JSON.stringify({ registrations }, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  }
}
