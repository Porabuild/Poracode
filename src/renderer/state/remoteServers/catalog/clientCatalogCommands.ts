import type { RemoteThreadCommand } from "@/shared/contracts";
import type { RemoteProjectCommand, RemoteProjectCommandResponse } from "@/shared/remote";
import {
  isRemoteProjectCatalogCommand,
  isRemoteThreadCatalogCommand,
  type RemoteProjectCatalogCommand,
  type RemoteThreadCatalogCommand,
} from "@/shared/remote/protocol/catalogMutations";
import type { RemoteDesktopClient } from "@/shared/remote/client";

/**
 * One dispatch seam for the SDK's split command overloads. Narrow catalog
 * mutations (`reorder`, `set-workspace`, `set-draft-config`) require the
 * host's crash-safe receipt and an explicit per-operation command id: mint one
 * per user action and reuse it only to retry that same action. `start` keeps
 * its own stable receipt identity, and every legacy kind stays unchanged.
 *
 * `result: "bounded"` opts into the negotiated bounded result mode
 * (`capabilities.projectCommandResults` v1): the host answers the canonical
 * acknowledgement/row instead of the complete project list. That mode requires
 * an explicit per-operation id for EVERY kind, so one is minted here when the
 * caller did not reuse its own for a retry of the same action.
 *
 * Shared by the paired-server store bindings and the managed-root dispatchers,
 * so neither path re-implements the overload branching.
 */

export async function sendClientThreadCommand(
  client: RemoteDesktopClient,
  command: RemoteThreadCommand,
  options: { readonly commandId?: string } = {},
): Promise<void> {
  if (isRemoteThreadCatalogCommand(command)) {
    await client.sendThreadCommand(command, {
      commandId: options.commandId ?? crypto.randomUUID(),
    });
    return;
  }
  if (command.kind === "start") {
    if (options.commandId !== undefined) {
      await client.sendThreadCommand(command, { commandId: options.commandId });
    } else {
      await client.sendThreadCommand(command);
    }
    return;
  }
  const legacy = command as Exclude<
    RemoteThreadCommand,
    RemoteThreadCatalogCommand | { kind: "start" }
  >;
  if (options.commandId !== undefined) {
    await client.sendThreadCommand(legacy, { commandId: options.commandId });
  } else {
    await client.sendThreadCommand(legacy);
  }
}

export async function sendClientProjectCommand(
  client: RemoteDesktopClient,
  command: RemoteProjectCommand,
  options: { readonly commandId?: string; readonly result?: "bounded" } = {},
): Promise<RemoteProjectCommandResponse> {
  const bounded = options.result === "bounded";
  const commandId =
    options.commandId ??
    (bounded || isRemoteProjectCatalogCommand(command) ? crypto.randomUUID() : undefined);
  if (isRemoteProjectCatalogCommand(command)) {
    return client.projectCommand(command, {
      commandId: commandId!,
      ...(bounded ? { result: "bounded" } : {}),
    });
  }
  const legacy = command as Exclude<RemoteProjectCommand, RemoteProjectCatalogCommand>;
  if (commandId === undefined) return client.projectCommand(legacy);
  return client.projectCommand(legacy, {
    commandId,
    ...(bounded ? { result: "bounded" } : {}),
  });
}
