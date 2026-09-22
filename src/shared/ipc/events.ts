import type { OscShellEvent } from "../osc";
import type { LiveVoiceEvent } from "../contracts/liveVoice";
import type { LspSessionStatus } from "../lsp";
import type {
  AgentSlashCommand,
  AgentStatus,
  PendingSteerState,
  PrData,
  PrDetails,
  RuntimeEvent,
  ThreadAttention,
  ThreadConfig,
  ThreadFollowUpQueueState,
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

/**
 * Trusted parent-to-supervisor flow control; kept outside the procedure RPC
 * map. Two planes are deliberately distinct:
 * - `set-output-backpressure` (B3): client-socket pressure sheds rebuildable
 *   terminal output at the source.
 * - `set-event-backpressure` (B1): host persistence health stops canonical
 *   runtime production. A supervisor that has not advertised
 *   `SupervisorFlowControlCapabilities.versions` containing 1 must never
 *   receive this control: a released binary that only knows the first plane
 *   would misread it as output pressure and shed terminal bytes.
 */
export type SupervisorFlowControl =
  | { control: "set-output-backpressure"; paused: boolean }
  | {
      control: "set-event-backpressure";
      paused: boolean;
      reason?: "host-persistence-degraded" | "host-persistence-refusing";
      /**
       * Additive optional: stop only these threads' canonical producers. A peer
       * that ignores the field pauses globally (the safe degradation). Used for
       * per-thread admission refusals so one thread's overflow never stops
       * unrelated sessions.
       */
      threadIds?: string[];
      /**
       * Additive optional: the host's credit window for canonical bytes the
       * supervisor has emitted but the host has not yet acknowledged. The
       * supervisor only enforces it when it advertised `supportsCanonicalCredit`;
       * an old supervisor ignores it and stays on the static advertisement.
       */
      canonicalCreditBytes?: number;
      /**
       * Additive optional: highest canonical `flowSeq` the host has fully
       * admitted or refused. The supervisor frees the corresponding ledger
       * bytes (including anything still in kernel/receiver buffers).
       */
      canonicalAckSeq?: number;
      /**
       * Additive optional: the supervisor boot generation the credit window
       * applies to (from `SupervisorFlowControlCapabilities`). Acks and windows
       * from any other generation are ignored, so a restarted supervisor can
       * never free ledger bytes for a pre-restart flow sequence.
       */
      canonicalFlowGeneration?: string;
    }
  | {
      /**
       * Additive optional control (only sent to a peer that advertised
       * `supportsCanonicalCredit`): advance the acknowledged flow prefix
       * without changing producer pause state. Sent after the host's persist
       * outcome for the envelope, so it can never ack bytes the host did not
       * admit or explicitly refuse.
       */
      control: "ack-canonical-flow";
      ackSeq: number;
      generation: string;
    };

/** Supervisor→host capability advertisement, emitted once per boot. */
export interface SupervisorFlowControlCapabilities {
  kind: "supervisor-flow-control-capabilities";
  versions: number[];
  /**
   * Additive optional: the supervisor's own retained canonical bound (sender
   * bulk queue + one maximum envelope + control reserve). The host uses it for
   * the pause arithmetic when the peer advertises it and falls back to a
   * conservative constant otherwise.
   */
  maxInFlightBytes?: number;
  /** Additive optional: the largest single canonical envelope the supervisor emits. */
  maxEnvelopeBytes?: number;
  /**
   * Additive optional: this supervisor tracks host credit/ack for canonical
   * bytes. The host grants a window and acks only when this is true, so an old
   * supervisor is never told about a window it does not honor.
   */
  supportsCanonicalCredit?: boolean;
  /**
   * Additive optional: this supervisor process's boot generation. The host
   * echoes it on every credit grant and ack; a value that does not match the
   * current boot is ignored by the supervisor's credit ledger.
   */
  canonicalFlowGeneration?: string;
}

export const SUPERVISOR_EVENT_BACKPRESSURE_VERSION = 1 as const;

export function isSupervisorFlowControlCapabilities(
  message: unknown,
): message is SupervisorFlowControlCapabilities {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Record<string, unknown>;
  return (
    candidate.kind === "supervisor-flow-control-capabilities" &&
    Array.isArray(candidate.versions) &&
    candidate.versions.every((version) => typeof version === "number")
  );
}

export function isSupervisorFlowControl(message: unknown): message is SupervisorFlowControl {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Record<string, unknown>;
  if (candidate.control === "ack-canonical-flow") {
    return (
      typeof candidate.ackSeq === "number" &&
      Number.isFinite(candidate.ackSeq) &&
      typeof candidate.generation === "string" &&
      candidate.generation.length > 0
    );
  }
  return (
    (candidate.control === "set-output-backpressure" ||
      candidate.control === "set-event-backpressure") &&
    typeof candidate.paused === "boolean"
  );
}

/**
 * Canonical flow identity of an envelope, if it carries one. Only a positive
 * finite integer is meaningful; a malformed value is treated as absent rather
 * than as a flow that could ack a different sequence.
 */
export function canonicalFlowSeqOf(event: SupervisorEvent): number | undefined {
  if (
    event.type !== "thread-runtime-event" &&
    event.type !== "thread-runtime-events" &&
    event.type !== "thread-runtime-events-multi"
  ) {
    return undefined;
  }
  const flowSeq = event.flowSeq;
  return typeof flowSeq === "number" && Number.isInteger(flowSeq) && flowSeq > 0
    ? flowSeq
    : undefined;
}

export type SupervisorReply =
  | { replyTo: string; ok: true; data: unknown }
  | {
      replyTo: string;
      ok: false;
      error: string;
      /**
       * Additive typed admission-refusal code (e.g. `host_resource_busy`,
       * `git_admission_queue_full`). Older supervisors omit both fields and
       * the host degrades to a plain message-only Error; newer hosts rehydrate
       * `code`/`retryAfterMs` onto the rejected error. No reply version exists
       * and `isSupervisorReply` keys only on `replyTo`.
       */
      errorCode?: string;
      /** Additive Retry-After hint (ms) for a retryable admission refusal. */
      retryAfterMs?: number;
    };

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
  | { type: "thread-voice"; threadId: string; event: LiveVoiceEvent }
  | { type: "thread-scrollback-resync"; threadId: string }
  | {
      type: "thread-output";
      threadId: string;
      data: string;
      outputLength: number;
      /** Terminal instance/generation id; batching must not coalesce across this. */
      terminalInstanceId: string;
    }
  | {
      type: "thread-runtime-event";
      threadId: string;
      event: RuntimeEvent;
      /** Host-credited canonical flow identity (additive; ignored by old hosts). */
      flowSeq?: number;
      flowBytes?: number;
    }
  | {
      type: "thread-runtime-events";
      threadId: string;
      events: RuntimeEvent[];
      flowSeq?: number;
      flowBytes?: number;
    }
  | {
      type: "thread-runtime-events-multi";
      batches: ReadonlyArray<{ threadId: string; events: RuntimeEvent[] }>;
      flowSeq?: number;
      flowBytes?: number;
    }
  | {
      type: "thread-state";
      threadId: string;
      status: ThreadStatus;
      attention: ThreadAttention;
      /**
       * Provider that owns the session this state came from. A thread can be
       * switched to another provider in place, and the old session emits a
       * final state as it is torn down — the renderer uses this to tell that
       * straggler apart from the new provider's own updates.
       */
      agentKind?: string;
      config?: ThreadConfig;
      /** Effective launch-time config after plugin and global MCP policy is applied. */
      launchConfig?: ThreadConfig;
      /**
       * Whether the emitting session launched with Poracode's `read_thread`
       * tool available. Mirrors the snapshot field so clients learn it from
       * the live stream, not only from a pulled snapshot. Absent from hosts
       * predating the field, which leaves the client's cached value alone.
       */
      threadMentionToolsAvailable?: boolean;
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
  | {
      type: "thread-follow-up-queue";
      threadId: string;
      queue: ThreadFollowUpQueueState | null;
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

/**
 * Recovery signal the supervisor's IPC sender emits when a sustained
 * backend-host stall forces it to shed queued terminal-output batches
 * (oldest first) instead of failing fatally. The backend host responds by
 * asking connected clients to resynchronize those threads' terminal output
 * from the supervisor, which remains the authoritative source for PTY bytes.
 */
export type SupervisorOutputShedSignal = {
  kind: "supervisor-output-shed";
  /** Threads whose queued terminal output was shed, oldest shed first. */
  threadIds: string[];
};

export function isSupervisorOutputShedSignal(
  message: unknown,
): message is SupervisorOutputShedSignal {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Record<string, unknown>;
  return (
    candidate.kind === "supervisor-output-shed" &&
    Array.isArray(candidate.threadIds) &&
    candidate.threadIds.every((id) => typeof id === "string")
  );
}
