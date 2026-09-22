import type { RemoteThreadCommand } from "../../contracts/thread";
import { REMOTE_CATALOG_MUTATIONS_VERSION } from "./core";
import type { RemoteProjectCommand } from "./resources";

export { REMOTE_CATALOG_MUTATIONS_VERSION };

/**
 * Project-command kinds that mutate the catalog narrowly (no full-catalog
 * response) and therefore require the advertised `catalogMutations`
 * capability. Every pre-existing project-command kind is untouched: it still
 * returns the complete `RemoteProjectCommandResult` and never requires the
 * capability.
 */
export type RemoteProjectCatalogCommand = Extract<
  RemoteProjectCommand,
  { kind: "reorder" | "set-workspace" | "set-draft-config" }
>;

/**
 * Thread-command kinds with the same contract on the thread route. `start`
 * keeps its own receipt handling and is deliberately not a catalog command.
 */
export type RemoteThreadCatalogCommand = Extract<
  RemoteThreadCommand,
  { kind: "reorder" | "set-workspace" }
>;

export function isRemoteProjectCatalogCommand(
  command: RemoteProjectCommand,
): command is RemoteProjectCatalogCommand {
  return (
    command.kind === "reorder" ||
    command.kind === "set-workspace" ||
    command.kind === "set-draft-config"
  );
}

export function isRemoteThreadCatalogCommand(
  command: RemoteThreadCommand,
): command is RemoteThreadCatalogCommand {
  return command.kind === "reorder" || command.kind === "set-workspace";
}

/**
 * True only when a host advertised `capabilities.catalogMutations` version 1.
 * A client uses this as the single pre-flight gate: absent capability means
 * the host cannot persist these intents truthfully (it would reject the kinds
 * or silently strip the field), so the client keeps them local.
 */
export function hostSupportsCatalogMutations(
  capability: { readonly versions: readonly number[] } | undefined,
): boolean {
  return capability?.versions.includes(REMOTE_CATALOG_MUTATIONS_VERSION) === true;
}
