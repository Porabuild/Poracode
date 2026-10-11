import { remotePushRegistrationRoutingSchema } from "../../../src/shared/remote/protocol.ts";
import type { FaultFixtureId } from "./controlFixtures.ts";
import { LabHttpError } from "./labAuth.ts";
import { buildReplayableEvent } from "./labFixtures.ts";
import { scenarioActionFingerprint } from "./nativeScenarioIdempotency.ts";
import {
  observedOperationIdsForLab,
  unionObservedOperationIds,
} from "./nativeScenarioObservation.ts";
import { assertScenarioActionResultSafe } from "./nativeScenarioSafety.ts";
import { sortCodePoints } from "./sort.ts";
import type { WireLab } from "./wireLab.ts";
import { NATIVE_E2E_SCENARIO_API_VERSION } from "./versions.ts";
import { validateScenarioTimeout } from "./nativeScenarioValidation.ts";
import type { WireOperationObservation } from "./observationLedger.ts";

export const SCENARIO_STATE_PATH = "/v1/scenario/state" as const;
export const SCENARIO_ACTION_PATH = "/v1/scenario/actions" as const;
export const SCENARIO_DESCRIPTOR_PATH = "/v1/scenario" as const;

const CANONICAL_REPLAY_EVENTS = [
  "thread-reset",
  "thread-exited",
  "agent-status-updated",
  "windows-agent-statuses",
  "wsl-agent-statuses",
  "remote-git-summaries",
  "remote-git-state",
] as const;

const PRIMARY_CLIENT_CONNECTION_ID = "00000000-0000-4000-8000-000000000001";
const COLLISION_CLIENT_CONNECTION_ID = "00000000-0000-4000-8000-000000000002";
const COLLISION_THREAD_ID = "thread-collision-001";
const DEFAULT_TIMEOUT_MS = 5_000;

export type ScenarioHostId = "primary" | "collision-b";
export type ScenarioHostTarget = ScenarioHostId | "all";

export interface ScenarioHostState {
  readonly hostId: ScenarioHostId;
  readonly desktopId: string;
  readonly clientConnectionId: string;
  readonly remoteThreadIds: readonly string[];
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
  readonly pairingState: "pairable" | "paired" | "unpaired";
  readonly observedOperationIds: readonly string[];
  readonly operationJournal: readonly WireOperationObservation[];
  readonly lastReplay: readonly { readonly seq: number; readonly type: string }[];
}

export interface NativeScenarioState {
  readonly formatVersion: typeof NATIVE_E2E_SCENARIO_API_VERSION;
  readonly revision: number;
  readonly pairingState: "pairable" | "paired" | "unpaired";
  readonly hosts: readonly ScenarioHostState[];
  readonly declaredOperationIds: readonly string[];
  readonly observedOperationIds: readonly string[];
  readonly faults: readonly string[];
}

export interface ScenarioDescriptor {
  readonly formatVersion: typeof NATIVE_E2E_SCENARIO_API_VERSION;
  readonly descriptorPath: typeof SCENARIO_DESCRIPTOR_PATH;
  readonly statePath: typeof SCENARIO_STATE_PATH;
  readonly actionPath: typeof SCENARIO_ACTION_PATH;
  readonly authScheme: "harness-capability";
  readonly pairing: "action-result-only";
  readonly actions: readonly string[];
  readonly awaitConditions: readonly string[];
}

export type ScenarioCondition =
  | { readonly kind: "revision-at-least"; readonly revision: number }
  | { readonly kind: "operations-observed"; readonly operationIds: readonly string[] }
  | { readonly kind: "pairing-state"; readonly state: NativeScenarioState["pairingState"] }
  | { readonly kind: "host-count"; readonly count: number };

export type ScenarioAction =
  | { readonly type: "reset"; readonly requestId?: string }
  | { readonly type: "pairing-url"; readonly hostId?: ScenarioHostId; readonly requestId?: string }
  | { readonly type: "seed-multihost-collision"; readonly requestId?: string }
  | {
      readonly type: "emit-canonical-replay";
      readonly hostId?: ScenarioHostTarget;
      readonly threadId?: string;
      readonly requestId?: string;
    }
  | {
      readonly type: "declare-observations";
      readonly operationIds: readonly string[];
      readonly requestId?: string;
    }
  | {
      readonly type: "activate-fault";
      readonly fixtureId: FaultFixtureId;
      readonly requestId?: string;
    }
  | { readonly type: "clear-faults"; readonly requestId?: string }
  | {
      readonly type: "await";
      readonly condition: ScenarioCondition;
      readonly timeoutMs?: number;
      readonly requestId?: string;
    };

