import type {
  AgentKind,
  ExtractContextPayload,
  ExtractContextResult,
  GenerateCommitMessagePayload,
  GenerateCommitMessageResult,
  GeneratePrSummaryPayload,
  GeneratePrSummaryResult,
  GenerateTitlePayload,
  GenerateTitleResult,
} from "@/shared/contracts";
import { generateCommitMessage } from "../commitMessageGenerator";
import {
  extractContext as extractContextFn,
  extractContextFromScrollback,
} from "../contextExtractor";
import { generatePrSummary } from "../prSummaryGenerator";
import { generateTitle } from "../titleGenerator";
import type { AgentAdapter } from "../agents/base";

export interface GenerationServiceDeps {
  adapters: Map<AgentKind, AgentAdapter>;
  readTerminalScrollback: (threadId: string) => string;
}

/**
 * Owns the AI-assisted generation entry points (commit message, thread title,
 * PR summary) and thread-context extraction, including the per-thread abort
 * controllers that back `cancelExtractContext`. Extracted verbatim from
 * `SupervisorRuntime`; the runtime keeps thin delegates.
 */
export class GenerationService {
  private readonly extractionAbortControllers = new Map<string, AbortController>();

  constructor(private readonly deps: GenerationServiceDeps) {}

  private requireAdapter(kind: AgentKind): AgentAdapter {
    const adapter = this.deps.adapters.get(kind);
    if (!adapter) {
      throw new Error(`Unsupported agent adapter: ${kind}`);
    }
    return adapter;
  }

  async generateCommitMessage(
    payload: GenerateCommitMessagePayload,
  ): Promise<GenerateCommitMessageResult> {
    const adapter = this.requireAdapter(payload.agentKind);
    return {
      message: await generateCommitMessage(
        payload.projectLocation,
        adapter,
        payload.model,
        payload.effort,
        payload.language,
        payload.fast,
      ),
    };
  }

  async generateTitle(payload: GenerateTitlePayload): Promise<GenerateTitleResult> {
    const adapter = this.requireAdapter(payload.agentKind);
    return {
      title: await generateTitle(
        payload.projectLocation,
        adapter,
        payload.prompt,
        payload.model,
        payload.effort,
        payload.language,
        payload.fast,
      ),
    };
  }

  async generatePrSummary(payload: GeneratePrSummaryPayload): Promise<GeneratePrSummaryResult> {
    const adapter = this.requireAdapter(payload.agentKind);
    return generatePrSummary(
      payload.projectLocation,
      adapter,
      payload.branch,
      payload.baseBranch,
      payload.model,
      payload.effort,
      payload.language,
    );
  }

  async extractContext(payload: ExtractContextPayload): Promise<ExtractContextResult> {
    const adapter = this.requireAdapter(payload.agentKind);
    const abortController = new AbortController();
    this.extractionAbortControllers.set(payload.threadId, abortController);

    try {
      try {
        return await extractContextFn(
          payload.projectLocation,
          adapter,
          payload.sessionRef,
          payload.worktreePath,
          payload.model,
          payload.effort,
          abortController.signal,
        );
      } catch {
        const scrollback = this.deps.readTerminalScrollback(payload.threadId);
        if (scrollback) {
          return extractContextFromScrollback(
            payload.projectLocation,
            adapter,
            scrollback,
            payload.agentKind,
            payload.sessionRef.providerSessionId,
            payload.worktreePath,
            payload.model,
            payload.effort,
            abortController.signal,
          );
        }
        throw new Error(
          `Cannot extract context from ${adapter.label}: no session resume or scrollback available`,
        );
      }
    } finally {
      this.extractionAbortControllers.delete(payload.threadId);
    }
  }

  cancelExtractContext(threadId: string): void {
    const controller = this.extractionAbortControllers.get(threadId);
    if (controller) {
      controller.abort();
      this.extractionAbortControllers.delete(threadId);
    }
  }
}
