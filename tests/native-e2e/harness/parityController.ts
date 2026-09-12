import { LabHttpError } from "./labAuth.ts";
import { observedOperationIdsForLab } from "./nativeScenarioObservation.ts";
import { assertSecretFree } from "./secrets.ts";
import { sortedUniqueCodePoints } from "./sort.ts";
import { ParityFaults } from "./parityFaults.ts";
import { emitParityCase, type ParityEmission } from "./parityEmitter.ts";
import { loadCanonicalParityTape, parityTapeCaseIds } from "./parityTape.ts";
import {
  parseParityAction,
  type ParityAction,
  type ParityFault,
  type ParityHostId,
} from "./parityValidation.ts";
import type { ObservationJournalSnapshot } from "./observationLedger.ts";
import type { WireLab } from "./wireLab.ts";
import { NATIVE_E2E_PARITY_FORMAT_VERSION } from "./versions.ts";

export const PARITY_API_VERSION = NATIVE_E2E_PARITY_FORMAT_VERSION;

export interface ParityHostState {
  readonly hostId: ParityHostId;
  readonly desktopId: string;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
  readonly replaySequence: number;
  readonly replayCount: number;
  readonly sockets: readonly { readonly socketId: string; readonly sessionId: string }[];
  readonly faults: readonly ParityFault[];
  readonly observedOperationIds: readonly string[];
  readonly observations: ObservationJournalSnapshot;
  readonly emittedCaseIds: readonly string[];
}

export interface ParityState {
  readonly formatVersion: typeof PARITY_API_VERSION;
  readonly tapeId: string;
  readonly protocolVersion: number;
  readonly caseIds: readonly string[];
  readonly hosts: readonly ParityHostState[];
}

export interface ParityDescriptor {
  readonly formatVersion: typeof PARITY_API_VERSION;
  readonly statePath: "/v1/parity/state";
  readonly actionPath: "/v1/parity/actions";
  readonly authScheme: "harness-capability";
  readonly actionTypes: readonly string[];
}

export interface ParityActionResult {
  readonly formatVersion: typeof PARITY_API_VERSION;
  readonly ok: true;
  readonly action: ParityAction["type"];
  readonly operationId: string;
  readonly state: ParityState;
  readonly emission?: ParityEmission;
}

export interface ParityHostEntry {
  readonly hostId: ParityHostId;
  readonly lab: WireLab;
}

interface IdempotentAction {
  readonly fingerprint: string;
  readonly result: ParityActionResult;
}

export interface NativeParityControl {
  readonly descriptor: () => ParityDescriptor;
  readonly state: () => ParityState;
  readonly execute: (action: ParityAction) => Promise<ParityActionResult>;
  readonly resetState: () => void;
  readonly stop: () => Promise<void>;
}

export class NativeParityController implements NativeParityControl {
  private readonly faults = new ParityFaults();
  private readonly emitted = new Map<ParityHostId, Set<string>>();
  private readonly idempotent = new Map<string, IdempotentAction>();
  private operationCount = 0;
  private stopped = false;

  constructor(private readonly getHosts: () => readonly ParityHostEntry[]) {
    loadCanonicalParityTape();
  }

  descriptor(): ParityDescriptor {
    return {
      formatVersion: PARITY_API_VERSION,
      statePath: "/v1/parity/state",
      actionPath: "/v1/parity/actions",
      authScheme: "harness-capability",
      actionTypes: ["reset", "emit-tape-case", "set-host-fault", "clear-host-faults"],
    };
  }

  state(): ParityState {
    const tape = loadCanonicalParityTape();
    return {
      formatVersion: PARITY_API_VERSION,
      tapeId: tape.id,
      protocolVersion: tape.protocolVersion,
      caseIds: parityTapeCaseIds(),
      hosts: this.getHosts().map(({ hostId, lab }) => ({
        hostId,
        desktopId: lab.wireDesktopId,
        httpBaseUrl: lab.httpBaseUrl,
        wsBaseUrl: lab.wsBaseUrl,
        replaySequence: lab.ring.seq,
        replayCount: lab.ring.size,
        sockets: lab.connectionIdentities,
        faults: this.faults.list(hostId),
        observedOperationIds: observedOperationIdsForLab(lab),
        observations: lab.observationLedger.snapshot(),
        emittedCaseIds: sortedUniqueCodePoints(this.emitted.get(hostId) ?? []),
      })),
    };
  }

  async execute(action: ParityAction): Promise<ParityActionResult> {
    if (this.stopped) throw new LabHttpError("parity_stopped", "Parity control is stopped.", 409);
    const requestId = action.requestId;
    const fingerprint = requestId ? fingerprintAction(action) : undefined;
    if (requestId) {
      const previous = this.idempotent.get(requestId);
      if (previous) {
        if (previous.fingerprint !== fingerprint) {
          throw new LabHttpError("parity_request_conflict", "Parity request ID conflict.", 409);
        }
        return previous.result;
      }
    }
    const result = this.executeFresh(action);
    assertSecretFree(result, "parity action result");
    if (requestId) this.idempotent.set(requestId, { fingerprint: fingerprint!, result });
    return result;
  }

  resetState(): void {
    this.faults.clear();
    this.emitted.clear();
    this.idempotent.clear();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.resetState();
  }

  private executeFresh(action: ParityAction): ParityActionResult {
    switch (action.type) {
      case "reset":
        for (const { lab } of this.getHosts()) lab.reset();
        this.resetState();
        return this.result(action.type);
      case "set-host-fault": {
        const hostId = action.hostId ?? "primary";
        this.host(hostId);
        this.faults.set(hostId, action.fault);
        return this.result(action.type);
      }
      case "clear-host-faults": {
        const hostId = action.hostId;
        if (hostId) this.host(hostId);
        this.faults.clear(hostId);
        return this.result(action.type);
      }
      case "emit-tape-case": {
        const hostId = action.hostId ?? "primary";
        const host = this.host(hostId);
        if (this.faults.has(hostId, "stale-host")) {
          throw new LabHttpError("parity_stale_host", "Target host is stale.", 409);
        }
        if (this.faults.has(hostId, "apply-failure")) {
          throw new LabHttpError("parity_apply_failed", "Parity event application failed.", 409);
        }
        const emission = emitParityCase(
          host.lab,
          hostId,
          action.socketId,
          action.sessionId,
          action.caseId,
        );
        const emitted = this.emitted.get(hostId) ?? new Set<string>();
        emitted.add(action.caseId);
        this.emitted.set(hostId, emitted);
        return this.result(action.type, emission);
      }
    }
  }

  private result(action: ParityAction["type"], emission?: ParityEmission): ParityActionResult {
    const result = {
      formatVersion: PARITY_API_VERSION,
      ok: true as const,
      action,
      operationId: `parity-${String(++this.operationCount)}`,
      state: this.state(),
      ...(emission ? { emission } : {}),
    } satisfies ParityActionResult;
    assertSecretFree(result, "parity result");
    return result;
  }

  private host(hostId: ParityHostId): ParityHostEntry {
    const host = this.getHosts().find((candidate) => candidate.hostId === hostId);
    if (!host)
      throw new LabHttpError("parity_host_unavailable", "Target host is unavailable.", 409);
    return host;
  }
}

function fingerprintAction(action: ParityAction): string {
  const { requestId: _requestId, ...withoutRequestId } = action;
  return JSON.stringify(withoutRequestId);
}

export function parseAndValidateParityAction(value: unknown): ParityAction {
  return parseParityAction(value);
}
