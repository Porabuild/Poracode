import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { writeFileAtomic } from "@/shared/atomicFile";
import {
  remotePushRegistrationRoutingSchema,
  type RemotePushRegistration,
  type RemotePushRegistrationRouting,
} from "@/shared/remote";

/** First explicit on-disk format. Files without this field are legacy v0. */
export const PUSH_REGISTRATIONS_FILE_FORMAT_VERSION = 1 as const;

/** Reference to a single token on a device, for APNs 410 pruning. */
export type PushTokenRef =
  | { readonly kind: "device" }
  | { readonly kind: "pushToStart" }
  | { readonly kind: "activity"; readonly activityId: string }
  | { readonly kind: "web" };

const legacyStoredPushRegistrationSchema = z.object({
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

const storedPushRegistrationSchema = legacyStoredPushRegistrationSchema.extend({
  routing: remotePushRegistrationRoutingSchema.optional(),
});

/**
 * A single token record stored for a paired device. `activityTokens` is always
 * present (possibly empty) so callers don't branch on undefined; scalar token
 * fields are optional and preserved across partial upserts. Derived from the
 * persistence schema so the optional shape matches what parsing yields.
 */
export type StoredPushRegistration = z.infer<typeof storedPushRegistrationSchema>;

const legacyPushRegistrationsFileSchema = z.object({
  registrations: z.array(legacyStoredPushRegistrationSchema),
});

const pushRegistrationsFileSchema = z.object({
  formatVersion: z.literal(PUSH_REGISTRATIONS_FILE_FORMAT_VERSION),
  registrations: z.array(storedPushRegistrationSchema),
});

function routedStorageKey(clientConnectionId: string): string {
  return `routed:${clientConnectionId.toLowerCase()}`;
}

function legacyStorageKey(deviceId: string): string {
  return `legacy:${deviceId}`;
}

/** Stable internal identity used for timers and per-registration state. */
export function pushRegistrationIdentity(registration: StoredPushRegistration): string {
  return registration.routing
    ? routedStorageKey(registration.routing.clientConnectionId)
    : legacyStorageKey(registration.deviceId);
}

function storageKeyFor(deviceId: string, routing?: RemotePushRegistrationRouting): string {
  return routing ? routedStorageKey(routing.clientConnectionId) : legacyStorageKey(deviceId);
}

function normalizedRouting(
  routing: RemotePushRegistrationRouting | undefined,
): RemotePushRegistrationRouting | undefined {
  return routing
    ? { ...routing, clientConnectionId: routing.clientConnectionId.toLowerCase() }
    : undefined;
}

function compareStorageEntries(
  [left]: readonly [string, StoredPushRegistration],
  [right]: readonly [string, StoredPushRegistration],
): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

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
  /** A newer app owns this file; never overwrite a format we cannot parse. */
  private writesBlockedByFutureVersion = false;

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
    const map = this.loadForMutation();
    const routing = normalizedRouting(registration.routing);
    const key = storageKeyFor(registration.deviceId, routing);
    const stored = map.get(key);
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
      ...(routing ? { routing } : {}),
    };
    // The first routed registration supersedes the old single-host entry for
    // the same install, avoiding duplicate notifications after an upgrade.
    if (routing) map.delete(legacyStorageKey(registration.deviceId));
    map.set(key, next);
    this.persist();
    return next;
  }

  remove(deviceId: string, routing?: RemotePushRegistrationRouting): void {
    const map = this.loadForMutation();
    let removed = false;
    if (routing) {
      const key = storageKeyFor(deviceId, routing);
      const existing = map.get(key);
      removed = existing?.deviceId === deviceId && map.delete(key);
    } else {
      // Legacy unregistration means "this install" and predates per-host
      // identities, so remove every entry that still carries its device id.
      for (const [key, entry] of map) {
        if (entry.deviceId === deviceId) removed = map.delete(key) || removed;
      }
    }
    if (removed) {
      this.persist();
    }
  }

  /** Prunes a single token after APNs reports it unregistered (410). Removes
   * the whole device record if it has no tokens left. */
  removeToken(deviceId: string, ref: PushTokenRef, routing?: RemotePushRegistrationRouting): void {
    const map = this.loadForMutation();
    const key = routing
      ? storageKeyFor(deviceId, routing)
      : map.has(legacyStorageKey(deviceId))
        ? legacyStorageKey(deviceId)
        : [...map].find(([, entry]) => entry.deviceId === deviceId)?.[0];
    if (!key) return;
    const existing = map.get(key);
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
      map.set(key, { ...next, updatedAt: this.now() });
    } else {
      map.delete(key);
    }
    this.persist();
  }

  get(
    deviceId: string,
    routing?: RemotePushRegistrationRouting,
  ): StoredPushRegistration | undefined {
    const map = this.load();
    if (routing) {
      const entry = map.get(storageKeyFor(deviceId, routing));
      return entry?.deviceId === deviceId ? entry : undefined;
    }
    return (
      map.get(legacyStorageKey(deviceId)) ??
      [...map.values()].find((entry) => entry.deviceId === deviceId)
    );
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
        const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
        const formatVersion =
          typeof raw === "object" && raw !== null && "formatVersion" in raw
            ? raw.formatVersion
            : undefined;
        if (
          formatVersion !== undefined &&
          formatVersion !== PUSH_REGISTRATIONS_FILE_FORMAT_VERSION
        ) {
          this.writesBlockedByFutureVersion = true;
        } else {
          const registrations =
            formatVersion === PUSH_REGISTRATIONS_FILE_FORMAT_VERSION
              ? pushRegistrationsFileSchema.parse(raw).registrations
              : legacyPushRegistrationsFileSchema.parse(raw).registrations;
          for (const entry of registrations) {
            map.set(pushRegistrationIdentity(entry), entry);
          }
        }
      } catch {
        // Corrupt / unreadable registration file: start empty rather than crash.
      }
    }
    this.cache = map;
    return map;
  }

  private loadForMutation(): Map<string, StoredPushRegistration> {
    const map = this.load();
    if (this.writesBlockedByFutureVersion) {
      throw new Error("Push registration file uses a newer unsupported format.");
    }
    return map;
  }

  private persist(): void {
    const map = this.cache;
    if (!map) return;
    const registrations = [...map.entries()]
      .sort(compareStorageEntries)
      .map(([, entry]) => storedPushRegistrationSchema.parse(entry));
    writeFileAtomic(
      pushRegistrationsFilePath(this.baseDir),
      `${JSON.stringify(
        { formatVersion: PUSH_REGISTRATIONS_FILE_FORMAT_VERSION, registrations },
        null,
        2,
      )}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  }
}
