import type { OscShellEvent } from "../osc";
import type { LspSessionStatus } from "../lsp";
import type {
  AgentSlashCommand,
  AgentStatus,
  PendingSteerState,
  RuntimeEvent,
  StartThreadPayload,
  Thread,
  ThreadAttention,
  ThreadConfig,
  ThreadStatus,
  ThreadStatusSource,
  UsageLoginConfirmationRequest,
  UsageLoginDeviceCode,
  UsageSnapshot,
} from "../contracts";
import type { BrowserState, BrowserTabInfo } from "./procedures/browser";
import type { BrowserLinkPresentationMode } from "../settings";
import type { IpcProcedurePayload, SupervisorProcedureName } from "./procedureMap";

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
  /**
   * Emitted by the supervisor's orchestrator lane (subagents MCP
   * `create_thread`) when an agent thread asks for a first-class child thread.
   * The main process owns the rest of the flow, mirroring the remote-start
   * path: it resolves `projectId` from the parent's DB row, upserts the child
   * row, mirrors it to the renderer (`remoteThreadCommand` "start" with
   * `launchRuntime: false`), then calls the supervisor's `startThread` with
   * `start`. This event is consumed in main and never forwarded to the
   * renderer or remote clients.
   */
  | {
      type: "orchestrator-thread-created";
      parentThreadId: string;
      /** Child thread row, complete except `projectId` (main fills it from the parent's row). */
      thread: Omit<Thread, "projectId">;
      /** Ready-to-send supervisor `startThread` payload for the child. */
      start: StartThreadPayload;
      /** True when `create_thread` just created the child's git worktree. */
      isNewWorktree?: boolean;
      /**
       * True when the caller supplied an explicit title (vs. a prompt-derived
       * one). Main forwards the title to the renderer only in this case, so a
       * custom title stays authoritative and suppresses AI title generation.
       */
      hasCustomTitle?: boolean;
    }
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

/** Emitted by the main process when the user clicks an OS notification. */
export type NotificationClickEvent = {
  threadId: string;
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
  | { type: "error"; message: string };
