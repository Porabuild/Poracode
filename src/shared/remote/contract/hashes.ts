import { canonicalize, sha256Prefixed } from "./canonical";
import { REMOTE_CONTRACT_REGISTRY } from "./registry";
import {
  REMOTE_BINDING_FORMAT_VERSION,
  REMOTE_CONTRACT_NAME,
  REMOTE_GENERATOR_VERSION,
  REMOTE_PROTOCOL_VERSION,
} from "./versions";

export { readProtocolManifest } from "./manifestRead";

export function manifestHashOf(manifest: unknown): string {
  return sha256Prefixed(canonicalize(manifest));
}

/**
 * Authority input for `sourceHash`. Every field is defined; do not hash an
 * object that still contains a `sourceHash: undefined` placeholder.
 */
export function buildRemoteV3AuthorityInput(args: {
  readonly unsignedIr: Record<string, unknown>;
  readonly manifest: unknown;
}): Record<string, unknown> {
  return {
    bindingFormatVersion: REMOTE_BINDING_FORMAT_VERSION,
    contract: REMOTE_CONTRACT_NAME,
    generatorVersion: REMOTE_GENERATOR_VERSION,
    inventory: { ...REMOTE_CONTRACT_REGISTRY.inventory },
    manifest: args.manifest,
    protocolVersion: REMOTE_PROTOCOL_VERSION,
    registryMetadata: {
      unknownObjectFields: REMOTE_CONTRACT_REGISTRY.unknownObjectFields,
      routeIds: REMOTE_CONTRACT_REGISTRY.routes.map((route) => route.id),
      procedureNames: REMOTE_CONTRACT_REGISTRY.procedures.map((procedure) => procedure.name),
    },
    unsignedIr: args.unsignedIr,
  };
}

export function sourceHashOf(authority: Record<string, unknown>): string {
  return sha256Prefixed(canonicalize(authority));
}
