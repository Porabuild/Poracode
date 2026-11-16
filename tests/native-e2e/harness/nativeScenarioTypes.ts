import type { BackgroundTaskLabSnapshot, BackgroundTaskStage } from "./backgroundTaskLab.ts";
import type { FaultFixtureId } from "./controlFixtures.ts";
import type { WireOperationObservation } from "./observationLedger.ts";
import { NATIVE_E2E_SCENARIO_API_VERSION } from "./versions.ts";

/**
 * Public scenario control vocabulary (descriptor/state/actions/results).
 *
 * Kept separate from `nativeScenario.ts` so the controller stays under the
 * harness file-size gate; `nativeScenario.ts` re-exports every symbol here and
 * remains the import site for callers.
 */

export const SCENARIO_STATE_PATH = "/v1/scenario/state" as const;
export const SCENARIO_ACTION_PATH = "/v1/scenario/actions" as const;
export const SCENARIO_DESCRIPTOR_PATH = "/v1/scenario" as const;

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
  /** Primary host's shared background-task fixture counters/roster. */
  readonly backgroundTasks: BackgroundTaskLabSnapshot;
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
      readonly type: "background-task-stage";
      readonly stage: BackgroundTaskStage;
      readonly requestId?: string;
    }
  | {
      readonly type: "background-task-output-delay";
      readonly delayMs: number;
      readonly requestId?: string;
    }
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
