import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertIpcProcedureMapVersion,
  IPC_PROCEDURE_MAP_VERSION,
  ipcProcedureMap,
  ipcProcedureMapFingerprint,
  IpcProcedureMapVersionError,
  type IpcProcedureName,
} from "./procedureMap";

/**
 * Compat pin for the procedure map (V5 plan 2.6): `<version>:<sha256>`. ANY
 * change to the map's wire-visible shape (procedure added/removed, transport
 * changed) alters the hash and fails this suite, forcing the compat review
 * recorded on `IPC_PROCEDURE_MAP_VERSION`. The version itself only bumps for
 * changes an already-published peer cannot accept; additive names that every
 * peer loud-rejects by name may keep the version after that review.
 */
// V5 plan 2.5 completion: `getManagedLoopbackBootstrap` added (additive
// main-local name — every peer loud-rejects unknown names, so the version
// stays 1; the fingerprint moves to force exactly this review).
const V1_PIN = `${IPC_PROCEDURE_MAP_VERSION}:16de326b2bc7cbc1fbb5039b80e5106c5fc4ba434e69d5971b89368a903f5c76`;

describe("IPC procedure map versioning", () => {
  it("keeps the procedure-map fingerprint pinned so any map change forces a compat review", () => {
    const sha256 = createHash("sha256").update(ipcProcedureMapFingerprint()).digest("hex");
    expect(`${IPC_PROCEDURE_MAP_VERSION}:${sha256}`).toBe(V1_PIN);
  });

  it("fingerprints are deterministic, order-independent, and cover every procedure", () => {
    const fingerprint = ipcProcedureMapFingerprint();
    expect(fingerprint).toBe(ipcProcedureMapFingerprint());
    const lines = fingerprint.split("\n");
    expect(lines).toEqual([...lines].sort());
    expect(lines).toHaveLength(Object.keys(ipcProcedureMap).length);
    for (const line of lines) {
      const separator = line.lastIndexOf(":");
      const name = line.slice(0, separator) as IpcProcedureName;
      const transport = line.slice(separator + 1);
      expect(ipcProcedureMap[name].transport).toBe(transport);
    }
  });

  it("accepts the current version", () => {
    expect(() => assertIpcProcedureMapVersion(IPC_PROCEDURE_MAP_VERSION)).not.toThrow();
  });

  it("rejects a legacy peer that cannot declare a version, typed", () => {
    // Old-reader test: a peer built before the map carried a version declares
    // nothing (undefined on the wire). It must be refused typed — never
    // accepted with guessed semantics and never dropped silently.
    const caught = (() => {
      try {
        assertIpcProcedureMapVersion(undefined);
      } catch (error) {
        return error;
      }
      return undefined;
    })();
    expect(caught).toBeInstanceOf(IpcProcedureMapVersionError);
    const mismatch = caught as IpcProcedureMapVersionError;
    expect(mismatch).toBeInstanceOf(Error);
    expect(mismatch.name).toBe("IpcProcedureMapVersionError");
    expect(mismatch.peerVersion).toBe(0);
    expect(mismatch.localVersion).toBe(IPC_PROCEDURE_MAP_VERSION);
    expect(mismatch.message).toContain("peer 0");
  });

  it("rejects older and newer peers typed", () => {
    expect(() => assertIpcProcedureMapVersion(IPC_PROCEDURE_MAP_VERSION - 1)).toThrow(
      IpcProcedureMapVersionError,
    );
    expect(() => assertIpcProcedureMapVersion(IPC_PROCEDURE_MAP_VERSION + 1)).toThrow(
      IpcProcedureMapVersionError,
    );
    expect(() => assertIpcProcedureMapVersion(999)).toThrow(IpcProcedureMapVersionError);
  });

  it("rejects malformed declarations typed", () => {
    for (const malformed of [null, "1", -1, 1.5, Number.NaN, {}]) {
      expect(() => assertIpcProcedureMapVersion(malformed)).toThrow(IpcProcedureMapVersionError);
    }
  });
});
