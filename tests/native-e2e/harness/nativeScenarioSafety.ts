import { assertSecretFree } from "./secrets.ts";
import type {
  NativeScenarioState,
  ScenarioActionResult,
  ScenarioDescriptor,
} from "./nativeScenario.ts";

export function assertScenarioActionResultSafe(result: ScenarioActionResult): void {
  const { pairingUrl: _pairingUrl, pairingExpiresAt: _pairingExpiresAt, ...safe } = result;
  assertSecretFree(safe, "scenario action result");
  assertScenarioStateSafe(result.state);
}

export function assertScenarioDescriptorSafe(descriptor: ScenarioDescriptor): void {
  assertSecretFree(descriptor, "scenario descriptor");
}

export function assertScenarioStateSafe(state: NativeScenarioState): void {
  assertSecretFree(state, "scenario state");
}
