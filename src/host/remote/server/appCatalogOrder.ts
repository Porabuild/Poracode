import {
  appCatalogEditResultSchema,
  type AppCatalogEditCommand,
  type AppCatalogEditResult,
  type ThreadCatalogReorderCommand,
} from "@/shared/contracts/appCatalogOrder";
import type { RemoteServerContext } from "./context";
import { runRemoteCommand } from "./remoteCommandIdempotency";
import { applyRemoteThreadCommand, runProjectCommand } from "./threadCommands";

export function reorderedThreadIds(command: ThreadCatalogReorderCommand): string[] {
  return [
    ...(command.kind === "reorder" ? command.threadIds : [command.threadId]),
    command.targetThreadId,
  ];
}

/** Apply the same catalog mutation as the sidebar on this host, even without clients. */
export function applyAppCatalogEdit(
  ctx: RemoteServerContext,
  command: AppCatalogEditCommand,
  operationKey: string,
): Promise<AppCatalogEditResult> {
  const route =
    command.kind === "set-draft-config"
      ? "app-controls:project-draft-config"
      : "app-controls:catalog-order";
  const publicationFailure =
    command.kind === "set-draft-config"
      ? "The project draft was saved. A connected client may need to refresh."
      : "The order was saved. A connected client may need to refresh.";
  return runRemoteCommand({
    commandId: `${route}:${operationKey}`,
    route,
    principalId: "app-controls",
    requestPayload: command,
    mapCompletedResponse: (cached) => appCatalogEditResultSchema.parse(cached),
    operation: async (markDispatched) => {
      let changed = false;
      let publicationWarning: string | undefined;
      const committed = () => {
        changed = true;
        markDispatched();
      };
      // The catalog transaction signals the effect before notifying observers.
      // A later delivery failure never justifies applying the move again.
      try {
        if ("threadId" in command) {
          await applyRemoteThreadCommand(ctx, command, committed);
        } else {
          await runProjectCommand(ctx, command, committed, { resultMode: "bounded" });
        }
      } catch (error) {
        if (!changed) throw error;
        console.warn("[app-controls] catalog edit saved but an observer failed:", error);
        publicationWarning = publicationFailure;
      }
      if (changed) {
        try {
          if ("threadId" in command) ctx.publishThreadsChanged(reorderedThreadIds(command));
          else ctx.publishCatalogChanged();
        } catch (error) {
          console.warn("[app-controls] catalog edit saved but publication failed:", error);
          publicationWarning = publicationFailure;
        }
      }
      return { changed, ...(publicationWarning ? { publicationWarning } : {}) };
    },
  });
}
