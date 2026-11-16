import type { WireLab } from "./wireLab.ts";
import type { CheckpointFixtureId } from "./controlFixtures.ts";
import { FIXTURE_THREAD_ID, buildRuntimeEvent, buildReplayableEvent } from "./labFixtures.ts";
import {
  composerControlAgentEvents,
  composerFamilyAgentEvent,
  machineProviderOrderAgentEvents,
} from "./composerFixtures.ts";
import { crewAgentEvents } from "./crewFixtures.ts";
import { modelVisibilityAgentEvents } from "./modelVisibilityFixtures.ts";

/** Controlled stories stay separate from peer ownership and transport lifecycle. */
export function applyLabCheckpoint(lab: WireLab, id: CheckpointFixtureId): void {
  if (id === "news-ready") {
    lab.news.prepare();
    return;
  }
  if (id === "agent-discovery-ready") {
    lab.workspace.agentDiscovery.prepare();
    return;
  }
  if (id === "agent-discovery-release") {
    lab.workspace.agentDiscovery.release();
    return;
  }
  if (id === "model-visibility-ready") {
    for (const event of modelVisibilityAgentEvents()) lab.publishEvent(event);
    return;
  }
  if (id === "provider-order-ready") {
    for (const event of machineProviderOrderAgentEvents()) lab.publishEvent(event);
    return;
  }
  if (id === "tool-presentation-ready") {
    lab.lifecycle.prepareToolPresentation();
    lab.publishEvent({ type: "remote-threads-changed", threadIds: [FIXTURE_THREAD_ID] });
    return;
  }
  if (id === "tool-presentation-live") {
    lab.publishEvent({
      type: "thread-runtime-event",
      threadId: FIXTURE_THREAD_ID,
      event: lab.lifecycle.updateToolPresentation(),
    });
    return;
  }
  if (id === "composer-controls-ready" || id === "composer-preferences-ready") {
    if (id === "composer-preferences-ready") lab.lifecycle.composerPreferencesEnabled = true;
    for (const event of composerControlAgentEvents()) lab.publishEvent(event);
    return;
  }
  if (id === "composer-family-ready") {
    lab.publishEvent(composerFamilyAgentEvent());
    return;
  }
  if (id === "composer-tools-ready") {
    lab.routes.prepareComposerTools();
    lab.lifecycle.composerTools.prepare();
    for (const event of composerControlAgentEvents()) lab.publishEvent(event);
    return;
  }
  if (id === "crews-ready") {
    lab.routes.prepareCrews();
    lab.lifecycle.prepareCrews();
    for (const event of crewAgentEvents()) lab.publishEvent(event);
    lab.publishEvent({ type: "remote-threads-changed", threadIds: [FIXTURE_THREAD_ID] });
    return;
  }
  if (id === "voice-ready") {
    lab.workspace.voice.enabled = true;
    for (const event of composerControlAgentEvents()) lab.publishEvent(event);
    return;
  }
  if (id === "workflow-liveness-ready") {
    lab.workspace.workflows.prepare();
    lab.lifecycle.prepareWorkflow();
    lab.publishEvent({ type: "remote-threads-changed", threadIds: [FIXTURE_THREAD_ID] });
    return;
  }
  if (id === "workflow-viewer-ready") {
    lab.workspace.workflows.prepareViewer();
    lab.lifecycle.prepareWorkflowViewer();
    lab.publishEvent({ type: "remote-threads-changed", threadIds: [FIXTURE_THREAD_ID] });
    return;
  }
  if (id === "workflow-results-stress-ready") {
    lab.workspace.workflows.prepareResultStress();
    lab.lifecycle.prepareWorkflowViewer(true);
    lab.publishEvent({ type: "remote-threads-changed", threadIds: [FIXTURE_THREAD_ID] });
    return;
  }
  if (id === "workflow-viewer-waiting") {
    lab.workspace.workflows.prepareViewer();
    lab.lifecycle.prepareWorkflowAwaitingReference();
    lab.publishEvent({ type: "remote-threads-changed", threadIds: [FIXTURE_THREAD_ID] });
    return;
  }
  if (id === "workflow-reference-ready") {
    lab.publishEvent({
      type: "thread-runtime-event",
      threadId: FIXTURE_THREAD_ID,
      event: lab.lifecycle.publishWorkflowReference(),
    });
    return;
  }
  if (id === "workflow-liveness-completed" || id === "workflow-liveness-failed") {
    // Deliberately no runtime/socket event: the read-only manifest poll must
    // retire activity even after the foreground tool call already ended.
    lab.workspace.workflows.complete(id === "workflow-liveness-failed");
    return;
  }
  if (id === "side-chat-ready") {
    lab.lifecycle.prepareSideChat();
    return;
  }
  if (id === "side-chat-parent-updated") {
    const item = lab.lifecycle.appendSideChatParentUpdate();
    lab.publishEvent({
      type: "thread-runtime-events",
      threadId: FIXTURE_THREAD_ID,
      events: [
        {
          ...buildRuntimeEvent("item.started"),
          itemId: item.id,
          itemType: item.type,
          payload: item.payload,
        },
        {
          ...buildRuntimeEvent("content.delta"),
          itemId: item.id,
          stream: "assistant_text",
          delta: "Parent context changed",
        },
        { ...buildRuntimeEvent("item.completed"), itemId: item.id, payload: item.payload },
      ],
    });
    return;
  }
  if (id === "thread-timing-ready" || id === "thread-timing-live") {
    lab.lifecycle.prepareTurnTiming(id === "thread-timing-live");
    const snapshot = lab.lifecycle.shellSnapshot(lab.ring.seq, lab.ring.epoch);
    const thread = (snapshot.threads as Array<Record<string, unknown>>)[0]!;
    lab.publishEvent({
      type: "thread-state",
      threadId: thread.id,
      status: thread.status,
      attention: thread.attention,
      activeTurnStartedAt: thread.activeTurnStartedAt,
      lastTurnStartedAt: thread.lastTurnStartedAt,
      lastTurnEndedAt: thread.lastTurnEndedAt,
    });
    return;
  }
  if (id === "session-import-ready") {
    lab.workspace.prepareSessionImport();
    return;
  }
  if (id === "seed-replay-two-events") {
    lab.publishEvent(buildReplayableEvent("thread-state"));
    lab.publishEvent(buildReplayableEvent("thread-state"));
    return;
  }
  if (id === "seed-pairing") {
    lab.issuePairingCredential();
    return;
  }
  if (id === "expire-pairing") {
    lab.auth.expireAllPairing();
    lab.consumePairingSecretFile();
    return;
  }
  lab.auth.expireAllTickets();
}
