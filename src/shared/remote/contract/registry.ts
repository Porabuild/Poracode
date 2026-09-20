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

/**
 * Structural completeness gate over the ONE registry table. Totals are derived,
 * never hard-coded: the registry (not a number in this file) is the single
 * source of truth, so this fails on duplication, drift between the procedure
 * allowlist and the contracts, or a blocked result — not on a stale count.
 */
export function assertRemoteContractComplete(): void {
  const routeIds = REMOTE_HTTP_ROUTES.map((route) => route.id);
  const routeKeys = REMOTE_HTTP_ROUTES.map((route) => `${route.method} ${route.path}`);
  if (new Set(routeIds).size !== routeIds.length || new Set(routeKeys).size !== routeKeys.length) {
    throw new Error("REMOTE_HTTP_ROUTES contains duplicate route ids or method+path keys");
  }
  const procedureNames = REMOTE_PROCEDURE_CONTRACTS.map((procedure) => procedure.name);
  if (new Set(procedureNames).size !== procedureNames.length) {
    throw new Error("REMOTE_PROCEDURE_CONTRACTS contains duplicate procedure names");
  }
  if (procedureNames.join("\u0000") !== Object.keys(REMOTE_PROCEDURE_SPECS).join("\u0000")) {
    throw new Error("REMOTE_PROCEDURE_CONTRACTS drifted from the REMOTE_PROCEDURE_SPECS allowlist");
  }
  if (REMOTE_CONTRACT_INVENTORY.routes !== REMOTE_HTTP_ROUTES.length) {
    throw new Error("Contract inventory route count drifted from the registry");
  }
  if (REMOTE_CONTRACT_INVENTORY.procedures !== REMOTE_PROCEDURE_CONTRACTS.length) {
    throw new Error("Contract inventory procedure count drifted from the registry");
  }
  if (BLOCKED_PROCEDURE_RESULTS.length > 0) {
    throw new Error(`Blocked remote procedure results: ${BLOCKED_PROCEDURE_RESULTS.join(", ")}`);
  }
}
