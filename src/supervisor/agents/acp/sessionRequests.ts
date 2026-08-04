import {
  CreateElicitationRequest as AcpCreateElicitationRequest,
  type CompleteElicitationNotification,
  type CreateElicitationRequest,
  type CreateElicitationResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import type {
  RequestOutcome,
  RuntimeEvent,
  ThreadConfig,
  ThreadServerRequestId,
} from "@/shared/contracts";
import {
  mapAcpElicitationRequest,
  mapAcpPermissionRequest,
  type AcpMapperState,
} from "./canonicalMapping";
import {
  buildAcpElicitationAnswerEvents,
  normalizeAcpElicitationResponse,
} from "./sessionElicitation";
import {
  hasNativeAcpPermissionMode,
  selectAutoApprovedPermissionOption,
} from "./sessionPermissionMode";
import {
  buildAcpQuestionPermissionAnswerEvents,
  isRejectionOptionId,
  mapAcpQuestionPermissionRequest,
  normalizeAcpQuestionPermissionResponse,
  parseAcpPermissionQuestions,
} from "./acpQuestionPermissions";

type RequestAttention = "needs_approval" | "needs_reply" | "working";

interface AcpSessionRequestsOptions {
  threadId: string;
  getPermissionContext: () => {
    config: ThreadConfig | undefined;
    availableModeIds: string[];
  };
  ensureMapperState: () => AcpMapperState;
  emitRuntimeEvents: (events: RuntimeEvent[]) => void;
  setRequestAttention: (attention: RequestAttention) => void;
}

interface PendingElicitation {
  resolve: (response: unknown) => void;
  elicitationId?: string;
  request: CreateElicitationRequest;
}

interface PendingPermission {
  resolve: (response: unknown) => void;
  isQuestion: boolean;
}

/** Owns the pending ACP requests that block an agent until the client responds. */
export class AcpSessionRequests {
  private readonly pendingPermissionResolvers = new Map<ThreadServerRequestId, PendingPermission>();
  private readonly pendingElicitationResolvers = new Map<
    ThreadServerRequestId,
    PendingElicitation
  >();
  private readonly pendingElicitationRequestIdsByElicitationId = new Map<
    string,
    ThreadServerRequestId
  >();
  private permissionRequestSeq = 0;
  private elicitationRequestSeq = 0;

  constructor(private readonly options: AcpSessionRequestsOptions) {}

  requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const isQuestion = parseAcpPermissionQuestions(params).length > 0;
    if (!isQuestion && this.shouldAutoApproveSyntheticPermissionRequest()) {
      const optionId = selectAutoApprovedPermissionOption(params);
      if (optionId) {
        return Promise.resolve({ outcome: { outcome: "selected", optionId } });
      }
    }

    return new Promise<RequestPermissionResponse>((resolve) => {
      const requestId = `acp-perm-${this.permissionRequestSeq++}`;

      this.pendingPermissionResolvers.set(requestId, {
        isQuestion,
        resolve: (response: unknown) => {
          if (isQuestion) {
            resolve(normalizeAcpQuestionPermissionResponse(params, response));
            const answerEvents = buildAcpQuestionPermissionAnswerEvents({
              threadId: this.options.threadId,
              itemId: `acp-question-answer-${String(requestId)}`,
              request: params,
              response,
            });
            if (answerEvents.length > 0) this.options.emitRuntimeEvents(answerEvents);
            return;
          }
          const selected = response as { optionId?: string } | undefined;
          if (selected?.optionId) {
            resolve({ outcome: { outcome: "selected", optionId: selected.optionId } });
          } else {
            resolve({ outcome: { outcome: "cancelled" } });
          }
        },
      });

      this.options.emitRuntimeEvents([
        isQuestion
          ? mapAcpQuestionPermissionRequest(
              params,
              this.options.ensureMapperState(),
              String(requestId),
            )!
          : mapAcpPermissionRequest(params, this.options.ensureMapperState(), String(requestId)),
      ]);
      this.options.setRequestAttention(isQuestion ? "needs_reply" : "needs_approval");
    });
  }

  createElicitation(params: CreateElicitationRequest): Promise<CreateElicitationResponse> {
    return new Promise<CreateElicitationResponse>((resolve) => {
      const requestId = `acp-elicit-${this.elicitationRequestSeq++}`;
      const urlElicitationId = AcpCreateElicitationRequest.isUrl(params)
        ? params.elicitationId
        : undefined;

      this.pendingElicitationResolvers.set(requestId, {
        resolve: (response: unknown) => {
          resolve(normalizeAcpElicitationResponse(response, params));
        },
        request: params,
        ...(urlElicitationId !== undefined ? { elicitationId: urlElicitationId } : {}),
      });

      if (urlElicitationId !== undefined) {
        this.pendingElicitationRequestIdsByElicitationId.set(urlElicitationId, requestId);
      }

      this.options.emitRuntimeEvents([
        mapAcpElicitationRequest(params, this.options.ensureMapperState(), String(requestId)),
      ]);
      this.options.setRequestAttention("needs_reply");
    });
  }

  completeElicitation(params: CompleteElicitationNotification): void {
    const requestId = this.pendingElicitationRequestIdsByElicitationId.get(params.elicitationId);
    if (!requestId) return;
    if (this.resolvePendingElicitationRequest(requestId, { action: "accept" })) {
      this.emitResolvedAndResume(requestId, "answered");
    }
  }

  resolve(requestId: ThreadServerRequestId, response: unknown): boolean {
    const permissionResolver = this.pendingPermissionResolvers.get(requestId);
    if (permissionResolver) {
      this.pendingPermissionResolvers.delete(requestId);
      permissionResolver.resolve(response);
      this.emitResolvedAndResume(
        requestId,
        permissionResolver.isQuestion ? "answered" : permissionOutcome(response),
      );
      return true;
    }
    const resolved = this.resolvePendingElicitationRequest(requestId, response);
    if (resolved) {
      this.emitResolvedAndResume(requestId, "answered");
    }
    return resolved;
  }

  cancelPending(): void {
    const cancelledIds: ThreadServerRequestId[] = [];
    for (const [requestId, entry] of this.pendingPermissionResolvers) {
      cancelledIds.push(requestId);
      entry.resolve({ action: "cancel" });
    }
    this.pendingPermissionResolvers.clear();

    for (const [requestId, entry] of this.pendingElicitationResolvers) {
      cancelledIds.push(requestId);
      if (entry.elicitationId !== undefined) {
        this.pendingElicitationRequestIdsByElicitationId.delete(entry.elicitationId);
      }
      entry.resolve({ action: "cancel" });
    }
    this.pendingElicitationResolvers.clear();

    if (cancelledIds.length > 0) {
      this.options.emitRuntimeEvents(
        cancelledIds.map((requestId) => ({
          type: "request.resolved",
          threadId: this.options.threadId,
          requestId: String(requestId),
          outcome: "cancelled",
        })),
      );
    }
  }

  private shouldAutoApproveSyntheticPermissionRequest(): boolean {
    const { config, availableModeIds } = this.options.getPermissionContext();
    const policy = config?.approvalPolicy;
    if (!config || config.mode === "plan" || !policy) return false;
    if (policy !== "never" && policy !== "yolo" && policy !== "bypassPermissions") return false;
    return !hasNativeAcpPermissionMode(policy, availableModeIds);
  }

  private emitResolvedAndResume(requestId: ThreadServerRequestId, outcome: RequestOutcome): void {
    this.options.emitRuntimeEvents([
      {
        type: "request.resolved",
        threadId: this.options.threadId,
        requestId: String(requestId),
        outcome,
      },
    ]);
    this.resumeAfterLastRequest();
  }

  /** Clear the yellow request state immediately once the agent is unblocked. */
  private resumeAfterLastRequest(): void {
    if (this.pendingPermissionResolvers.size === 0 && this.pendingElicitationResolvers.size === 0) {
      this.options.setRequestAttention("working");
    }
  }

  private resolvePendingElicitationRequest(
    requestId: ThreadServerRequestId,
    response: unknown,
  ): boolean {
    const entry = this.pendingElicitationResolvers.get(requestId);
    if (!entry) return false;
    this.pendingElicitationResolvers.delete(requestId);
    if (entry.elicitationId !== undefined) {
      this.pendingElicitationRequestIdsByElicitationId.delete(entry.elicitationId);
    }
    entry.resolve(response);
    this.options.emitRuntimeEvents(
      buildAcpElicitationAnswerEvents({
        threadId: this.options.threadId,
        itemId: `acp-question-answer-${String(requestId)}`,
        request: entry.request,
        response,
      }),
    );
    return true;
  }
}

function permissionOutcome(response: unknown): "accepted" | "declined" | "cancelled" {
  if (!response || typeof response !== "object") return "cancelled";
  const record = response as { action?: unknown; optionId?: unknown };
  if (record.action === "cancel") return "cancelled";
  if (isRejectionOptionId(record.optionId)) return "declined";
  return "accepted";
}
