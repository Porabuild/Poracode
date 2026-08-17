import { agentStatusSchema } from "../../../src/shared/contracts/agent.ts";
import { runtimeEventSchema } from "../../../src/shared/contracts/runtimeEvent.ts";
import {
  remoteGitStateEventSchema,
  remoteGitSummariesEventSchema,
  remoteProjectsChangedEventSchema,
  remoteThreadsChangedEventSchema,
  remoteUserNotificationEventSchema,
} from "../../../src/shared/remote/protocol.ts";
import { allReplayableEventFixtures, allRuntimeEventFixtures } from "./labFixtures.ts";
import { loadProtocolManifest } from "./manifest.ts";

export function validateReplayableEvent(event: Record<string, unknown>): void {
  const type = String(event.type ?? "");
  if (!loadProtocolManifest().webSocket.replayableEventTypes.includes(type)) {
    throw new Error(`Event ${type || "<missing>"} is not replayable in the generated manifest.`);
  }
  switch (type) {
    case "thread-runtime-event":
      runtimeEventSchema.parse(event.event);
      break;
    case "thread-runtime-events":
      for (const nested of event.events as unknown[]) runtimeEventSchema.parse(nested);
      break;
    case "thread-runtime-events-multi":
      for (const batch of event.batches as Array<{ events: unknown[] }>) {
        for (const nested of batch.events) runtimeEventSchema.parse(nested);
      }
      break;
    case "agent-status-updated":
      agentStatusSchema.parse(event.status);
      break;
    case "windows-agent-statuses":
    case "wsl-agent-statuses":
      for (const status of event.statuses as unknown[]) agentStatusSchema.parse(status);
      break;
    case "remote-git-summaries":
      remoteGitSummariesEventSchema.parse(event);
      break;
    case "remote-git-state":
      remoteGitStateEventSchema.parse(event);
      break;
    case "remote-projects-changed":
      remoteProjectsChangedEventSchema.parse(event);
      break;
    case "remote-threads-changed":
      remoteThreadsChangedEventSchema.parse(event);
      break;
    case "remote-user-notification":
      remoteUserNotificationEventSchema.parse(event);
      break;
  }
}

export function assertEventFixtures(): void {
  const manifest = loadProtocolManifest();
  const runtime = allRuntimeEventFixtures();
  for (const event of runtime) runtimeEventSchema.parse(event);
  if (
    new Set(runtime.map((event) => event.type)).size !== manifest.webSocket.runtimeEventTypes.length
  ) {
    throw new Error("Runtime goldens do not cover the generated runtime-event inventory.");
  }
  const replayable = allReplayableEventFixtures();
  for (const event of replayable) validateReplayableEvent(event);
  if (replayable.length !== manifest.webSocket.replayableEventTypes.length) {
    throw new Error("Replay fixtures do not cover the generated replayable-event inventory.");
  }
}
