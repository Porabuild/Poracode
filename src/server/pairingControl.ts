import {
  callHostControl,
  type HostControlCallOptions,
} from "@/backend/ownership/hostControlClient";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";

export interface PairingControlResponse {
  readonly requestId: string;
  readonly pairingUrl: string;
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
