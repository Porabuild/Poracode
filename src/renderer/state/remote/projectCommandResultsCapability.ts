import type { RemoteEnvironmentCapabilities } from "@/shared/remote/protocol/core";
import { hostSupportsProjectCommandResults } from "@/shared/remote/protocol";

/**
 * `projectCommandResults` v1 adoption gate (renderer).
 *
 * The bounded result mode is declared per request through the existing
 * `client.projectCommand(command, { commandId, result: "bounded" })` entry and
 * only when the connection's fresh descriptor advertised the capability. An
 * old host ignores the unknown header and answers the complete legacy result,
 * so an undeclared send must stay on the complete path; and a declared send
 * whose 200 body does not honor the declaration is classified by the SDK as a
 * post-effect invalid response (may-have-committed), never as a definite
 * no-effect failure a fresh-id retry could repeat.
 *
 * Process-local and never persisted: a re-pair or reconnect must re-prove the
 * capability from its own descriptor, and removal forgets it.
 */
const capabilityByConnection = new Map<string, boolean>();

export function noteProjectCommandResultsCapability(
  connectionKey: string,
  supported: boolean,
): void {
  capabilityByConnection.set(connectionKey, supported);
}

export function forgetProjectCommandResultsCapability(connectionKey: string): void {
  capabilityByConnection.delete(connectionKey);
}

export function environmentAdvertisesProjectCommandResults(environment: {
  readonly capabilities?: RemoteEnvironmentCapabilities | undefined;
}): boolean {
  return hostSupportsProjectCommandResults(environment.capabilities?.projectCommandResults);
}

export function hostSupportsProjectCommandResultsForConnection(connectionKey: string): boolean {
  return capabilityByConnection.get(connectionKey) === true;
}

/** Test-only. */
export function __resetProjectCommandResultsCapabilityForTest(): void {
  capabilityByConnection.clear();
}
