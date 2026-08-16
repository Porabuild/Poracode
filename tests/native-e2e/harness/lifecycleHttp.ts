import type { IncomingMessage, ServerResponse } from "node:http";
import { writeValidatedRoute, recordRouteFollowUps } from "./contractResponse.ts";
import { LabHttpError } from "./labAuth.ts";
import type { LabRuntime } from "./labRuntime.ts";
import { validateRouteRequest } from "./requestValidation.ts";

const LIFECYCLE_ROUTE_IDS = new Set([
  "shell-snapshot",
  "project-command",
  "project-settings",
  "project-notes-read",
  "project-notes-write",
  "attachment-upload",
  "thread-history",
  "thread-history-items",
  "thread-start-existing",
  "thread-runtime-truncate",
  "thread-command",
  "thread-send",
  "thread-interrupt",
  "thread-goal",
  "thread-close",
  "thread-steer-set",
  "thread-steer-clear",
]);

export async function handleLifecycleHttp(
  runtime: LabRuntime,
  req: IncomingMessage,
  res: ServerResponse,
  routeId: string,
  url: URL,
  params: Readonly<Record<string, string>>,
): Promise<boolean> {
  if (!LIFECYCLE_ROUTE_IDS.has(routeId)) return false;
  const input = await validateRouteRequest(req, url, routeId, params);
  const body = input.body as Record<string, unknown>;
  const threadId = String(input.params.threadId ?? "");
  if (
    routeId.startsWith("thread-") &&
    routeId !== "thread-start-existing" &&
    !runtime.lifecycle.hasThread(threadId)
  ) {
    throw new LabHttpError("not_found", "Thread not found.", 404);
  }
  switch (routeId) {
    case "shell-snapshot":
      writeValidatedRoute(runtime, res, routeId, runtime.lifecycle.shellSnapshot(runtime.ring.seq));
      recordRouteFollowUps(runtime, routeId);
      return true;
    case "project-command": {
      const result = runtime.lifecycle.projectCommand(body);
      if (!result) {
        runtime.ledger.observeHttpRoute(routeId, { statusCode: 501, source: "negative" });
        throw new LabHttpError(
          "unconfigured_contract_case",
          `Project command ${String(body.kind)} requires an external deterministic fixture.`,
          501,
        );
      }
      markMutation(runtime, routeId);
      writeValidatedRoute(runtime, res, routeId, result);
      return true;
    }
    case "project-settings": {
      const settings = runtime.lifecycle.projectSettings(String(input.params.projectId));
      if (!settings) throw new LabHttpError("not_found", "Project not found.", 404);
      writeValidatedRoute(runtime, res, routeId, settings);
      return true;
    }
    case "project-notes-read":
      writeValidatedRoute(
        runtime,
        res,
        routeId,
        runtime.lifecycle.readNotes(String(input.params.projectId)),
      );
      recordRouteFollowUps(runtime, routeId);
      return true;
    case "project-notes-write":
      runtime.lifecycle.writeNotes(String(input.params.projectId), body);
      markMutation(runtime, routeId);
      writeValidatedRoute(runtime, res, routeId, {});
      return true;
    case "attachment-upload": {
      const path = runtime.lifecycle.saveAttachment(
        String(input.query.threadId),
        String(input.query.name),
        input.rawBody!,
      );
      markMutation(runtime, routeId);
      writeValidatedRoute(runtime, res, routeId, { path });
      return true;
    }
    case "thread-history":
      writeValidatedRoute(runtime, res, routeId, runtime.lifecycle.history(runtime.ring.seq));
      recordRouteFollowUps(runtime, routeId);
      return true;
    case "thread-history-items":
      writeValidatedRoute(
        runtime,
        res,
        routeId,
        runtime.lifecycle.historyItems(
          input.query.beforePosition as number | undefined,
          input.query.limit as number,
        ),
      );
      recordRouteFollowUps(runtime, routeId);
      return true;
    case "thread-start-existing":
      markMutation(runtime, routeId);
      writeValidatedRoute(runtime, res, routeId, runtime.lifecycle.start(body));
      return true;
    case "thread-runtime-truncate":
      runtime.lifecycle.truncate(String(body.itemId));
      return writeOkMutation(runtime, res, routeId);
    case "thread-command":
      runtime.lifecycle.command(body);
      return writeOkMutation(runtime, res, routeId);
    case "thread-send":
      runtime.lifecycle.send(body);
      return writeOkMutation(runtime, res, routeId);
    case "thread-interrupt":
      runtime.lifecycle.interrupt();
      return writeOkMutation(runtime, res, routeId);
    case "thread-goal":
      runtime.lifecycle.setGoal(body);
      return writeOkMutation(runtime, res, routeId);
    case "thread-close":
      runtime.lifecycle.close();
      return writeOkMutation(runtime, res, routeId);
    case "thread-steer-set":
      runtime.lifecycle.setSteer(body);
      return writeOkMutation(runtime, res, routeId);
    case "thread-steer-clear":
      runtime.lifecycle.clearSteer();
      return writeOkMutation(runtime, res, routeId);
    default:
      return false;
  }
}

function markMutation(runtime: LabRuntime, routeId: string): void {
  runtime.ledger.markRequiresFollowUp("route", routeId);
  runtime.lifecycle.recordMutation(routeId);
}

function writeOkMutation(runtime: LabRuntime, res: ServerResponse, routeId: string): true {
  markMutation(runtime, routeId);
  writeValidatedRoute(runtime, res, routeId, { ok: true });
  return true;
}
