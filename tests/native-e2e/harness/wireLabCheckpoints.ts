import type { WireLab } from "./wireLab.ts";
import type { CheckpointFixtureId } from "./controlFixtures.ts";
import { FIXTURE_THREAD_ID, buildRuntimeEvent, buildReplayableEvent } from "./labFixtures.ts";
import {
  composerControlAgentEvents,
  composerFamilyAgentEvent,
  machineProviderOrderAgentEvents,
  providerHandoffAgentEvents,
} from "./composerFixtures.ts";
import { crewAgentEvents } from "./crewFixtures.ts";
import { modelVisibilityAgentEvents } from "./modelVisibilityFixtures.ts";

/** Controlled stories stay separate from peer ownership and transport lifecycle. */
export function applyLabCheckpoint(lab: WireLab, id: CheckpointFixtureId): void {
  if (id === "tool-same-file-edits-ready") {
    lab.lifecycle.prepareSameFileEdits();
    return;
  }
  if (id === "tool-multi-file-patch-ready") {
    lab.lifecycle.prepareToolPresentation({ multiFilePatch: true });
    return;
  }
  if (
    id === "request-form-question-ready" ||
    id === "request-form-elicitation-ready" ||
    id === "request-form-resolved"
  ) {
    const event =
      id === "request-form-resolved"
        ? { ...buildRuntimeEvent("request.resolved"), outcome: "answered" }
        : {
            ...buildRuntimeEvent("request.opened"),
            requestType: "tool_user_input",
            payload: {
              summary: "Fixture input requested",
              details:
                id === "request-form-question-ready"
                  ? {
                      userInputForm: {
                        questions: [
                          {
                            id: "color",
                            header: "Fixture color",
                            question: "Choose a color.",
                            options: [
                              { optionId: "green", label: "Green" },
                              { optionId: "blue", label: "Blue" },
                            ],
                          },
                          {
                            id: "caption",
                            header: "Fixture caption",
                            question: "What should the fixture say?",
                          },
                        ],
                      },
                    }
                  : {
                      structuredElicitation: {
                        sourceText: "Fixture MCP connector",
                        mode: "form",
                        message: "Set a reading preference.",
                        requestedSchema: {
                          type: "object",
                          required: ["mode"],
                          properties: {
                            mode: {
                              type: "string",
                              title: "Reading mode",
                              oneOf: [
                                { const: "brief", title: "Brief" },
                                { const: "detailed", title: "Detailed" },
                              ],
                            },
                          },
                        },
                        _meta: { fixture: "retained" },
                      },
                    },
            },
          };
    lab.lifecycle.setFixtureApproval(event);
    lab.emit({ kind: "runtime", threadId: FIXTURE_THREAD_ID, runtimeEvent: event });
    return;
  }
  if (id === "long-approval-ready" || id === "long-approval-resolved") {
    const event =
      id === "long-approval-ready"
        ? {
            ...buildRuntimeEvent("request.opened"),
            payload: {
              summary: [
                "Review the fixture inspection",
                ...Array.from({ length: 24 }, (_, index) => `Inspection step ${index + 1}`),
              ].join("\n"),
              details: {
                output: Array.from({ length: 18 }, (_, index) => `Fixture detail ${index + 1}`),
              },
            },
          }
        : buildRuntimeEvent("request.resolved");
    // History can be reloaded while the device moves between displays.
    lab.lifecycle.setFixtureApproval(event);
    lab.emit({ kind: "runtime", threadId: FIXTURE_THREAD_ID, runtimeEvent: event });
    return;
  }
  if (id === "transcript-file-held") {
    lab.lifecycle.prepareTranscriptFile();
    lab.routes.holdAttachment();
    return;
  }
  if (id === "transcript-bare-download-held") {
    lab.lifecycle.prepareTranscriptEditableFiles();
    lab.workspace.prepareTranscriptEditableFiles();
    const path = "reports/audit notes.txt";
    const file = lab.workspace.invoke("readProjectFile", { path }) as { content: string };
    lab.routes.prepareTranscriptTextDownload(path, file.content);
    lab.routes.holdAttachment();
    return;
  }
  if (id === "transcript-file-release") {
    lab.routes.releaseAttachment();
    return;
  }
  if (id === "transcript-editable-files-ready") {
    lab.lifecycle.prepareTranscriptEditableFiles();
    lab.workspace.prepareTranscriptEditableFiles();
    return;
  }
  if (id === "transcript-editable-files-reconnect") {
    lab.faults.set({ kind: "delay-ticket", delayMs: 2200 });
    lab.disconnectFixtureSockets();
    return;
  }
  if (id === "transcript-video-ready" || id === "transcript-video-held") {
    lab.lifecycle.prepareTranscriptVideo();
    lab.routes.prepareTranscriptVideo();
    if (id === "transcript-video-held") lab.routes.holdAttachment();
    return;
  }
  if (id === "transcript-pdf-held") {
    lab.lifecycle.prepareTranscriptPdf();
    lab.routes.prepareTranscriptPdf();
    lab.routes.holdAttachment();
    return;
  }
  if (id === "transcript-html-visual-ready") {
    lab.lifecycle.prepareTranscriptHtmlVisual();
    return;
  }
  if (id === "transcript-mcp-app-ready") {
    lab.lifecycle.prepareTranscriptMcpApp();
    return;
  }
  if (id === "thread-history-changes-ready") {
    lab.lifecycle.prepareThreadHistoryChanges();
    return;
  }
  if (id === "transcript-wide-table-ready") {
    lab.lifecycle.prepareTranscriptWideTable();
    return;
  }
  if (id === "transcript-code-ready") {
    lab.lifecycle.prepareTranscriptCode();
    return;
  }
  if (id === "transcript-source-link-ready") {
    lab.lifecycle.prepareTranscriptSourceLink();
    lab.workspace.prepareLinkedSourceFile("Nightly");
    return;
  }
  if (id === "transcript-image-ready" || id === "transcript-image-gallery-ready") {
    lab.lifecycle.prepareTranscriptImage(id === "transcript-image-gallery-ready");
    return;
  }
  if (id === "project-notes-ready") {
    lab.lifecycle.prepareProjectNotes();
    return;
  }
  if (id === "terminal-thread-ready") {
    lab.lifecycle.prepareTerminalThread();
    return;
  }
  if (id === "project-notes-desktop-edit") {
    lab.lifecycle.prepareProjectNotes("Saved on the paired desktop");
    return;
  }
  if (id === "project-actions-ready") {
    lab.lifecycle.prepareProjectActions();
    return;
  }
  if (id === "project-actions-desktop-edit") {
    lab.lifecycle.editProjectActionsFromDesktop();
    const { projects } = lab.lifecycle.shellSnapshot(lab.ring.seq, lab.ring.epoch);
    lab.publishEvent({ type: "remote-projects-changed", projects });
    return;
  }
  if (id === "project-actions-assert-save") {
    lab.lifecycle.assertProjectActionsSaved();
    return;
  }
  if (id === "hold-project-file-save") {
    lab.workspace.holdProjectFileSave();
    lab.lifecycle.renameFixtureProject("File Save Fixture Project");
    return;
  }
  if (id === "release-project-file-save") {
    lab.workspace.releaseProjectFileSave();
    return;
  }
  if (id === "pull-request-guide-ready") {
    lab.workspace.preparePullRequestGuide();
    lab.publishEvent({
      type: "agent-status-updated",
      status: {
        kind: "fixture-guide",
        label: "Fixture Guide Agent",
        installed: true,
        authState: "authenticated",
        envKind: "posix",
        capabilities: {
          models: [{ id: "fixture-guide-model", label: "Fixture Guide Model" }],
          supportsReadOnlyOneShotWorkspace: true,
        },
      },
    });
    return;
  }
  if (id === "pull-request-metadata-ready") {
    lab.workspace.preparePullRequestMetadata();
    return;
  }
  if (id === "pull-request-creation-ready") {
    lab.workspace.preparePullRequestCreation();
    lab.lifecycle.renameFixtureProject("PR Fixture Project");
    return;
  }
  if (id === "environment-management-ready") {
    lab.routes.prepareEnvironmentManagement();
    return;
  }
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
  if (id === "tool-presentation-ready" || id === "tool-disclosure-ready") {
    lab.lifecycle.prepareToolPresentation({ withResult: id === "tool-presentation-ready" });
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
  if (
    id === "tool-activity-start" ||
    id === "tool-activity-append" ||
    id === "tool-activity-finish" ||
    id === "tool-activity-burst" ||
    id === "tool-activity-burst-finish"
  ) {
    lab.publishEvent({
      type: "thread-runtime-events",
      threadId: FIXTURE_THREAD_ID,
      events: lab.lifecycle.advanceToolActivity(id),
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
  if (id === "worktree-settings-ready" || id === "worktree-settings-desktop-edit") {
    lab.routes.setWorktreeSettingsFixture(id === "worktree-settings-desktop-edit");
    return;
  }
  if (id === "crews-ready") {
    lab.routes.prepareCrews();
    lab.lifecycle.prepareCrews();
    for (const event of crewAgentEvents()) lab.publishEvent(event);
    lab.publishEvent({ type: "remote-threads-changed", threadIds: [FIXTURE_THREAD_ID] });
    return;
  }
  if (id === "provider-handoff-ready") {
    lab.lifecycle.providerHandoffEnabled = true;
    for (const event of providerHandoffAgentEvents()) lab.publishEvent(event);
    return;
  }
  if (id === "provider-switch-ready") {
    lab.lifecycle.prepareProviderSwitchSource();
    for (const event of composerControlAgentEvents()) lab.publishEvent(event);
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
  if (id === "keyboard-workspace-ready") {
    lab.workspace.prepareKeyboardWorkspace();
    return;
  }
  if (id === "chat-find-long-reply") {
    lab.lifecycle.prepareLongFindReply();
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
