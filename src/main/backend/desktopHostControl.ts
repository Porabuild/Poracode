// Desktop-owner publication of the shared authenticated control surface.
//
// Parity with the headless composition: once the desktop owner reaches ready,
// it runs the existing `HostControlServer` (the lease carries kind "desktop"),
// so a second launch discovers and authenticates this owner instead of falling
// into an unauthenticated lease fight with misleading guidance. The server's
// own dispose implements join-before-remove (connections and admitted work
// join before discovery is removed), and main disposes it in the before-quit
// join list — strictly before the will-quit lease release.
//
// Desktop owners do not mint attach pairings: the remote endpoint that would
// serve an attach client is backend-owned and desktop attach admission is
// refused at the compat gate (see `standaloneAttach.ts`). Advertise only the
// capability that exists.

import { HostControlServer } from "@/backend/ownership/HostControlServer";
import { readHostOwnerRecord, type HostOwnerLease } from "@/backend/ownership/hostOwnerLease";
import type { HostServiceCapabilities } from "@/shared/hostControlProtocol";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote/protocol";

function ownerPhaseToDescriptionState(lease: HostOwnerLease): "starting" | "ready" | "stopping" {
  // The control server only starts at ready, but read the live record so a
  // torn-down owner never advertises readiness through a stale listener.
  const phase = readHostOwnerRecord(lease.paths)?.phase;
  if (phase === "stopped") return "stopping";
  if (phase === "preparing" || phase === "staging-import") return "starting";
  return "ready";
}

export function startDesktopHostControl(input: {
  lease: HostOwnerLease;
  reportError(error: unknown): void;
  /**
   * Host-declared service capabilities from the desktop host-service
   * composition (V5 plan 1.2): the describe publishes what this owner really
   * constructed instead of letting clients infer availability from the mode.
   */
  capabilities: HostServiceCapabilities;
}): HostControlServer | null {
  let server: HostControlServer;
  try {
    server = new HostControlServer({
      lease: input.lease,
      describe: () => ({
        state: ownerPhaseToDescriptionState(input.lease),
        remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
        // No client-facing endpoint yet: a desktop owner is discoverable and
        // describable, and attach admission refuses on the kind gate.
        endpoint: null,
        capabilities: input.capabilities,
      }),
      issuePairing: () =>
        Promise.reject(new Error("The desktop owner does not mint attach pairings.")),
    });
  } catch (error) {
    input.reportError(error);
    return null;
  }
  // Control is additive capability: a listen failure must not fail desktop
  // startup (the lease still excludes a second authority; the fallback is the
  // existing authenticated lease-refusal path).
  void server.start().catch((error: unknown) => {
    input.reportError(error);
  });
  return server;
}