export interface ScenarioActionResult {
  readonly formatVersion: typeof NATIVE_E2E_SCENARIO_API_VERSION;
  readonly ok: true;
  readonly action: ScenarioAction["type"];
  readonly operationId: string;
  readonly revision: number;
  readonly state: NativeScenarioState;
  readonly pairingUrl?: string;
  readonly pairingExpiresAt?: string;
  readonly hostId?: ScenarioHostId;
  readonly firstSeq?: number;
  readonly lastSeq?: number;
  readonly eventTypes?: readonly string[];
}

export interface NativeScenarioOptions {
  readonly primaryDesktopId?: string;
  readonly createCollisionHost?: () => Promise<WireLab>;
}

export interface NativeScenarioControl {
  readonly descriptor: () => ScenarioDescriptor;
  readonly state: () => NativeScenarioState;
  readonly execute: (action: ScenarioAction, signal?: AbortSignal) => Promise<ScenarioActionResult>;
  readonly reset: () => void;
  readonly stop: () => Promise<void>;
}

interface IdempotentAction {
  readonly fingerprint: string;
  readonly result: ScenarioActionResult;
}

const REQUEST_CONFLICT_MESSAGE = "Scenario request ID was reused with different action parameters.";
const SCENARIO_STOPPED_MESSAGE = "Scenario stopped.";

export class NativeScenarioController implements NativeScenarioControl {
  private readonly primaryDesktopId: string;
  private readonly declared = new Set<string>();
  private readonly replay = new Map<ScenarioHostId, ScenarioHostState["lastReplay"]>();
  private readonly idempotent = new Map<string, IdempotentAction>();
  private readonly stopPrimaryLedgerListener: () => void;
  private stopCollisionLedgerListener: (() => void) | null = null;
  private collisionHost: WireLab | null = null;
  private collisionSeedPromise: Promise<void> | null = null;
  private collisionSeeded = false;
  private stopped = false;
  private stopPromise: Promise<void> | null = null;
  private revisionValue = 0;
  private actionCount = 0;
  private readonly waiters = new Set<() => void>();

  constructor(
    private readonly primary: WireLab,
    private readonly options: NativeScenarioOptions = {},
  ) {
    this.primaryDesktopId = options.primaryDesktopId ?? "native-e2e-lab";
    validateRoutingIdentity(this.primaryDesktopId, PRIMARY_CLIENT_CONNECTION_ID);
    this.stopPrimaryLedgerListener = this.primary.ledger.onChange(() => this.changed());
  }

  descriptor(): ScenarioDescriptor {
    return {
      formatVersion: NATIVE_E2E_SCENARIO_API_VERSION,
      descriptorPath: SCENARIO_DESCRIPTOR_PATH,
      statePath: SCENARIO_STATE_PATH,
      actionPath: SCENARIO_ACTION_PATH,
      authScheme: "harness-capability",
      pairing: "action-result-only",
      actions: [
        "reset",
        "pairing-url",
        "seed-multihost-collision",
        "emit-canonical-replay",
        "declare-observations",
        "activate-fault",
        "clear-faults",
        "await",
      ],
      awaitConditions: ["revision-at-least", "operations-observed", "pairing-state", "host-count"],
    };
  }

  state(): NativeScenarioState {
    const hosts: ScenarioHostState[] = [this.hostState("primary", this.primary)];
    if (this.collisionSeeded && this.collisionHost) {
      hosts.push(this.hostState("collision-b", this.collisionHost));
    }
    return {
      formatVersion: NATIVE_E2E_SCENARIO_API_VERSION,
      revision: this.revisionValue,
      pairingState: pairingState(this.primary),
      hosts,
      declaredOperationIds: sortCodePoints(this.declared),
      observedOperationIds: unionObservedOperationIds(hosts),
      faults: this.primary.faults.list(),
    };
  }

