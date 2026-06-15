import { randomUUID } from "node:crypto";
import { homedir, hostname, userInfo } from "node:os";
import { basename } from "node:path";
import type { ProfileDevice, ProfileIdentity } from "@/shared/contracts";
import { profileIdentitySchema } from "@/shared/contracts";
import { bumpProfileDataGeneration, dbGetState, dbSetState } from "../db";
import { titleCase } from "./labels";

/**
 * Profile identity + device attribution, persisted in the app_state table.
 *
 * Both are intentionally device-local: today the identity is a cosmetic override
 * and the device id tags this install's stats. When Lightcode Cloud lands, the
 * device id is what lets the server merge per-device contributions into the
 * "all devices" view while keeping each device individually inspectable.
 */

const DEVICE_ID_KEY = "profile.deviceId";
const DEVICES_KEY = "profile.devices";
const IDENTITY_KEY = "profile.identity";

interface StoredDevice {
  id: string;
  label: string;
  platform: string;
  firstSeenAt: number;
  lastActiveAt: number;
}

/** Deterministic accent palette so a default avatar color is stable per name. */
const AVATAR_PALETTE = [
  "oklch(0.62 0.11 245)", // blue (accent)
  "oklch(0.6 0.14 295)", // violet
  "oklch(0.58 0.15 25)", // red
  "oklch(0.6 0.13 150)", // green
  "oklch(0.66 0.13 78)", // amber
  "oklch(0.6 0.12 200)", // teal
];

function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pickAvatarColor(seed: string): string {
  return AVATAR_PALETTE[hashString(seed) % AVATAR_PALETTE.length]!;
}

function slugifyHandle(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
  return slug || "you";
}

function defaultDisplayName(): string {
  try {
    const username = userInfo().username?.trim();
    if (username) return titleCase(username);
  } catch {
    // userInfo can throw on locked-down systems; fall through.
  }
  const home = basename(homedir()).trim();
  return home ? titleCase(home) : "You";
}

function defaultIdentity(): ProfileIdentity {
  const name = defaultDisplayName();
  return {
    name,
    handle: slugifyHandle(name),
    avatarColor: pickAvatarColor(name),
    plan: "Local",
  };
}

export function getProfileDevice(): ProfileDevice {
  let id = dbGetState(DEVICE_ID_KEY);
  if (!id) {
    id = randomUUID();
    dbSetState(DEVICE_ID_KEY, id);
  }
  let label = "This device";
  try {
    label = hostname() || label;
  } catch {
    // hostname can throw in sandboxes; keep the fallback.
  }
  return { id, label, platform: process.platform };
}

function readDeviceRegistry(): Record<string, StoredDevice> {
  const raw = dbGetState(DEVICES_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, StoredDevice>) : {};
  } catch {
    return {};
  }
}

/**
 * Upsert the current device into the registry with a fresh `lastActiveAt`.
 * Called whenever stats are produced so "last active" stays current. The
 * registry is the local seed of what Cloud will later populate with the user's
 * other devices.
 */
export function recordCurrentDevice(): ProfileDevice {
  const device = getProfileDevice();
  const registry = readDeviceRegistry();
  const now = Date.now();
  const existing = registry[device.id];
  registry[device.id] = {
    id: device.id,
    label: device.label,
    platform: device.platform,
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastActiveAt: now,
  };
  dbSetState(DEVICES_KEY, JSON.stringify(registry));
  return { ...device, isCurrent: true, lastActiveAt: now };
}

/** All known devices, current first then most-recently-active. */
export function listProfileDevices(): ProfileDevice[] {
  const currentId = getProfileDevice().id;
  const registry = readDeviceRegistry();
  if (!registry[currentId]) recordCurrentDevice();
  const devices = Object.values(readDeviceRegistry()).map((d) => ({
    id: d.id,
    label: d.label,
    platform: d.platform,
    isCurrent: d.id === currentId,
    lastActiveAt: d.lastActiveAt,
  }));
  devices.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0);
  });
  return devices;
}

/** Look up a device by id from the registry (falls back to the current device). */
export function resolveProfileDevice(deviceId: string | undefined): ProfileDevice {
  const devices = listProfileDevices();
  if (deviceId) {
    const match = devices.find((d) => d.id === deviceId);
    if (match) return match;
  }
  return devices.find((d) => d.isCurrent) ?? getProfileDevice();
}

export function getProfileIdentity(): ProfileIdentity {
  const raw = dbGetState(IDENTITY_KEY);
  if (raw) {
    try {
      const parsed = profileIdentitySchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      // corrupt value - fall back to defaults.
    }
  }
  return defaultIdentity();
}

export function setProfileIdentity(identity: ProfileIdentity): ProfileIdentity {
  const normalized: ProfileIdentity = {
    name: identity.name.trim() || defaultDisplayName(),
    handle: slugifyHandle(identity.handle || identity.name),
    avatarColor: identity.avatarColor.trim() || pickAvatarColor(identity.name),
    ...(identity.plan ? { plan: identity.plan } : { plan: "Local" }),
  };
  dbSetState(IDENTITY_KEY, JSON.stringify(normalized));
  // Identity is embedded in cached core stats - invalidate it.
  bumpProfileDataGeneration();
  return normalized;
}
