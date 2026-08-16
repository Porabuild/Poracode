import { REMOTE_PROCEDURE_SPECS } from "../procedures";
import { buildRemoteContractInventory } from "./inventory";
import { BLOCKED_PROCEDURE_RESULTS, REMOTE_PROCEDURE_CONTRACTS } from "./procedures";
import { REMOTE_HTTP_ROUTES } from "./routes";
import type { RemoteContractInventory, RemoteContractRegistry } from "./types";
import {
  REMOTE_BINDING_FORMAT_VERSION,
  REMOTE_CONTRACT_NAME,
  REMOTE_GENERATOR_VERSION,
  REMOTE_PROTOCOL_VERSION,
} from "./versions";

export const REMOTE_CONTRACT_INVENTORY: RemoteContractInventory = buildRemoteContractInventory();

export const REMOTE_CONTRACT_REGISTRY: RemoteContractRegistry = {
  contract: REMOTE_CONTRACT_NAME,
  protocolVersion: REMOTE_PROTOCOL_VERSION,
  bindingFormatVersion: REMOTE_BINDING_FORMAT_VERSION,
  generatorVersion: REMOTE_GENERATOR_VERSION,
  unknownObjectFields: "ignore",
  routes: REMOTE_HTTP_ROUTES,
  procedures: REMOTE_PROCEDURE_CONTRACTS,
  inventory: REMOTE_CONTRACT_INVENTORY,
};

export function assertRemoteContractComplete(): void {
  if (REMOTE_HTTP_ROUTES.length !== 56) {
    throw new Error(`Expected 56 HTTP routes, found ${REMOTE_HTTP_ROUTES.length}`);
  }
  if (REMOTE_PROCEDURE_CONTRACTS.length !== 100) {
    throw new Error(`Expected 100 procedures, found ${REMOTE_PROCEDURE_CONTRACTS.length}`);
  }
  if (Object.keys(REMOTE_PROCEDURE_SPECS).length !== 100) {
    throw new Error("REMOTE_PROCEDURE_SPECS drifted from the 100-procedure allowlist");
  }
  if (BLOCKED_PROCEDURE_RESULTS.length > 0) {
    throw new Error(`Blocked remote procedure results: ${BLOCKED_PROCEDURE_RESULTS.join(", ")}`);
  }
}