  async execute(action: ScenarioAction, signal?: AbortSignal): Promise<ScenarioActionResult> {
    this.assertRunning();
    const requestId = action.requestId;
    const fingerprint = requestId ? scenarioActionFingerprint(action) : null;
    if (requestId) {
      const previous = this.idempotent.get(requestId);
      if (previous) {
        if (previous.fingerprint !== fingerprint) {
          throw new LabHttpError("scenario_request_conflict", REQUEST_CONFLICT_MESSAGE, 409);
        }
        return previous.result;
      }
    }

    let result: ScenarioActionResult;
    switch (action.type) {
      case "reset":
        this.reset();
        result = this.result(action.type);
        break;
      case "pairing-url": {
        const hostId = action.hostId ?? "primary";
        const host = this.host(hostId);
        const pairing = host.lab.issuePairingUrl();
        this.changed();
        result = {
          ...this.result(action.type),
          pairingUrl: pairing.pairingUrl,
          pairingExpiresAt: pairing.expiresAt,
          hostId,
        };
        break;
      }
      case "seed-multihost-collision":
        await this.seedCollision();
        result = this.result(action.type);
        break;
      case "emit-canonical-replay":
        result = this.result(action.type, this.emitCanonical(action));
        break;
      case "declare-observations":
        for (const operationId of action.operationIds) this.declared.add(operationId);
        this.changed();
        result = this.result(action.type);
        break;
      case "activate-fault":
        this.primary.activateFaultFixture(action.fixtureId);
        this.changed();
        result = this.result(action.type);
        break;
      case "clear-faults":
        this.primary.activateFaultFixture("clear");
        this.changed();
        result = this.result(action.type);
        break;
      case "await":
        await this.awaitCondition(action.condition, action.timeoutMs, signal);
        result = this.result(action.type);
        break;
    }
    assertScenarioActionResultSafe(result);
    if (requestId) {
      this.idempotent.set(requestId, { fingerprint: fingerprint!, result });
    }
    return result;
  }

  reset(): void {
    if (this.stopped) return;
    this.collisionSeeded = false;
    this.declared.clear();
    this.replay.clear();
    this.primary.reset();
    this.collisionHost?.reset();
    this.changed();
  }

