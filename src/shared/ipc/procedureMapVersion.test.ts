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
import { PREVIOUS_IPC_PROCEDURE_MAP_VERSION } from "../clientHostHop";
import { isRemoteProcedure } from "../remote/procedures";

/**
 * Compat pin for the procedure map (V5 plan 2.6): `<version>:<sha256>`. ANY
 * change to the map's wire-visible shape (procedure added/removed, transport
 * changed) alters the hash and fails this suite, forcing the compat review
 * recorded on `IPC_PROCEDURE_MAP_VERSION`. The version itself only bumps for
 * changes an already-published peer cannot accept; additive names that every
 * peer loud-rejects by name may keep the version after that review.
 */
// V6 A.1: `probeTlsCertificateFingerprint` added (additive main-local name —
// every peer loud-rejects unknown names, so the version stays 1; the
// fingerprint moves to force exactly this review). Optional viewer preset on
// `refreshRemoteAccessPairing` is payload-only and does not change the map.
// V2 A2: `setRendererEventInterests` removed with the backend relay; the
// renderer's loopback WS reads its own registry, so the IPC sync is gone and
// the hop moved to 15 (a version-14 peer still speaks the removed procedure).
// Resource admission PHASE1: additive internal supervisor procedure
// `getResourceAdmissionStatus` (not in the remote allowlist and not part of
// any renderer call path). Every peer loud-rejects unknown names, so the map
// version stays 15; the fingerprint moved to force this review.
// V2 host correction: additive internal supervisor procedure
// `closeThreadConfirmed` (confirmed-retirement close used by host housekeeping;
// an older supervisor loud-rejects the name and the caller keeps the row). No
// existing name, payload, or transport changed, so the map version stays 15.
// V2 experiment writer retirement: `dbPersistExperimentState` removed — the
// renderer experiment store is a memory-only projection and the host
// experiment authority (capabilities.experiments v1) owns persistence. The
// renderer had no live caller left. A published hop-15 peer still dispatches
// the removed main-local name, so the hop moved 15→16 and the fingerprint
// moved with the removal (see `clientHostHop.test.ts` hop-15 regression).
// Optional session actions: two additive supervisor names. Enumeration is the
// capability query; callers invoke only listed ids and hide controls when an
// older peer rejects the query by name. Existing names/payloads are unchanged,
// so hop 16 remains compatible and the reviewed fingerprint moves.
// Selection-binding integration (remote13/hop17): the hop moved 16→17 for the
// checked invocation envelope (renderer-supplied version, asserted by main
// before dispatch). No procedure was added, removed, or re-transported, so the
// wire-visible fingerprint is unchanged — the version prefix moves to force
// exactly this review.
// Supervisor settings owner: additive internal supervisor procedure
// `confirmSupervisorSettingsEdits` (the backend settings authority's answer to
// a supervisor `settings-edits-requested` event; not in the remote allowlist,
// no renderer call path). Every peer loud-rejects unknown names and no
// existing name, payload, or transport changed, so hop 17 stays.
// Master integration: additive session-import supervisor names use the existing
// checked envelope. Older peers loud-reject unknown names; no existing name,
// transport or payload changed. Local filesystem import stays outside the remote
// allowlist, so hop 17 remains compatible after this explicit map review.
// Agent discovery cancellation: additive local supervisor name; older peers
// reject unknown names explicitly. Existing payloads, remote allowlist and
// persisted status shapes are unchanged, so hop 17 remains compatible.
// Schedule automation (remote14/hop18): run statuses and schedule payloads now
// include automation policies and typed results. Old readers have closed enums,
// so every client/host leg refuses the previous generation before dispatch.
// Evaluation helpers are additive host-only names; they never enter the remote
// procedure allowlist.
// Browser management adds only main-local procedure names and optional tab
// metadata. Existing payloads and transports remain valid; old peers reject
// unknown names before side effects, so hop 18 stays compatible. Browser import
// and decrypted passwords are intentionally absent from the remote allowlist.
// Guarded PR merges add a host-only name. Older supervisors reject that name;
// the remote allowlist and existing merge payload stay unchanged, so hop 18 stays compatible.
// Network access adds a main-local name. Existing names and payloads stay valid;
// older peers reject the new name before dispatch, so the hop version stays 18.
// Model-provider management adds one supervisor name, outside the remote
// allowlist. Existing peers reject unknown names before effects; hop 18 stays.
// Plugin catalogs/accounts add local supervisor names only. Older peers reject
// them before effects; existing payloads and the remote allowlist stay unchanged.
// Scoped authentication adds one supervisor-only name with a closed version-1
// start/cancel payload. Legacy authenticateAcpAgent is unchanged; old peers
// reject the new name before spawning. Remote allowlists and hop 18 stay valid.
// Controlled integration OAuth is another supervisor-only, closed version-1
// name. Legacy MCP/plugin payloads stay unchanged; old peers reject the new name
// before discovery. It is absent from the remote allowlist; hop 18 stays valid.
// Controlled thread execution is additive and supervisor-local. Its closed v1
// prepare/start/cancel envelope carries an opaque reservation id; old supervisors
// reject the distinct name before reservation or spawn. Existing thread payloads
// and remote allowlists are unchanged, so hop 18 remains compatible.
// Selected native status probing is a distinct supervisor-local v1 read. It
// neither triggers baseline discovery/auto-install nor alters cache versions.
// Older peers reject the new name; existing payloads/remote allowlists and hop 18 stay valid.
// Nonce-addressable reservations add a supervisor-only closed v1 name. Legacy
// execution control v1 and public allowlists stay unchanged; older peers reject
// the new name before reservation or spawn, so hop 18 remains compatible.
// Controlled request replies add only a supervisor-local name. Unknown names
// loud-refuse before launch; old control/reservation schemas and hop18 stay valid.
const HOP_PIN = `${IPC_PROCEDURE_MAP_VERSION}:9120922d8159c29cf28bc19f26fc9369fe7d22afd391b36c27a5c7789a80fa3e`;

