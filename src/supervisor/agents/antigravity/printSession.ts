import { randomUUID } from "node:crypto";
import { spawn as spawnChild } from "node:child_process";
import type {
  PromptSegment,
  RuntimeEvent,
  SessionRef,
  ThreadConfig,
  ThreadServerRequestId,
} from "@/shared/contracts";
import { isHomeScopeLocation } from "@/shared/homeScope";
import {
  createKnownSessionRef,
  withCommandBaseSpawnEnv,
  type AgentLaunchOptions,
  type CreateStructuredSessionInput,
  type StartTurnOptions,
  type StructuredSessionHandle,
  type StructuredSessionListener,
} from "../base";
import { buildOneShotSpec } from "../../oneShotSpawn";
import { processEnvRecord } from "../../processEnv";
import { ANTIGRAVITY_DISABLE_AUTO_UPDATE_ENV } from "./detection";
import { buildAntigravityModelArgs } from "./argv";

const NOOP_LISTENER: StructuredSessionListener = {
  onClose() {},
  onError() {},
  onUpdate() {},
};

interface AgyPrintResponse {
  conversation_id?: string;
  status?: string;
  response?: string;
}

function parseAgyPrintResponse(stdout: string): AgyPrintResponse {
  const trimmed = stdout.trim();
  const jsonStart = trimmed.indexOf("{");
  if (jsonStart < 0) throw new Error("Antigravity print mode returned no JSON payload.");
  return JSON.parse(trimmed.slice(jsonStart)) as AgyPrintResponse;
}

function buildPrintArgs(
  config: ThreadConfig,
  prompt: string,
  conversationId: string | undefined,
  separateModelEffort: boolean,
  defaultModel: string,
  newProject: boolean,
): string[] {
  const args: string[] = [];
  if (newProject) args.push("--new-project");
  if (conversationId) args.push("--conversation", conversationId);
  args.push(
    ...buildAntigravityModelArgs(config.model, config.effort, separateModelEffort, defaultModel),
  );
  if (config.mode === "plan") {
    args.push("--mode", "plan");
  } else if (config.approvalPolicy === "accept-edits") {
    args.push("--mode", "accept-edits");
  }
  args.push("--dangerously-skip-permissions");
  if (config.sandboxMode === "sandbox") {
    args.push("--sandbox");
  }
  args.push("-p", prompt, "--output-format", "json");
  return args;
}

/**
 * GUI structured session for Antigravity via headless `agy -p --output-format json`.
 * Keeps conversation continuity with `--conversation` so group-channel members
 * can participate in the relay without a TTY.
 */
export class AntigravityPrintSession implements StructuredSessionHandle {
  launchOptions: AgentLaunchOptions = {};

  private readonly input: CreateStructuredSessionInput;
  private readonly separateModelEffort: boolean;
  private readonly defaultModel: string;
  private listener: StructuredSessionListener = NOOP_LISTENER;
  private conversationId: string | undefined;
  private currentTurnId: string | undefined;
  private assistantItemId: string | undefined;
  private activeChild: import("node:child_process").ChildProcess | undefined;
  private turnGeneration = 0;
  private disposed = false;

  private constructor(
    input: CreateStructuredSessionInput,
    separateModelEffort: boolean,
    defaultModel: string,
  ) {
    this.input = input;
    this.separateModelEffort = separateModelEffort;
    this.defaultModel = defaultModel;
  }

  static create(
    input: CreateStructuredSessionInput,
    separateModelEffort: boolean,
    defaultModel: string,
  ): AntigravityPrintSession {
    return new AntigravityPrintSession(input, separateModelEffort, defaultModel);
  }

  setListener(listener: StructuredSessionListener): void {
    this.listener = listener;
  }

  async activate(): Promise<void> {
    // No persistent process — each turn is a fresh `agy -p`.
  }

  async openThread(_config: ThreadConfig, sessionRef?: SessionRef): Promise<string> {
    this.conversationId = sessionRef?.providerSessionId;
    return this.conversationId ?? "";
  }

  ownsProviderSession(providerSessionId: string): boolean {
    return this.conversationId === providerSessionId;
  }

