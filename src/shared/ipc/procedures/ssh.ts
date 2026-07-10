import {
  sshConnectPayloadSchema,
  sshConnectResultSchema,
  sshDisconnectPayloadSchema,
  sshDiscoveredHostSchema,
  type SshConnectPayload,
  type SshConnectResult,
  type SshDisconnectPayload,
  type SshDiscoveredHost,
} from "../../ssh";
import { defineNoArgProcedure, definePayloadProcedure } from "../core";

export const sshProcedures = {
  sshDiscoverHosts: defineNoArgProcedure<SshDiscoveredHost[], "main-local">(
    "sshDiscoverHosts",
    "main-local",
  ),
  sshConnect: definePayloadProcedure<SshConnectPayload, SshConnectResult, "main-local">(
    "sshConnect",
    "main-local",
    sshConnectPayloadSchema,
  ),
  sshDisconnect: definePayloadProcedure<SshDisconnectPayload, void, "main-local">(
    "sshDisconnect",
    "main-local",
    sshDisconnectPayloadSchema,
  ),
} as const;

export {
  sshConnectPayloadSchema,
  sshConnectResultSchema,
  sshDisconnectPayloadSchema,
  sshDiscoveredHostSchema,
};
