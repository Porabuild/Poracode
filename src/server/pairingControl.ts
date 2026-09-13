import {
  callHostControl,
  type HostControlCallOptions,
} from "@/backend/ownership/hostControlClient";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import type { HostDescription } from "@/shared/hostControlProtocol";

export interface PairingControlResponse {
  readonly requestId: string;
  readonly pairingUrl: string;
}

export interface HostStatusResponse {
  readonly requestId: string;
  readonly ownerGeneration: string;
  readonly description: HostDescription;
}

/** The CLI is an authenticated client of the existing owner, never another owner. */
export async function requestPairingFromRunningServer(
  profileNamespace: string,
  options: HostControlCallOptions = {},
): Promise<PairingControlResponse> {
  const reply = await callHostControl(
    resolveHostRootPaths(profileNamespace),
    "issue-pairing",
    options,
  );
  return { requestId: reply.requestId, pairingUrl: reply.result.pairingUrl };
}

/** Read the authenticated owner description without minting a pairing token. */
export async function requestHostStatusFromRunningServer(
  profileNamespace: string,
  options: HostControlCallOptions = {},
): Promise<HostStatusResponse> {
  const reply = await callHostControl(resolveHostRootPaths(profileNamespace), "describe", options);
  return {
    requestId: reply.requestId,
    ownerGeneration: reply.ownerGeneration,
    description: reply.result,
  };
}