  async startTurn(
    prompt: string,
    config: ThreadConfig,
    _segments?: PromptSegment[],
    _options?: StartTurnOptions,
  ): Promise<void> {
    if (this.disposed) throw new Error("Antigravity session disposed.");
    if (this.currentTurnId) {
      await this.interruptTurn?.();
    }
    const generation = ++this.turnGeneration;
    const turnId = randomUUID();
    this.currentTurnId = turnId;
    this.assistantItemId = undefined;

    this.emit({
      type: "turn.started",
      threadId: this.input.threadId,
      turnId,
    });
    this.publishUpdate("working", "working");

    const newProject = !this.conversationId && !isHomeScopeLocation(this.input.projectLocation);
    const args = buildPrintArgs(
      config,
      prompt,
      this.conversationId,
      this.separateModelEffort,
      this.defaultModel,
      newProject,
    );
    const command = withCommandBaseSpawnEnv(
      buildOneShotSpec(this.input.projectLocation, "agy", args, {
        env: { ...ANTIGRAVITY_DISABLE_AUTO_UPDATE_ENV },
      }),
      ANTIGRAVITY_DISABLE_AUTO_UPDATE_ENV,
    );

    try {
      const { stdout, stderr, exitCode } = await this.runPrint(command, generation);
      if (generation !== this.turnGeneration || this.disposed) return;
      if (exitCode !== 0) {
        throw new Error(stderr.trim() || `Antigravity exited with code ${exitCode}`);
      }
      const parsed = parseAgyPrintResponse(stdout);
      if (parsed.conversation_id) {
        this.conversationId = parsed.conversation_id;
      }
      const text = (parsed.response ?? "").trim();
      if (!text) {
        throw new Error("Antigravity returned an empty response.");
      }
      this.emitAssistantText(text);
      this.finishTurn("completed");
    } catch (error) {
      if (generation !== this.turnGeneration || this.disposed) return;
      const message = error instanceof Error ? error.message : String(error);
      this.emit({ type: "error", threadId: this.input.threadId, message });
      this.finishTurn("failed");
      this.listener.onError(message);
    }
  }

  async interruptTurn(): Promise<void> {
    this.turnGeneration += 1;
    if (this.activeChild) {
      this.activeChild.kill("SIGTERM");
      this.activeChild = undefined;
    }
    if (this.currentTurnId) {
      this.completeAssistantItem();
      this.finishTurn("cancelled");
    }
  }

  async steerTurn(
    prompt: string,
    config: ThreadConfig,
    segments?: PromptSegment[],
    options?: StartTurnOptions,
  ): Promise<void> {
    await this.startTurn(prompt, config, segments, options);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.turnGeneration += 1;
    if (this.activeChild) {
      this.activeChild.kill("SIGKILL");
      this.activeChild = undefined;
    }
    this.currentTurnId = undefined;
  }

  private runPrint(
    command: ReturnType<typeof buildOneShotSpec>,
    generation: number,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const child = spawnChild(command.command, command.args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        ...(command.cwd ? { cwd: command.cwd } : {}),
        env: { ...processEnvRecord(), ...command.env },
      });
      if (generation !== this.turnGeneration) {
        child.kill("SIGKILL");
        reject(new Error("Turn superseded"));
        return;
      }
      this.activeChild = child;
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        this.activeChild = undefined;
        reject(error);
      });
      child.on("close", (exitCode) => {
        this.activeChild = undefined;
        resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
      });
    });
  }

  private emitAssistantText(text: string): void {
    const itemId = `asst-${randomUUID()}`;
    this.assistantItemId = itemId;
    this.emit({
      type: "item.started",
      threadId: this.input.threadId,
      itemId,
      itemType: "assistant_message",
      payload: { content: [{ type: "text", text: "" }] },
    });
    if (text.length > 0) {
      this.emit({
        type: "content.delta",
        threadId: this.input.threadId,
        itemId,
        stream: "assistant_text",
        delta: text,
      });
    }
    this.emit({
      type: "item.completed",
      threadId: this.input.threadId,
      itemId,
      payload: { content: [{ type: "text", text }] },
    });
  }

  private completeAssistantItem(): void {
    if (!this.assistantItemId) return;
    this.emit({
      type: "item.completed",
      threadId: this.input.threadId,
      itemId: this.assistantItemId,
    });
    this.assistantItemId = undefined;
  }

  private finishTurn(state: "completed" | "cancelled" | "failed"): void {
    if (!this.currentTurnId) return;
    this.emit({
      type: "turn.completed",
      threadId: this.input.threadId,
      turnId: this.currentTurnId,
      state,
    });
    this.currentTurnId = undefined;
    this.publishUpdate(state === "failed" ? "error" : "idle", "none");
  }

  private publishUpdate(
    status: "working" | "idle" | "error",
    attention: "working" | "none",
    errorMessage?: string,
  ): void {
    this.listener.onUpdate({ status, attention, ...(errorMessage ? { errorMessage } : {}) });
  }

  private emit(event: RuntimeEvent): void {
    this.listener.onRuntimeEvent?.(event);
  }

  // StructuredSessionHandle optional methods unused for print mode.
  resolveServerRequest?(_requestId: ThreadServerRequestId, _response: unknown): Promise<void> {
    return Promise.resolve();
  }
}

export function antigravitySessionRef(conversationId: string | undefined): SessionRef | undefined {
  return conversationId ? createKnownSessionRef(conversationId) : undefined;
}
