import { randomUUID } from "node:crypto";
import type {
  AgentKind,
  ScheduleCompletionEvaluationInput,
  ScheduleCompletionEvaluationResult,
  ExtractContextPayload,
  ExtractContextResult,
  GenerateCommitMessagePayload,
  GenerateCommitMessageResult,
  GeneratePrSummaryPayload,
  GeneratePrSummaryResult,
  GenerateTitlePayload,
  GenerateTitleResult,
  JudgeExperimentPayload,
  JudgeExperimentResult,
  ForgeWritePrReviewGuidePayload,
  ForgeRepository,
} from "@/shared/contracts";
import type { GenerateMemoryTextPayload, GenerateMemoryTextResult } from "@/shared/memory";
import { evaluateScheduleCompletion } from "../scheduleCompletionEvaluator";
import { generateCommitMessage } from "../commitMessageGenerator";
import {
  extractContext as extractContextFn,
  extractContextFromScrollback,
} from "../contextExtractor";
import { generatePrSummary } from "../prSummaryGenerator";
import { generateTitle } from "../titleGenerator";
import {
  runOneShotPromptWithFallback,
  runTextOnlyOneShotPromptWithFallback,
} from "../oneShotPromptRunner";
import { resolveOneShotSelection } from "../agents/base";
import { judgeExperiment } from "../experimentJudge";
import { generateReviewGuide } from "../reviewGuideGenerator";
import type { ReviewGuideSnapshot } from "../forges/reviewGuides";
import type { AgentAdapter } from "../agents/base";
import type { HostResourceAdmission } from "./hostResourceAdmission";
import type { WslBridgeClient } from "../wsl/bridge/client";

export interface GenerationServiceDeps {
  adapters: Map<AgentKind, AgentAdapter>;
  readTerminalScrollback: (threadId: string) => string;
  wslBridgeClient: WslBridgeClient | undefined;
  /**
   * Optional: the supervisor's one host execution-slot owner. Generation
   * one-shots are a documented bounded auxiliary class (`generation-helper`)
   * on that owner, never an unbounded bypass around it.
   */
  hostResourceAdmission?: HostResourceAdmission;
}

/**
 * Owns the AI-assisted generation entry points (commit message, thread title,
 * PR summary) and thread-context extraction, including the per-thread abort
 * controllers that back `cancelExtractContext`. Extracted verbatim from
 * `SupervisorRuntime`; the runtime keeps thin delegates.
 */
export class GenerationService {
  private readonly scheduleEvaluationAbortControllers = new Map<string, AbortController>();
  private readonly extractionAbortControllers = new Map<string, AbortController>();
  private readonly judgeAbortControllers = new Map<string, AbortController>();

  constructor(private readonly deps: GenerationServiceDeps) {}

  private requireAdapter(kind: AgentKind): AgentAdapter {
    const adapter = this.deps.adapters.get(kind);
    if (!adapter) {
      throw new Error(`Unsupported agent adapter: ${kind}`);
    }
    return adapter;
  }

  async evaluateScheduleCompletion(
    payload: ScheduleCompletionEvaluationInput,
  ): Promise<ScheduleCompletionEvaluationResult> {
    const adapter = this.requireAdapter(payload.agentKind);
    const controller = new AbortController();
    const id = payload.evaluationId ?? randomUUID();
    this.scheduleEvaluationAbortControllers.set(id, controller);
    try {
      return await this.withHelperLease("schedule-completion", () =>
        evaluateScheduleCompletion(payload, adapter, controller.signal),
      );
    } finally {
      if (this.scheduleEvaluationAbortControllers.get(id) === controller)
        this.scheduleEvaluationAbortControllers.delete(id);
    }
  }

  cancelScheduleCompletionEvaluation(id: string): void {
    this.scheduleEvaluationAbortControllers.get(id)?.abort();
  }

  async generateCommitMessage(
    payload: GenerateCommitMessagePayload,
  ): Promise<GenerateCommitMessageResult> {
    const adapter = this.requireAdapter(payload.agentKind);
    return {
      message: await this.withHelperLease("commit-message", () =>
        generateCommitMessage(
          payload.projectLocation,
          adapter,
          payload.selection,
          payload.language,
        ),
      ),
    };
  }

  async generateTitle(payload: GenerateTitlePayload): Promise<GenerateTitleResult> {
    const adapter = this.requireAdapter(payload.agentKind);
    return {
      title: await this.withHelperLease("title", () =>
        generateTitle(
          payload.projectLocation,
          adapter,
          payload.prompt,
          payload.selection,
          payload.language,
        ),
      ),
    };
  }

