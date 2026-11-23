import type { BackgroundTaskStage } from "../harness/backgroundTaskLab.ts";
import type {
  CheckpointFixtureId,
  FaultFixtureId,
  FrameFixtureId,
} from "../harness/controlFixtures.ts";

export interface MobileSmokeStage {
  readonly id: string;
  readonly block: string;
  readonly summary: string;
  readonly resetFirst?: boolean;
  readonly clearFaults?: boolean;
  readonly checkpoints?: readonly CheckpointFixtureId[];
  readonly frames?: readonly FrameFixtureId[];
  readonly faults?: readonly FaultFixtureId[];
  readonly backgroundTaskStage?: BackgroundTaskStage;
  readonly seedMultihost?: boolean;
  readonly notifyThreadChanged?: boolean;
}

/**
 * Canonical mobile manual smoke stages.
 *
 * PWA (compact mobile web layout) is the source of truth; iOS and Android run
 * the exact same stage sequence against the same shared WireLab smoke host.
 * Stages are ordered topologically to minimize backtracking and keep a full
 * cross-platform pass fast.
 */
export const MOBILE_SMOKE_STAGES: readonly MobileSmokeStage[] = [
  {
    id: "base",
    block: "Block 0-1 & 4-6",
    summary:
      "Golden smoke baseline: projects, threads, composer controls, crews, notes, actions, PR metadata, worktrees, environments, news, changelog, voice, import, agent discovery.",
    clearFaults: true,
    checkpoints: [
      "composer-controls-ready",
      "composer-preferences-ready",
      "composer-tools-ready",
      "crews-ready",
      "project-notes-ready",
      "project-actions-ready",
      "worktree-settings-ready",
      "environment-management-ready",
      "pull-request-metadata-ready",
      "pull-request-guide-ready",
      "session-import-ready",
      "voice-ready",
      "news-ready",
      "changelog-good",
      "model-visibility-ready",
      "provider-order-ready",
      "agent-discovery-ready",
      "thread-timing-ready",
      "thread-history-changes-ready",
    ],
    notifyThreadChanged: true,
  },
  {
    id: "tools",
    block: "Block 2 (Transcript)",
    summary: "Rich tool presentation cards: commands, diffs, file changes, disclosure sections.",
    checkpoints: ["tool-presentation-ready"],
    notifyThreadChanged: true,
  },
  {
    id: "patch",
    block: "Block 2 (Transcript)",
    summary: "Multi-file patch cards in transcript.",
    checkpoints: ["tool-multi-file-patch-ready"],
    notifyThreadChanged: true,
  },
  {
    id: "same-file",
    block: "Block 2 (Transcript)",
    summary: "Grouped same-file edit cards in transcript.",
    checkpoints: ["tool-same-file-edits-ready"],
    notifyThreadChanged: true,
  },
  {
    id: "code",
    block: "Block 2 (Transcript)",
    summary: "Syntax-highlighted code blocks and copy actions in transcript.",
    checkpoints: ["transcript-code-ready"],
    notifyThreadChanged: true,
  },
  {
    id: "table",
    block: "Block 2 (Transcript)",
    summary: "Wide horizontal-scroll Markdown table in transcript.",
    checkpoints: ["transcript-wide-table-ready"],
    notifyThreadChanged: true,
  },
  {
    id: "media",
    block: "Block 2 (Transcript)",
    summary: "Image gallery and full-screen media lightbox in transcript.",
    checkpoints: ["transcript-image-gallery-ready"],
    notifyThreadChanged: true,
  },
  {
    id: "video",
    block: "Block 2 (Transcript)",
    summary: "Embedded video attachment and playback card in transcript.",
    checkpoints: ["transcript-video-ready"],
    notifyThreadChanged: true,
  },
  {
    id: "pdf",
    block: "Block 2 (Transcript)",
    summary: "PDF attachment card and preview in transcript.",
    checkpoints: ["transcript-pdf-held", "transcript-file-release"],
    notifyThreadChanged: true,
  },
  {
    id: "files",
    block: "Block 2 (Transcript)",
    summary: "Editable file citations and attachment cards in transcript.",
    checkpoints: ["transcript-editable-files-ready"],
    notifyThreadChanged: true,
  },
  {
    id: "source-link",
    block: "Block 2 (Transcript)",
    summary: "Clickable source file/line link citations in transcript.",
    checkpoints: ["transcript-source-link-ready"],
    notifyThreadChanged: true,
  },
  {
    id: "visuals",
    block: "Block 2 (Transcript)",
    summary: "Interactive HTML visual card in transcript.",
    checkpoints: ["transcript-html-visual-ready"],
    notifyThreadChanged: true,
  },
  {
    id: "mcp-app",
    block: "Block 2 (Transcript)",
    summary: "Interactive MCP App card in transcript.",
    checkpoints: ["transcript-mcp-app-ready"],
    notifyThreadChanged: true,
  },
  {
    id: "find",
    block: "Block 2 (Transcript)",
    summary: "Long assistant reply for in-thread Find and scroll-to-bottom checks.",
    checkpoints: ["chat-find-long-reply"],
    notifyThreadChanged: true,
  },
  {
    id: "handoff",
    block: "Block 2 (Composer)",
    summary: "Provider switch and handoff controls on active thread.",
    checkpoints: ["provider-switch-ready", "provider-handoff-ready"],
    notifyThreadChanged: true,
  },
  {
    id: "bg-progress",
    block: "Block 2 (Background Tasks)",
    summary: "Advance background task roster to active progress state.",
    backgroundTaskStage: "progress",
  },
  {
    id: "bg-drain",
    block: "Block 2 (Background Tasks)",
    summary: "Drain background task roster to empty/completed state.",
    backgroundTaskStage: "drain",
  },
  {
    id: "keyboard",
    block: "Block 6 (Shortcuts)",
    summary: "Seed keyboard shortcuts workspace state.",
    checkpoints: ["keyboard-workspace-ready"],
  },
  {
    id: "live",
    block: "Block 2 (Live Stream)",
    summary:
      "Active streaming turn, live tool activity, pending steer, and completion notification.",
    checkpoints: ["thread-timing-live", "tool-activity-start", "tool-activity-append"],
    frames: [
      "runtime-live-turn-started",
      "runtime-live-user-item-started",
      "runtime-live-item-started",
      "runtime-live-content-delta",
      "event-thread-pending-steer",
      "event-notification-attention",
    ],
  },
  {
    id: "live-done",
    block: "Block 2 (Live Stream)",
    summary:
      "Finish streaming tool activity, clear pending steer, and emit completion notification.",
    checkpoints: ["tool-activity-finish"],
    frames: ["event-thread-pending-steer-cleared", "event-thread-state", "event-notification-done"],
  },
  {
    id: "approval",
    block: "Block 2 (Requests)",
    summary: "Open long scrollable tool permission approval prompt on active thread.",
    checkpoints: ["long-approval-ready"],
  },
  {
    id: "question",
    block: "Block 2 (Requests)",
    summary: "Open structured multi-question user-input form on active thread.",
    checkpoints: ["request-form-question-ready"],
  },
  {
    id: "elicitation",
    block: "Block 2 (Requests)",
    summary: "Open MCP structured elicitation form on active thread.",
    checkpoints: ["request-form-elicitation-ready"],
  },
  {
    id: "resolve",
    block: "Block 2 (Requests)",
    summary: "Resolve any open approval/question/elicitation request.",
    checkpoints: ["long-approval-resolved", "request-form-resolved"],
  },
  {
    id: "sidechat",
    block: "Block 2 (Side Chat)",
    summary: "Seed Side Chat drawer/sheet and trigger parent-thread context update.",
    checkpoints: ["side-chat-ready", "side-chat-parent-updated"],
    notifyThreadChanged: true,
  },
  {
    id: "terminal",
    block: "Block 3 (Terminal)",
    summary: "Switch fixture thread to terminal mode and stream live PTY output.",
    checkpoints: ["terminal-thread-ready"],
    frames: ["terminal-output"],
    notifyThreadChanged: true,
  },
  {
    id: "pr",
    block: "Block 4-5 (Git & PRs)",
    summary: "Seed Pull Request creation flow, metadata, and AI PR guide.",
    checkpoints: [
      "pull-request-creation-ready",
      "pull-request-metadata-ready",
      "pull-request-guide-ready",
    ],
  },
  {
    id: "workflow",
    block: "Block 5 (Workflows)",
    summary: "Seed GitHub Actions / Workflow viewer with active run.",
    checkpoints: ["workflow-viewer-ready"],
    notifyThreadChanged: true,
  },
  {
    id: "workflow-waiting",
    block: "Block 5 (Workflows)",
    summary: "Workflow awaiting reference state.",
    checkpoints: ["workflow-viewer-waiting"],
    notifyThreadChanged: true,
  },
  {
    id: "workflow-failed",
    block: "Block 5 (Workflows)",
    summary: "Workflow failed completion state.",
    checkpoints: ["workflow-liveness-failed"],
  },
  {
    id: "workflow-done",
    block: "Block 5 (Workflows)",
    summary: "Workflow succeeded completion state.",
    checkpoints: ["workflow-liveness-completed"],
  },
  {
    id: "multihost",
    block: "Block 6 (Connections)",
    summary: "Start second collision host for multi-host switcher and host-scoped settings.",
    seedMultihost: true,
  },
  {
    id: "fault-error",
    block: "Block 6-7 (Error States)",
    summary: "Inject changelog load error state.",
    checkpoints: ["changelog-error"],
  },
  {
    id: "fault-offline",
    block: "Block 7 (Offline/Reconnect)",
    summary: "Drop active sockets and delay reconnect tickets to inspect offline/reconnecting UI.",
    checkpoints: ["transcript-editable-files-reconnect"],
  },
  {
    id: "fault-clear",
    block: "Block 7 (Recovery)",
    summary: "Clear all injected faults and restore changelog so all clients recover.",
    clearFaults: true,
    checkpoints: ["changelog-good"],
  },
];

export const MOBILE_SMOKE_STAGE_BY_ID: ReadonlyMap<string, MobileSmokeStage> = new Map(
  MOBILE_SMOKE_STAGES.map((stage) => [stage.id, stage]),
);

export function getMobileSmokeStage(id: string): MobileSmokeStage | undefined {
  return MOBILE_SMOKE_STAGE_BY_ID.get(id.trim().toLowerCase());
}