describe("IPC procedure map versioning", () => {
  it("keeps nonce reservations local, closed and distinct from legacy execution control", () => {
    const procedure = ipcProcedureMap.reserveThreadExecution;
    expect(procedure.transport).toBe("supervisor");
    expect(isRemoteProcedure("reserveThreadExecution")).toBe(false);
    const payload = {
      version: 1,
      action: "prepare",
      operationId: "d41082c9-a0ae-49cd-a9e4-8ee7bce11f3d",
      threadId: "thread",
    };
    expect(procedure.payloadSchema.parse(payload)).toEqual(payload);
    expect(ipcProcedureMap.controlThreadExecution.payloadSchema.safeParse(payload).success).toBe(
      false,
    );
    for (const change of [
      { version: 2 },
      { signal: {} },
      { operationId: "invalid" },
      { action: "start" },
      { agentKind: "foreign" },
    ])
      expect(procedure.payloadSchema.safeParse({ ...payload, ...change }).success).toBe(false);
  });
  it("keeps native selected probes local and refuses future, WSL or widened inputs", () => {
    const procedure = ipcProcedureMap.probeSelectedAgent;
    expect(procedure.transport).toBe("supervisor");
    expect(isRemoteProcedure("probeSelectedAgent")).toBe(false);
    expect(procedure.payloadSchema.parse({ version: 1, agentKind: "selected" })).toEqual({
      version: 1,
      agentKind: "selected",
    });
    for (const input of [
      { version: 2 },
      { wslDistro: "Other" },
      { scope: { agentKinds: ["foreign"] } },
      { credentialKey: "foreign" },
    ])
      expect(
        procedure.payloadSchema.safeParse({ version: 1, agentKind: "selected", ...input }).success,
      ).toBe(false);
  });
  it("keeps controlled execution local and refuses future or widened envelopes", () => {
    const requests = ipcProcedureMap.controlledThreadRequest;
    expect(requests.transport).toBe("supervisor");
    expect(isRemoteProcedure("controlledThreadRequest")).toBe(false);
    const qualify = {
      version: 2,
      action: "qualify",
      operationId: "d41082c9-a0ae-49cd-a9e4-8ee7bce11f3d",
      threadId: "thread",
    };
    expect(requests.payloadSchema.safeParse(qualify).success).toBe(true);
    for (const extra of [
      { version: 1 },
      { version: 3 },
      { signal: {} },
      { response: {} },
      { credentialKey: "foreign" },
    ])
      expect(requests.payloadSchema.safeParse({ ...qualify, ...extra }).success).toBe(false);
    const answer = { ...qualify, action: "respond", requestId: "ask", response: {} };
    expect(requests.payloadSchema.safeParse(answer).success).toBe(false);
    expect(
      requests.payloadSchema.safeParse({
        ...answer,
        requestToken: "a17686b0-0441-4df4-b40b-fbd58bbce2d5",
      }).success,
    ).toBe(true);
    const procedure = ipcProcedureMap.controlThreadExecution;
    expect(procedure.transport).toBe("supervisor");
    expect(isRemoteProcedure("controlThreadExecution")).toBe(false);
    const prepare = { version: 1, action: "prepare", threadId: "thread" };
    expect(procedure.payloadSchema.safeParse(prepare).success).toBe(true);
    for (const input of [
      { ...prepare, version: 2 },
      { ...prepare, operationId: "d41082c9-a0ae-49cd-a9e4-8ee7bce11f3d" },
      { ...prepare, signal: {} },
      { ...prepare, action: "replace" },
    ])
      expect(procedure.payloadSchema.safeParse(input).success).toBe(false);
    expect(
      procedure.payloadSchema.safeParse({ version: 1, action: "cancel", operationId: "not-a-uuid" })
        .success,
    ).toBe(false);
    expect(
      procedure.payloadSchema.safeParse({
        version: 1,
        action: "cancel",
        operationId: "d41082c9-a0ae-49cd-a9e4-8ee7bce11f3d",
        threadId: "foreign",
      }).success,
    ).toBe(false);
  });
  it("keeps integration OAuth control local and refuses unknown versions or credential selectors", () => {
    expect(isRemoteProcedure("controlMcpAuthentication")).toBe(false);
    const procedure = ipcProcedureMap.controlMcpAuthentication;
    expect(procedure.transport).toBe("supervisor");
    const start = {
      version: 1,
      action: "start",
      operationId: "d41082c9-a0ae-49cd-a9e4-8ee7bce11f3d",
      target: {
        scope: "plugin-service",
        pluginName: "fixture",
        serverName: "tools",
        label: "Work",
      },
    };
    expect(procedure.payloadSchema.safeParse(start).success).toBe(true);
    expect(procedure.payloadSchema.safeParse({ ...start, version: 2 }).success).toBe(false);
    expect(procedure.payloadSchema.safeParse({ ...start, signal: {} }).success).toBe(false);
    expect(
      procedure.payloadSchema.safeParse({
        ...start,
        target: { ...start.target, credentialKey: "private" },
      }).success,
    ).toBe(false);
    expect(
      procedure.payloadSchema.safeParse({
        version: 1,
        action: "cancel",
        operationId: start.operationId,
        target: start.target,
      }).success,
    ).toBe(false);
  });
  it("keeps scoped authentication local and refuses future/extended control envelopes", () => {
    expect(isRemoteProcedure("controlAcpAuthentication")).toBe(false);
    const procedure = ipcProcedureMap.controlAcpAuthentication;
    expect(procedure.transport).toBe("supervisor");
    const start = {
      version: 1,
      action: "start",
      operationId: "d41082c9-a0ae-49cd-a9e4-8ee7bce11f3d",
      agentKind: "fixture",
      methodId: "approval",
    };
    expect(procedure.payloadSchema.safeParse(start).success).toBe(true);
    expect(procedure.payloadSchema.safeParse({ ...start, version: 2 }).success).toBe(false);
    expect(procedure.payloadSchema.safeParse({ ...start, signal: {} }).success).toBe(false);
    expect(
      procedure.payloadSchema.safeParse({
        version: 1,
        action: "cancel",
        operationId: start.operationId,
        agentKind: "other",
      }).success,
    ).toBe(false);
    expect(
      ipcProcedureMap.authenticateAcpAgent.payloadSchema.safeParse({
        agentKind: "fixture",
        methodId: "approval",
      }).success,
    ).toBe(true);
  });
  it("keeps write-only model provider management outside the remote allowlist", () => {
    expect(isRemoteProcedure("manageModelProviders")).toBe(false);
    expect(ipcProcedureMap.manageModelProviders.transport).toBe("supervisor");
  });

  it("keeps plugin package and account custody local to the supervisor", () => {
    for (const name of ["pluginCatalog", "pluginAccounts"] as const) {
      expect(ipcProcedureMap[name].transport).toBe("supervisor");
      expect(isRemoteProcedure(name)).toBe(false);
    }
  });

  it("keeps guarded merges internal and requires their expected head", () => {
    expect(isRemoteProcedure("ghMergePrAtHead")).toBe(false);
    expect(ipcProcedureMap.ghMergePrAtHead.transport).toBe("supervisor");
    expect(
      ipcProcedureMap.ghMergePrAtHead.payloadSchema.safeParse({
        projectLocation: { kind: "posix", path: "/repo" },
        prNumber: 12,
      }).success,
    ).toBe(false);
  });

  it("keeps the procedure-map fingerprint pinned so any map change forces a compat review", () => {
    const sha256 = createHash("sha256").update(ipcProcedureMapFingerprint()).digest("hex");
    expect(`${IPC_PROCEDURE_MAP_VERSION}:${sha256}`).toBe(HOP_PIN);
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

  it("rejects the previously published IPC map version after the hop collapse", () => {
    expect(() => assertIpcProcedureMapVersion(PREVIOUS_IPC_PROCEDURE_MAP_VERSION)).toThrow(
      IpcProcedureMapVersionError,
    );
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
