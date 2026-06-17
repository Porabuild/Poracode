import {
  appendUsageEventsSchema,
  profileIdentitySchema,
  profileStatsRequestSchema,
  shareImageRectSchema,
  type AppendUsageEventsPayload,
  type ProfileCoreStats,
  type ProfileDevicesResponse,
  type ProfileIdentity,
  type ProfileIdentityResponse,
  type ProfileStatsRequest,
  type ProfileTokenStats,
  type ShareImageRect,
} from "../../contracts";
import { defineNoArgProcedure, definePayloadProcedure } from "../core";

export const profileProcedures = {
  getProfileCoreStats: definePayloadProcedure<ProfileStatsRequest, ProfileCoreStats, "main-local">(
    "getProfileCoreStats",
    "main-local",
    profileStatsRequestSchema,
  ),
  getProfileDevices: defineNoArgProcedure<ProfileDevicesResponse, "main-local">(
    "getProfileDevices",
    "main-local",
  ),
  getProfileTokenStats: definePayloadProcedure<
    ProfileStatsRequest,
    ProfileTokenStats,
    "main-local"
  >("getProfileTokenStats", "main-local", profileStatsRequestSchema),
  getProfileIdentity: defineNoArgProcedure<ProfileIdentityResponse, "main-local">(
    "getProfileIdentity",
    "main-local",
  ),
  setProfileIdentity: definePayloadProcedure<
    ProfileIdentity,
    ProfileIdentityResponse,
    "main-local"
  >("setProfileIdentity", "main-local", profileIdentitySchema),
  copyShareImage: definePayloadProcedure<ShareImageRect, void, "main-local">(
    "copyShareImage",
    "main-local",
    shareImageRectSchema,
  ),
  appendUsageEvents: definePayloadProcedure<AppendUsageEventsPayload, void, "main-local">(
    "appendUsageEvents",
    "main-local",
    appendUsageEventsSchema,
  ),
} as const;
