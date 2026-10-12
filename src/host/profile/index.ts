import type {
  ProfileCoreStats,
  ProfileDevicesResponse,
  ProfileIdentity,
  ProfileIdentityResponse,
  ProfileStatsRequest,
  ProfileTokenStats,
} from "@/shared/contracts";
import { computeProfileCoreStats } from "./coreStats";
import {
  getProfileDevice,
  getProfileIdentity,
  listProfileDevices,
  setProfileIdentity as persistProfileIdentity,
} from "./identity";
import { computeProfileTokenStats } from "./tokenStats";

/**
 * Main-process profile facade. Two-tier by design (mirroring how the page
 * renders): {@link getProfileCoreStats} is fast (pure SQLite aggregation) so the
 * page paints instantly, while {@link getProfileTokenStats} derives the heavier
 * token rollups separately so the renderer can keep the same progressive shape.
 */

export function getProfileCoreStats(req: ProfileStatsRequest): ProfileCoreStats {
  return computeProfileCoreStats(req);
}

export function getProfileTokenStats(req: ProfileStatsRequest): ProfileTokenStats {
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
