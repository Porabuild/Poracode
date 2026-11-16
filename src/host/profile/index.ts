import type {
  ProfileCoreStats,
  ProfileDevicesResponse,
  ProfileIdentity,
  ProfileIdentityResponse,
  ProfileStatsRequest,
  ProfileTokenStats,
} from "@/shared/contracts";
import { readDatabaseAsync } from "../db/asyncReads";
import { getProfileUsageResetGeneration } from "../db/connection";
import {
  buildCoreRollupSnapshot,
  computeProfileCoreStats,
  getCachedProfileCoreStats,
  hasWarmCoreRollup,
  installCoreRollupSnapshotIfCold,
  type CoreRollupSnapshot,
} from "./coreStats";
import { localDayIndex } from "./heatmap";
import {
  getProfileDevice,
  getProfileIdentity,
  listProfileDevices,
  recordCurrentDevice,
  setProfileIdentity as persistProfileIdentity,
} from "./identity";
import {
  buildTokenRollupSnapshot,
  computeProfileTokenStats,
  getCachedProfileTokenStats,
  hasWarmTokenRollup,
  installTokenRollupSnapshotIfCold,
  type TokenRollupSnapshot,
} from "./tokenStats";

/**
 * Main-process profile facade. Two-tier by design (mirroring how the page
 * renders): {@link getProfileCoreStats} is fast so the page paints quickly,
 * while {@link getProfileTokenStats} derives the heavier token rollups
 * separately. Cold SQLite scans run inside `AsyncDatabaseReads` off the host
 * event loop, and subsequent reads update incrementally via `id > lastRowId`.
 */

const pendingCoreRollupBuilds = new Map<number, Promise<CoreRollupSnapshot>>();
const pendingTokenRollupBuilds = new Map<string, Promise<TokenRollupSnapshot>>();

export async function getProfileCoreStats(req: ProfileStatsRequest): Promise<ProfileCoreStats> {
  const cached = getCachedProfileCoreStats(req);
  if (cached) return cached;
  const offset = req.utcOffsetMinutes;
  const resetGeneration = getProfileUsageResetGeneration();
  const currentDevice = recordCurrentDevice();
  const targetDeviceId =
    req.scope === "all" ? currentDevice.id : (req.deviceId ?? currentDevice.id);
  if (targetDeviceId !== currentDevice.id || hasWarmCoreRollup(offset, resetGeneration)) {
    return computeProfileCoreStats(req);
  }

  let pending = pendingCoreRollupBuilds.get(offset);
  if (!pending) {
    pending = readDatabaseAsync("profileCoreRollup", [offset], () =>
      buildCoreRollupSnapshot(offset),
    ).finally(() => {
      if (pendingCoreRollupBuilds.get(offset) === pending) {
        pendingCoreRollupBuilds.delete(offset);
      }
    });
    pendingCoreRollupBuilds.set(offset, pending);
  }

  const snapshot = await pending;
  installCoreRollupSnapshotIfCold(snapshot, resetGeneration);
  return computeProfileCoreStats(req);
}

export async function getProfileTokenStats(req: ProfileStatsRequest): Promise<ProfileTokenStats> {
  const cached = getCachedProfileTokenStats(req);
  if (cached) return cached;
  const offset = req.utcOffsetMinutes;
  const todayIndex = localDayIndex(Date.now(), offset);
  const resetGeneration = getProfileUsageResetGeneration();
  const currentDevice = recordCurrentDevice();
  const targetDeviceId =
    req.scope === "all" ? currentDevice.id : (req.deviceId ?? currentDevice.id);
  if (
    targetDeviceId !== currentDevice.id ||
    hasWarmTokenRollup(offset, todayIndex, resetGeneration)
  ) {
    return computeProfileTokenStats(req);
  }

  const buildKey = `${offset}\0${todayIndex}`;
  let pending = pendingTokenRollupBuilds.get(buildKey);
  if (!pending) {
    pending = readDatabaseAsync("profileTokenRollup", [offset, todayIndex], () =>
      buildTokenRollupSnapshot(offset, todayIndex),
    ).finally(() => {
      if (pendingTokenRollupBuilds.get(buildKey) === pending) {
        pendingTokenRollupBuilds.delete(buildKey);
      }
    });
    pendingTokenRollupBuilds.set(buildKey, pending);
  }

  const snapshot = await pending;
  installTokenRollupSnapshotIfCold(snapshot, todayIndex, resetGeneration);
  return computeProfileTokenStats(req);
}

export function getProfileDevicesResponse(): ProfileDevicesResponse {
  return { devices: listProfileDevices(), currentDeviceId: getProfileDevice().id };
}

export function getProfileIdentityResponse(): ProfileIdentityResponse {
  return { identity: getProfileIdentity(), device: getProfileDevice() };
}

export function setProfileIdentityResponse(identity: ProfileIdentity): ProfileIdentityResponse {
  return { identity: persistProfileIdentity(identity), device: getProfileDevice() };
}