  async stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    this.stopped = true;
    this.stopPrimaryLedgerListener();
    this.disposeCollisionLedgerListener();
    for (const waiter of [...this.waiters]) waiter();
    this.waiters.clear();
    const seedPromise = this.collisionSeedPromise;
    this.stopPromise = (async () => {
      await seedPromise?.catch(() => undefined);
      const collision = this.collisionHost;
      this.collisionHost = null;
      await collision?.stop();
    })();
    return this.stopPromise;
  }

  private seedCollision(): Promise<void> {
    if (this.collisionSeedPromise) return this.collisionSeedPromise;
    const promise = this.seedCollisionInternal();
    this.collisionSeedPromise = promise;
    void promise.then(
      () => {
        if (this.collisionSeedPromise === promise) this.collisionSeedPromise = null;
      },
      () => {
        if (this.collisionSeedPromise === promise) this.collisionSeedPromise = null;
      },
    );
    return promise;
  }

  private async seedCollisionInternal(): Promise<void> {
    this.assertRunning();
    if (!this.collisionHost) {
      if (!this.options.createCollisionHost) {
        throw new LabHttpError("scenario_host_unavailable", "Collision host is unavailable.", 409);
      }
      const collision = await this.options.createCollisionHost();
      if (this.stopped) {
        await collision.stop();
        throw scenarioStoppedError();
      }
      this.collisionHost = collision;
      this.stopCollisionLedgerListener = collision.ledger.onChange(() => this.changed());
      validateRoutingIdentity("native-e2e-collision-b", COLLISION_CLIENT_CONNECTION_ID);
    }
    this.collisionSeeded = true;
    this.primary.publishEvent(buildReplayableEvent("remote-threads-changed", COLLISION_THREAD_ID));
    this.collisionHost.publishEvent(
      buildReplayableEvent("remote-threads-changed", COLLISION_THREAD_ID),
    );
  }

  private emitCanonical(action: Extract<ScenarioAction, { type: "emit-canonical-replay" }>): {
    readonly hostId: ScenarioHostId;
    readonly firstSeq: number;
    readonly lastSeq: number;
    readonly eventTypes: readonly string[];
  } {
    const target = action.hostId ?? "primary";
    const hosts: ScenarioHostId[] = target === "all" ? ["primary", "collision-b"] : [target];
    const eventTypes = [...CANONICAL_REPLAY_EVENTS];
    let firstSeq = Number.MAX_SAFE_INTEGER;
    let lastSeq = 0;
    let resultHost: ScenarioHostId = "primary";
    for (const hostId of hosts) {
      const host = this.host(hostId);
      const sequences: Array<{ readonly seq: number; readonly type: string }> = [];
      for (const type of eventTypes) {
        const seq = host.lab.publishEvent(buildReplayableEvent(type, action.threadId));
        sequences.push({ seq, type });
        firstSeq = Math.min(firstSeq, seq);
        lastSeq = Math.max(lastSeq, seq);
      }
      this.replay.set(hostId, sequences);
      resultHost = hostId;
    }
    return {
      hostId: resultHost,
      firstSeq,
      lastSeq,
      eventTypes,
    };
  }

  private async awaitCondition(
    condition: ScenarioCondition,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal?: AbortSignal,
  ): Promise<void> {
    if (conditionMatches(this.state(), condition)) return;
    if (signal?.aborted)
      throw new LabHttpError("await_cancelled", "Scenario await cancelled.", 499);
    const timeout = validateScenarioTimeout(timeoutMs);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: LabHttpError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.waiters.delete(check);
        signal?.removeEventListener("abort", cancel);
        if (error) reject(error);
        else resolve();
      };
      const check = () => {
        if (this.stopped) finish(scenarioStoppedError());
        else if (conditionMatches(this.state(), condition)) finish();
      };
      const cancel = () =>
        finish(new LabHttpError("await_cancelled", "Scenario await cancelled.", 499));
      const timer = setTimeout(
        () => finish(new LabHttpError("await_timeout", "Scenario await timed out.", 408)),
        timeout,
      );
      timer.unref?.();
      this.waiters.add(check);
      signal?.addEventListener("abort", cancel, { once: true });
      check();
    });
  }

  private result(
    action: ScenarioAction["type"],
    details?: Partial<ScenarioActionResult>,
  ): ScenarioActionResult {
    const result = {
      formatVersion: NATIVE_E2E_SCENARIO_API_VERSION,
      ok: true as const,
      action,
      operationId: `scenario-${String(++this.actionCount)}`,
      revision: this.revisionValue,
      state: this.state(),
      ...details,
    } satisfies ScenarioActionResult;
    assertScenarioActionResultSafe(result);
    return result;
  }

  private host(hostId: ScenarioHostId): { readonly hostId: ScenarioHostId; readonly lab: WireLab } {
    if (hostId === "primary") return { hostId, lab: this.primary };
    if (!this.collisionSeeded || !this.collisionHost) {
      throw new LabHttpError("scenario_host_not_seeded", "Scenario host is not seeded.", 409);
    }
    return { hostId, lab: this.collisionHost };
  }

  private hostState(hostId: ScenarioHostId, lab: WireLab): ScenarioHostState {
    const collision = hostId === "collision-b";
    return {
      hostId,
      desktopId: collision ? "native-e2e-collision-b" : this.primaryDesktopId,
      clientConnectionId: collision ? COLLISION_CLIENT_CONNECTION_ID : PRIMARY_CLIENT_CONNECTION_ID,
      remoteThreadIds: collision || this.collisionSeeded ? [COLLISION_THREAD_ID] : [],
      httpBaseUrl: lab.httpBaseUrl,
      wsBaseUrl: lab.wsBaseUrl,
      pairingState: pairingState(lab),
      observedOperationIds: observedOperationIdsForLab(lab),
      operationJournal: lab.observationLedger.auditOperations(),
      lastReplay: this.replay.get(hostId) ?? [],
    };
  }

  private changed(): void {
    if (this.stopped) return;
    this.revisionValue += 1;
    for (const waiter of [...this.waiters]) waiter();
  }

  private assertRunning(): void {
    if (this.stopped) throw scenarioStoppedError();
  }

  private disposeCollisionLedgerListener(): void {
    const stop = this.stopCollisionLedgerListener;
    this.stopCollisionLedgerListener = null;
    stop?.();
  }
}

export {
  assertScenarioActionResultSafe,
  assertScenarioDescriptorSafe,
  assertScenarioStateSafe,
} from "./nativeScenarioSafety.ts";

function pairingState(lab: WireLab): NativeScenarioState["pairingState"] {
  if (lab.auth.pairingOutstanding) return "pairable";
  if (lab.auth.accessSessionCount > 0) return "paired";
  return "unpaired";
}

function scenarioStoppedError(): LabHttpError {
  return new LabHttpError("scenario_stopped", SCENARIO_STOPPED_MESSAGE, 409);
}

function validateRoutingIdentity(desktopId: string, clientConnectionId: string): void {
  remotePushRegistrationRoutingSchema.parse({ version: 1, desktopId, clientConnectionId });
}

function conditionMatches(state: NativeScenarioState, condition: ScenarioCondition): boolean {
  switch (condition.kind) {
    case "revision-at-least":
      return state.revision >= condition.revision;
    case "operations-observed":
      return condition.operationIds.every((id) => state.observedOperationIds.includes(id));
    case "pairing-state":
      return state.pairingState === condition.state;
    case "host-count":
      return state.hosts.length === condition.count;
  }
}
