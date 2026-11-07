import {
  callHostControl,
  HostControlUnsupportedOperationError,
  type HostControlCallOptions,
} from "@/backend/ownership/hostControlClient";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import type { HostControlStatusResult, HostDescription } from "@/shared/hostControlProtocol";

export interface PairingControlResponse {
  readonly requestId: string;
  readonly pairingUrl: string;
}

export interface RequestPairingOptions extends HostControlCallOptions {
  readonly preset?: "operator" | "viewer";
}

export interface HostStatusResponse {
  readonly requestId: string;
  readonly ownerGeneration: string;
  readonly description: HostDescription;
}

export interface HostStatusDetailsResponse extends HostStatusResponse {
  readonly status: HostControlStatusResult;
}

/** The CLI is an authenticated client of the existing owner, never another owner. */
export async function requestPairingFromRunningServer(
  profileNamespace: string,
  options: RequestPairingOptions = {},
): Promise<PairingControlResponse> {
  const { preset, ...callOptions } = options;
  const reply = await callHostControl(resolveHostRootPaths(profileNamespace), "issue-pairing", {
    ...callOptions,
    ...(preset ? { payload: { preset } } : {}),
  });
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

/** Attempt the existing additive status operation only after the same owner
 * answered authenticated describe; unsupported is never treated as absent. */
export async function requestHostStatusDetailsFromRunningServer(
  profileNamespace: string,
): Promise<HostStatusDetailsResponse> {
  const description = await requestHostStatusFromRunningServer(profileNamespace);
  try {
    const reply = await callHostControl(resolveHostRootPaths(profileNamespace), "status", {
      expectedGeneration: description.ownerGeneration,
    });
    if (reply.result.mode !== description.description.mode)
      throw new Error("The owner returned a different mode; detailed status was not confirmed.");
    return { ...description, requestId: reply.requestId, status: reply.result };
  } catch (error) {
    if (error instanceof HostControlUnsupportedOperationError)
      throw new Error(
        "This running owner does not provide detailed status. Use status or doctor with the same --base-dir; update the owner explicitly when ready.",
        { cause: error },
      );
    throw error;
  }
}
