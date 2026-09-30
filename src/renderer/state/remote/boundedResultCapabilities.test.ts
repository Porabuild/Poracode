import { beforeEach, describe, expect, it } from "vitest";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import {
  configureBoundedCatalogController,
  noteBoundedCatalogLegacy,
  __resetBoundedCatalogForTest,
  type BoundedCatalogDeps,
} from "@/renderer/state/remoteServers/catalog/boundedCatalogController";
import {
  clearManagedLoopbackBoundedCatalogChangesAdoption,
  declaresBoundedCatalogChangesForConnection,
  environmentAdvertisesBoundedCatalogChanges,
  forgetBoundedCatalogChangesCapability,
  hostSupportsBoundedCatalogChangesForConnection,
  managedLoopbackBoundedCatalogChangesAdopted,
  noteBoundedCatalogChangesCapability,
  noteManagedLoopbackBoundedCatalogChangesVerdict,
  withBoundedCatalogChangesDeclaration,
  __resetBoundedCatalogChangesCapabilityForTest,
} from "./boundedCatalogChangesCapability";
import {
  environmentAdvertisesProjectCommandResults,
  forgetProjectCommandResultsCapability,
  hostSupportsProjectCommandResultsForConnection,
  noteProjectCommandResultsCapability,
  __resetProjectCommandResultsCapabilityForTest,
} from "./projectCommandResultsCapability";

/**
 * Per-connection capability gates: exact descriptor verdicts, the managed
 * endpoint adoption, declaration URL building, and the consumer/legacy gates
 * that keep an unsupported declaration off the wire.
 */

const KEY = "connection-1";

function environmentWith(capabilities: Record<string, unknown>): {
  readonly capabilities: Record<string, unknown>;
} {
  return { capabilities };
}

function configureController(): void {
  const deps: BoundedCatalogDeps = {
    connectionIdentity: () => ({
      generation: 1,
      identity: "host.test",
      client: {} as RemoteDesktopClient,
    }),
    runtimeThreads: () => undefined,
    runtimeProjects: () => undefined,
    runtimeStatus: () => undefined,
    commitThreadRows: () => {},
    commitProjectRows: () => {},
    removeThreadRows: () => {},
    removeProjectRows: () => {},
    withClient: async (_key, invoke) => invoke({} as RemoteDesktopClient),
    reportProtocolError: () => {},
    appliedThreadSeq: () => undefined,
    connectionSeq: () => 0,
    bumpConnectionSeq: () => {},
    protectedThreadIds: () => new Set(),
    isForeground: () => true,
  };
  configureBoundedCatalogController({ id: "capability-test", ownsConnection: () => true }, deps);
}

describe("bounded catalog-change + project-result capability gates", () => {
  beforeEach(() => {
    __resetBoundedCatalogChangesCapabilityForTest();
    __resetProjectCommandResultsCapabilityForTest();
    __resetBoundedCatalogForTest();
  });

  it("reads the exact advertised versions only", () => {
    expect(
      environmentAdvertisesBoundedCatalogChanges(
        environmentWith({ boundedCatalogChanges: { versions: [1] } }),
      ),
    ).toBe(true);
    expect(environmentAdvertisesBoundedCatalogChanges(environmentWith({}))).toBe(false);
    expect(
      environmentAdvertisesBoundedCatalogChanges(
        environmentWith({ boundedCatalogChanges: { versions: [2] } }),
      ),
    ).toBe(false);
    expect(
      environmentAdvertisesProjectCommandResults(
        environmentWith({ projectCommandResults: { versions: [1] } }),
      ),
    ).toBe(true);
    expect(environmentAdvertisesProjectCommandResults(environmentWith({}))).toBe(false);
  });

  it("builds the declaration URL only when supported, exactly and idempotently", () => {
    const base = "wss://host.test/ws?ticket=t";
    const declared = withBoundedCatalogChangesDeclaration(base, true);
    expect(new URL(declared).searchParams.get("catalogChanges")).toBe("bounded-v1");
    expect(withBoundedCatalogChangesDeclaration(declared, true)).toBe(declared);
    expect(withBoundedCatalogChangesDeclaration(base, false)).toBe(base);
  });

  it("gates the declaration on the consumer being installed and the connection not being legacy", () => {
    noteBoundedCatalogChangesCapability(KEY, true);
    // Consumer not installed yet: even a recorded capability cannot declare.
    expect(declaresBoundedCatalogChangesForConnection(KEY)).toBe(false);
    configureController();
    expect(declaresBoundedCatalogChangesForConnection(KEY)).toBe(true);
    // The exact fact is also queryable without the readiness gate.
    expect(hostSupportsBoundedCatalogChangesForConnection(KEY)).toBe(true);
    noteBoundedCatalogLegacy(KEY);
    expect(declaresBoundedCatalogChangesForConnection(KEY)).toBe(false);
  });

  it("forgets a connection's capability on re-pair/removal", () => {
    configureController();
    noteBoundedCatalogChangesCapability(KEY, true);
    noteProjectCommandResultsCapability(KEY, true);
    forgetBoundedCatalogChangesCapability(KEY);
    forgetProjectCommandResultsCapability(KEY);
    expect(declaresBoundedCatalogChangesForConnection(KEY)).toBe(false);
    expect(hostSupportsProjectCommandResultsForConnection(KEY)).toBe(false);
  });

  it("adopts the managed endpoint's verdict and clears it on a downgrade", () => {
    const endpoint = "http://127.0.0.1:49152";
    expect(managedLoopbackBoundedCatalogChangesAdopted(`${endpoint}/`)).toBe(false);
    expect(noteManagedLoopbackBoundedCatalogChangesVerdict(endpoint, true)).toBe(true);
    // Trailing-slash variants are the same endpoint.
    expect(managedLoopbackBoundedCatalogChangesAdopted(`${endpoint}/`)).toBe(true);
    expect(noteManagedLoopbackBoundedCatalogChangesVerdict(`${endpoint}/`, true)).toBe(false);
    expect(noteManagedLoopbackBoundedCatalogChangesVerdict(endpoint, false)).toBe(true);
    expect(managedLoopbackBoundedCatalogChangesAdopted(endpoint)).toBe(false);
    // A different endpoint never inherits the adoption.
    expect(noteManagedLoopbackBoundedCatalogChangesVerdict(endpoint, true)).toBe(true);
    expect(managedLoopbackBoundedCatalogChangesAdopted("http://127.0.0.1:50000")).toBe(false);
    // Deactivation ends the adoption: a successor activation on the SAME
    // endpoint must prove the capability again from its own preflight.
    clearManagedLoopbackBoundedCatalogChangesAdoption();
    expect(managedLoopbackBoundedCatalogChangesAdopted(endpoint)).toBe(false);
  });
});