  async generateMemoryText(payload: GenerateMemoryTextPayload): Promise<GenerateMemoryTextResult> {
    const adapter = this.requireAdapter(payload.agentKind);
    const selection = resolveOneShotSelection(adapter, payload.selection, () => {
      return new Error(`No default one-shot model configured for ${adapter.label}`);
    });
    const textOnly = adapter.capabilities.supportsTextOnlyOneShot === true;
    const run = textOnly ? runTextOnlyOneShotPromptWithFallback : runOneShotPromptWithFallback;
    const attempts =
      payload.prompt.length > 20_000
        ? [
            { level: "memory", buildPrompt: () => payload.prompt },
            { level: "memory-compact", buildPrompt: () => payload.prompt.slice(0, 18_000) },
          ]
        : [{ level: "memory", buildPrompt: () => payload.prompt }];
    const text = await this.withHelperLease("memory", () =>
      run({
        location: payload.projectLocation,
        adapter,
        selection,
        isolateCwd: !textOnly,
        timeoutMs: 60_000,
        logTag: "memory",
        attempts,
      }),
    );
    return { text };
  }

  async generatePrSummary(payload: GeneratePrSummaryPayload): Promise<GeneratePrSummaryResult> {
    const adapter = this.requireAdapter(payload.agentKind);
    return this.withHelperLease("pr-summary", () =>
      generatePrSummary(
        payload.projectLocation,
        adapter,
        payload.branch,
        payload.baseBranch,
        payload.selection,
        payload.language,
      ),
    );
  }

  async generateReviewGuide(
    payload: ForgeWritePrReviewGuidePayload,
    snapshot: ReviewGuideSnapshot,
    source: ForgeRepository,
  ) {
    const adapter = this.requireAdapter(payload.agentKind);
    return this.withHelperLease("review-guide", () =>
      generateReviewGuide(payload, snapshot, source, adapter, this.deps.wslBridgeClient),
    );
  }

  async judgeExperiment(payload: JudgeExperimentPayload): Promise<JudgeExperimentResult> {
    const adapter = this.requireAdapter(payload.agentKind);
    const abortController = new AbortController();
    this.judgeAbortControllers.get(payload.experimentId)?.abort();
    this.judgeAbortControllers.set(payload.experimentId, abortController);
    try {
      return await this.withHelperLease("judge-experiment", () =>
        judgeExperiment(
          payload.projectLocation,
          adapter,
          payload.prompt,
          payload.candidates,
          payload.selection,
          {
            signal: abortController.signal,
            ...(this.deps.wslBridgeClient ? { wslClient: this.deps.wslBridgeClient } : {}),
            ...(payload.mode ? { mode: payload.mode } : {}),
          },
        ),
      );
    } finally {
      if (this.judgeAbortControllers.get(payload.experimentId) === abortController) {
        this.judgeAbortControllers.delete(payload.experimentId);
      }
    }
  }

  cancelJudgeExperiment(experimentId: string): void {
    const controller = this.judgeAbortControllers.get(experimentId);
    if (controller) {
      controller.abort();
      this.judgeAbortControllers.delete(experimentId);
    }
  }

  async extractContext(payload: ExtractContextPayload): Promise<ExtractContextResult> {
    if (this.extractionAbortControllers.has(payload.threadId)) {
      throw new Error("Context extraction is already running for this thread.");
    }
    const adapter = this.requireAdapter(payload.agentKind);
    const abortController = new AbortController();
    this.extractionAbortControllers.set(payload.threadId, abortController);

    try {
      const result = await this.withHelperLease("extract-context", async () => {
        abortController.signal.throwIfAborted();
        try {
          return await extractContextFn(
            payload.projectLocation,
            adapter,
            payload.sessionRef,
            payload.worktreePath,
            payload.selection,
            abortController.signal,
          );
        } catch {
          abortController.signal.throwIfAborted();
          const scrollback = this.deps.readTerminalScrollback(payload.threadId);
          if (scrollback) {
            return extractContextFromScrollback(
              payload.projectLocation,
              adapter,
              scrollback,
              payload.agentKind,
              payload.sessionRef.providerSessionId,
              payload.worktreePath,
              payload.selection,
              abortController.signal,
            );
          }
          throw new Error(
            `Cannot extract context from ${adapter.label}: no session resume or scrollback available`,
          );
        }
      });
      abortController.signal.throwIfAborted();
      return result;
    } finally {
      this.extractionAbortControllers.delete(payload.threadId);
    }
  }

  cancelExtractContext(threadId: string): void {
    const controller = this.extractionAbortControllers.get(threadId);
    if (controller) {
      controller.abort();
    }
  }

  /**
   * Request-scoped slot for one agent-generation helper. The helper call is
   * fully awaited, so the slot is released when it returns or throws (a
   * cancelled helper kills its child before settling). With the class limit at
   * its explicit unlimited pre-measurement default this never refuses; once a
   * measured number lands it refuses promptly like every other class.
   */
  private async withHelperLease<T>(operation: string, run: () => Promise<T>): Promise<T> {
    const admission = this.deps.hostResourceAdmission;
    if (!admission) {
      return run();
    }
    const lease = admission.tryAcquire({
      resourceClass: "generation-helper",
      key: `generation-helper:${operation}:${randomUUID()}`,
    });
    try {
      return await run();
    } finally {
      lease.confirmExit();
    }
  }
}
