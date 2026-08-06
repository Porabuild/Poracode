import type { OscShellEvent } from "../osc";
import type { LspSessionStatus } from "../lsp";
import type {
  AgentSlashCommand,
  AgentStatus,
  PendingSteerState,
  PrData,
  PrDetails,
  Project,
  RuntimeEvent,
  ThreadAttention,
  ThreadConfig,
  ThreadStatus,
  ThreadStatusSource,
  UsageLoginConfirmationRequest,
  UsageLoginDeviceCode,
  UsageSnapshot,
} from "../contracts";
import type { BrowserState, BrowserTabInfo } from "./procedures/browser";
import type { BrowserLinkPresentationMode, CrossagentRoutingOverride } from "../settings";
import type { IpcProcedurePayload, SupervisorProcedureName } from "./procedureMap";
import type { MessageKey } from "../messages";

export type SupervisorRequest = {
  [Name in SupervisorProcedureName]: {
    id: string;
    type: Name;
    payload: IpcProcedurePayload<Name>;
  };
}[SupervisorProcedureName];

export type SupervisorReply =
  | { replyTo: string; ok: true; data: unknown }
  | { replyTo: string; ok: false; error: string };

export type SupervisorEvent =
  | {
      type: "crossagent-routing-override-changed";
      requestId: string;
      change:
        | { action: "set"; override: CrossagentRoutingOverride }
        | { action: "remove"; tags: string[] };
    }
  | {
      type: "crossagent-selection-used";
      selections: Array<{
        agentKind: string;
        modelId: string;
        effort?: string;
        fast: boolean;
        tags?: string[];
        explicitFields: {
          provider: boolean;
          model: boolean;
          effort: boolean;
          fast: boolean;
        };
      }>;
    }
  | {
      type: "experiment-judge-progress";
      experimentId: string;
      progress:
        | {
            kind: "captured";
            threadId: string;
            files: number;
            insertions: number;
            deletions: number;
            omittedFiles?: number;
          }
        | {
            kind: "captured-response";
            threadId: string;
            characters: number;
          }
        | { kind: "judging" };
    }
  | { type: "thread-reset"; threadId: string }
  | { type: "thread-output"; threadId: string; data: string; outputLength: number }
  | { type: "thread-runtime-event"; threadId: string; event: RuntimeEvent }
  | { type: "thread-runtime-events"; threadId: string; events: RuntimeEvent[] }
  | {
      type: "thread-runtime-events-multi";
      batches: ReadonlyArray<{ threadId: string; events: RuntimeEvent[] }>;
    }
  | {
      type: "thread-state";
      threadId: string;
      status: ThreadStatus;
      attention: ThreadAttention;
      config?: ThreadConfig;
      /** Effective launch-time config after plugin and global MCP policy is applied. */
      launchConfig?: ThreadConfig;
      sessionRef?: { providerSessionId: string; discoveredAt: string };
      canResumeWithConfig: boolean;
      errorMessage?: string;
      slashCommands?: AgentSlashCommand[];
      forceCloseActiveTurn?: boolean;
      threadStatusSource?: ThreadStatusSource;
    }
  | {
      type: "thread-pending-steer";
      threadId: string;
      pending: PendingSteerState | null;
    }
  | { type: "thread-exited"; threadId: string; exitCode: number | null }
  | {
      type: "thread-osc-notification";
      threadId: string;
      title: string;
      body: string;
    }
  | {
      type: "thread-osc-shell";
      threadId: string;
      event: OscShellEvent;
    }
  | { type: "windows-agent-statuses"; statuses: AgentStatus[] }
  | { type: "wsl-agent-statuses"; statuses: AgentStatus[] }
  | { type: "agent-detected"; status: AgentStatus }
  | { type: "agent-status-updated"; status: AgentStatus }
  | { type: "provider-usage"; snapshot: UsageSnapshot }
  | { type: "provider-usage-all"; snapshots: UsageSnapshot[] }
  | { type: "git-changed"; projectId: string }
  | { type: "project-tree-changed"; projectId: string }
  | { type: "lsp-message"; sessionId: string; message: unknown }
  | {
      type: "lsp-status";
      sessionId: string;
      status: LspSessionStatus;
      languageId: string;
      error?: string;
    };

const AGENT_STATUS_SUPERVISOR_EVENT_TYPES = [
  "agent-detected",
  "agent-status-updated",
  "windows-agent-statuses",
  "wsl-agent-statuses",
] as const;

export type AgentStatusSupervisorEvent = Extract<
  SupervisorEvent,
  { type: (typeof AGENT_STATUS_SUPERVISOR_EVENT_TYPES)[number] }
>;

/** Agent install/detection updates — the subset the quick composer overlay consumes. */
export function isAgentStatusSupervisorEvent(
  event: SupervisorEvent,
): event is AgentStatusSupervisorEvent {
  return (AGENT_STATUS_SUPERVISOR_EVENT_TYPES as readonly string[]).includes(event.type);
}

export type BrowserEvent =
  | { type: "state"; state: BrowserState }
  | { type: "tab-updated"; tab: BrowserTabInfo }
  | { type: "tab-attention"; tabId: string }
  | { type: "open-panel"; mode?: BrowserLinkPresentationMode }
  | { type: "usage-login-confirmation"; request: UsageLoginConfirmationRequest }
  | { type: "usage-login-confirmation-closed"; requestId: string }
  | { type: "usage-login-device-code"; deviceCode: UsageLoginDeviceCode }
  | { type: "usage-login-device-code-cleared"; providerId: string }
  | { type: "picker-cancelled" }
  // Headless agent activity: while active the renderer keeps the browser's
  // <webview>s mounted off-screen (so tabs can be driven with the panel closed);
  // when it goes idle the renderer unmounts them to free resources.
  | { type: "automation-active"; active: boolean };

/** Emitted by the main process when a native app surface requests opening a thread. */
export type ThreadOpenRequestedEvent = {
  threadId: string;
  /** Present for OS notification clicks; omitted by tray and app-control opens. */
  source?: "notification";
};

/** Project rows changed outside the renderer's persisted app-store snapshot. */
export type ProjectStateChangedEvent = {
  projects: Project[];
};

/** Successful desktop PR automation merge; consumed once by the runtime-owner renderer. */
export type PrWatchMergedEvent = {
  projectId: string;
  prNumber: number;
  worktreePath?: string;
};

/**
 * Live PR state seen by the desktop PR-watch loop on one of its polls. The loop
 * always refetches the PR and fetches details when needed, so forwarding what it
 * saw keeps the renderer's cached snapshot honest — including the open→merged
 * flip an auto-merge performs behind the UI's back — without extra `gh` calls.
 */
export type PrWatchStatusEvent = {
  projectId: string;
  prNumber: number;
  headBranch: string;
  worktreePath?: string;
  pr: PrData;
  details?: PrDetails;
};

export type UpdateStatus =
  | { type: "checking" }
  | { type: "update-available"; version: string }
  | { type: "update-not-available" }
  | {
      type: "downloading";
      percent: number;
      bytesPerSecond: number;
      transferred: number;
      total: number;
    }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string; messageKey?: never }
  | { type: "error"; messageKey: MessageKey; message?: never };
