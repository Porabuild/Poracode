import type { OscShellEvent } from "../osc";
import type { LspSessionStatus } from "../lsp";
import type {
  AgentSlashCommand,
  AgentStatus,
  PendingSteerState,
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
  | { type: "ssh-agent-statuses"; statuses: AgentStatus[] }
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

export type BrowserEvent =
  | { type: "state"; state: BrowserState }
  | { type: "tab-updated"; tab: BrowserTabInfo }
  | { type: "tab-attention"; tabId: string }
  | { type: "open-panel"; mode?: BrowserLinkPresentationMode }
  | { type: "usage-login-confirmation"; request: UsageLoginConfirmationRequest }
  | { type: "usage-login-confirmation-closed"; requestId: string }
  | { type: "usage-login-device-code"; deviceCode: UsageLoginDeviceCode }
  | { type: "usage-login-device-code-cleared"; providerId: string }
  | { type: "picker-cancelled" };

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
