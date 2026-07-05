/**
 * ACP (Agent Client Protocol) structured session.
 *
 * Uses the official @agentclientprotocol/sdk to communicate with any
 * ACP-compatible agent CLI (e.g. `gemini --acp`) over stdio.
 *
 * Implements `StructuredSessionHandle` so the supervisor runtime drives
 * its lifecycle identically to the Codex WebSocket session — no runtime
 * changes required.
 */

import { spawn as spawnChild, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  buildAcpBrowserMcpServers,
  gateAcpHttpMcpServers,
  type AcpHttpMcpServer,
} from "./mcpBrowser";
import { buildAcpSubagentMcpServers } from "./mcpSubagent";
import { appendFileSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { resolveLightcodePaths } from "@/shared/lightcodePaths";
import { Readable, Writable } from "node:stream";
import { spawn as spawnPty } from "node-pty";
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  RequestError,
  type Client,
  type CompleteElicitationNotification,
  type ContentBlock,
  type CreateElicitationRequest,
  type CreateElicitationResponse,
  type CreateTerminalRequest,
  type CreateTerminalResponse,
  type KillTerminalRequest,
  type McpCapabilities,
  type PromptCapabilities,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type ReleaseTerminalRequest,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type SessionCapabilities,
  type SessionUpdate,
  type TerminalExitStatus,
  type TerminalOutputRequest,
  type TerminalOutputResponse,
  type WaitForTerminalExitRequest,
  type WaitForTerminalExitResponse,
  type WriteTextFileRequest,
  type WriteTextFileResponse,
} from "@agentclientprotocol/sdk";
import type {
  AgentSlashCommand,
  ProjectLocation,
  PromptSegment,
  RuntimeEvent,
  SessionRef,
  ThreadAttention,
  ThreadConfig,
  ThreadServerRequestId,
  ThreadStatus,
} from "@/shared/contracts";
import type { BrowserMcpHttpConfig } from "@/supervisor/agents/browserMcp";
import type { SubagentMcpHttpConfig } from "@/supervisor/agents/subagentMcp";
import { areAgentSlashCommandsEqual, isThreadConfigEqual } from "@/shared/contracts";
import { buildPromptContentBlocks } from "@/shared/promptContent";
import {
  closeOpenTurnItems,
  createAcpMapperState,
  mapAcpElicitationRequest,
  mapAcpPermissionRequest,
  mapAcpSessionUpdate,
  type AcpMapperState,
} from "./canonicalMapping";
import { terminateChildProcessTree } from "@/shared/processTree";
import { ensureNodePtySpawnHelperExecutable } from "@/supervisor/nodePty";
import { processEnvRecord } from "@/supervisor/processEnv";
import {
  buildPosixExportPrefix,
  createKnownSessionRef,
  detectShell,
  getPosixLoginShellArgs,
  getProjectShellEnv,
  getWindowsSystemCommand,
  getWindowsPathOverrideEnv,
  getWslCommand,
  quotePosixShellArg,
  quotePowerShellLiteral,
  resolveWslShellPath,
  type AgentLaunchOptions,
  type CommandSpec,
  type CreateStructuredSessionInput,
  type StartTurnOptions,
  type StructuredSessionHandle,
  type StructuredSessionListener,
  type StructuredSessionUpdate,
} from "../base";
import { mapAcpSlashCommands, normalizeAcpModeId } from "./probe";
import {
  applyAcpModeUpdateToConfig,
  findSelectConfigOption,
  findThoughtLevelConfig,
  resolveAcpMode,
  resolveModelConfigValue,
} from "./sessionConfig";

// ── Helpers ──────────────────────────────────────────────────────

import {
  basenameForProjectPath,
  guessMimeType,
  resolveAcpHostFsPath,
  resolveAcpProjectPath,
  resolveAcpReadableHostFsPath,
  resolveAcpResourcePath,
  resolveSessionCwd,
  resolveSpawnCwd,
  sliceTextFileContent,
  toAcpResourceUri,
} from "./sessionPaths";

export { resolveAcpReadableHostFsPath, resolveAcpResourcePath, toAcpResourceUri };

/**
 * Convert Poracode `PromptSegment[]` + prompt text into ACP `ContentBlock[]`.
 */
async function segmentsToContentBlocks(
  prompt: string,
  location: ProjectLocation,
  segments?: PromptSegment[],
  promptCapabilities?: PromptCapabilities,
): Promise<ContentBlock[]> {
  void promptCapabilities;
  const blocks: ContentBlock[] = [];

  for (const seg of segments ?? []) {
    if (seg.kind === "attachment") {
      const resourcePath = resolveAcpResourcePath(location, seg.path);
      const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(seg.path);
      if (isImage) {
        try {
          const data = await readFile(resourcePath);
          const mimeType = seg.mimeType ?? guessMimeType(seg.path);
          blocks.push({ type: "image", data: data.toString("base64"), mimeType });
        } catch {
          // Fall back to resource link if the image bytes can't be read
          // (permission / size / missing). Capability-gating is intentionally
          // skipped — matches t3code's Cursor adapter which sends image
          // blocks unconditionally; ACP agents that don't accept images
          // should reject the prompt rather than silently dropping content.
          blocks.push({
            type: "resource_link",
            uri: toAcpResourceUri(location, seg.path),
            name: basenameForProjectPath(location, resourcePath),
            ...(seg.mimeType ? { mimeType: seg.mimeType } : {}),
          });
        }
      } else {
        blocks.push({
          type: "resource_link",
          uri: toAcpResourceUri(location, seg.path),
          name: basenameForProjectPath(location, resourcePath),
          ...(seg.mimeType ? { mimeType: seg.mimeType } : {}),
        });
      }
    } else if (seg.kind === "file") {
      const resourcePath = resolveAcpResourcePath(location, seg.path);
      blocks.push({
        type: "resource_link",
        uri: toAcpResourceUri(location, seg.path),
        name: basenameForProjectPath(location, resourcePath),
      });
    }
  }

  if (prompt.trim().length > 0) {
    blocks.push({ type: "text", text: prompt });
  }

  return blocks;
}

import {
  appendTerminalOutput,
  MAX_ACP_TERMINALS_PER_SESSION,
  type AcpTerminalRecord,
} from "./sessionTerminal";
import {
  appendInterruptAckTextTail,
  createAcpPromptUsageEvent,
  normalizeAcpStopReason,
  resolveAcpPromptFailureMessage,
  resolveAcpPromptRpcErrorMessage,
  rewriteLoadSessionError,
  shouldEmitAcpPromptRpcErrorItem,
} from "./sessionErrors";
import {
  buildAcpElicitationAnswerEvents,
  normalizeAcpElicitationResponse,
} from "./sessionElicitation";

export { normalizeAcpStopReason, rewriteLoadSessionError };

function buildTerminalCommandLine(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}

function normalizeTerminalCommandText(command: string | undefined): string | undefined {
  const normalized = command
    ?.trim()
    .replace(/^cmd(?:\.exe)?\s+\/d\s+\/s\s+\/c\s+/i, "")
    .replace(/^cmd(?:\.exe)?\s+\/c\s+/i, "")
    .replace(/^powershell(?:\.exe)?\s+.*?-command\s+/i, "")
    .replace(/^pwsh(?:\.exe)?\s+.*?-command\s+/i, "")
    .replace(/\s+/g, " ");
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function isSameTerminalCommand(expectedNormalized: string, actual: string): boolean {
  const actualNormalized = normalizeTerminalCommandText(actual);
  if (!actualNormalized) return false;
  return (
    actualNormalized === expectedNormalized || actualNormalized.endsWith(` ${expectedNormalized}`)
  );
}

function acpModeKey(modeId: string): string {
  return normalizeAcpModeId(modeId).toLowerCase();
}

function hasNativeAcpPermissionMode(policy: string, availableModeIds: string[]): boolean {
  const available = new Set(availableModeIds.map(acpModeKey));
  const normalizedPolicy = policy.toLowerCase();

  if (available.has(normalizedPolicy)) return true;
  if (normalizedPolicy === "never") {
    return available.has("yolo") || available.has("autopilot");
  }
  if (normalizedPolicy === "autopilot") {
    return available.has("autopilot") || available.has("yolo");
  }
  if (normalizedPolicy === "auto_edit") {
    return available.has("autoedit");
  }
  return false;
}

function selectAutoApprovedPermissionOption(request: RequestPermissionRequest): string | undefined {
  const readOptionId = (kind: string) => {
    const optionId = request.options.find((option) => option.kind === kind)?.optionId?.trim();
    return optionId && optionId.length > 0 ? optionId : undefined;
  };

  return readOptionId("allow_always") ?? readOptionId("allow_once");
}

function buildAcpTerminalEnv(location: ProjectLocation): Record<string, string> {
  const env = processEnvRecord();
  if (location.kind === "windows") {
    return {
      ...env,
      ...(getProjectShellEnv(location.path) ?? getWindowsPathOverrideEnv() ?? {}),
    };
  }
  if (location.kind === "posix") {
    return { ...env, ...(getProjectShellEnv(location.path) ?? {}) };
  }
  return env;
}

function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

function buildWindowsTerminalScript(command: string, args: string[]): string {
  if (args.length === 0) return `$ErrorActionPreference = 'Stop'; ${command}`;
  return [
    "$ErrorActionPreference = 'Stop'",
    `$cmd = ${quotePowerShellLiteral(command)}`,
    `$args = @(${args.map(quotePowerShellLiteral).join(", ")})`,
    "& $cmd @args",
  ].join("; ");
}

function buildPosixTerminalScript(command: string, args: string[]): string {
  return args.length === 0
    ? command
    : `exec ${[command, ...args].map(quotePosixShellArg).join(" ")}`;
}

function acpTerminalEnvEntries(
  entries: ReadonlyArray<{ name: string; value: string }> | null | undefined,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const entry of entries ?? []) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(entry.name)) {
      env[entry.name] = entry.value;
    }
  }
  return env;
}

function resolveAcpTerminalCwd(location: ProjectLocation, cwd: string): string {
  return location.kind === "wsl"
    ? resolveAcpProjectPath(location, cwd)
    : resolveAcpHostFsPath(location, cwd);
}

function buildAcpTerminalLaunch(
  location: ProjectLocation,
  cwd: string,
  command: string,
  args: string[],
  requestEnv: Record<string, string>,
): { command: string; args: string[]; cwd?: string; env: Record<string, string> } {
  if (location.kind === "windows") {
    const env = { ...buildAcpTerminalEnv(location), ...requestEnv };
    const shell = detectShell();
    if (typeof shell === "string") {
      return {
        command: shell,
        args: [
          "-NoLogo",
          "-NoProfile",
          "-EncodedCommand",
          encodePowerShellCommand(buildWindowsTerminalScript(command, args)),
        ],
        cwd,
        env,
      };
    }
    return {
      command: getWindowsSystemCommand("cmd.exe"),
      args: ["/d", "/s", "/c", args.length === 0 ? command : [command, ...args].join(" ")],
      cwd,
      env,
    };
  }

  if (location.kind === "wsl") {
    const exports = buildPosixExportPrefix({ TERM: "xterm-256color", ...requestEnv });
    const script = `${exports}${buildPosixTerminalScript(command, args)}`;
    return {
      command: getWslCommand(),
      args: [
        "-d",
        location.distro,
        "--cd",
        cwd,
        "--",
        resolveWslShellPath(location.distro),
        "-l",
        "-i",
        "-c",
        script,
      ],
      env: processEnvRecord(),
    };
  }

  if (args.length === 0) {
    return {
      command: process.env.SHELL || "/bin/bash",
      args: getPosixLoginShellArgs(command),
      cwd,
      env: { ...buildAcpTerminalEnv(location), ...requestEnv },
    };
  }

  return {
    command,
    args,
    cwd,
    env: { ...buildAcpTerminalEnv(location), ...requestEnv },
  };
}

function completeAcpTerminal(record: AcpTerminalRecord, status: TerminalExitStatus): void {
  if (record.exitStatus) return;
  record.exitStatus = status;
  const waiters = record.waiters.splice(0);
  for (const resolve of waiters) {
    resolve(record.exitStatus);
  }
}

function looksLikeAcpSessionNotification(params: unknown): params is SessionNotification {
  if (!params || typeof params !== "object") return false;
  const p = params as { sessionId?: unknown; update?: unknown };
  if (typeof p.sessionId !== "string") return false;
  if (!p.update || typeof p.update !== "object") return false;
  return typeof (p.update as { sessionUpdate?: unknown }).sessionUpdate === "string";
}

function filterAcpInboundNoise(
  stream: ReturnType<typeof ndJsonStream>,
): ReturnType<typeof ndJsonStream> {
  return {
    writable: stream.writable,
    readable: stream.readable.pipeThrough(
      new TransformStream({
        transform(message, controller) {
          if (isStraySkillsReloadResponse(message)) return;
          controller.enqueue(message);
        },
      }),
    ) as ReturnType<typeof ndJsonStream>["readable"],
  };
}

function isStraySkillsReloadResponse(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const record = message as Record<string, unknown>;
  return !("method" in record) && record.id === "skills-reload";
}

function childExitStatus(code: number | null, signal: NodeJS.Signals | null): TerminalExitStatus {
  return {
    ...(typeof code === "number" ? { exitCode: code } : {}),
    ...(signal ? { signal: String(signal) } : {}),
    ...(code === null && !signal ? { exitCode: 0 } : {}),
  };
}

// ── Session ──────────────────────────────────────────────────────

export interface AcpStructuredSessionOptions {
  /**
   * Hook the adapter passes in when it wants to control the message a failed
   * `session/load` produces. Receives the raw transport error and the
   * sessionId that was being loaded; must return the Error to throw.
   */
  loadSessionErrorRewriter?: (error: unknown, sessionId: string) => Error;
  /**
   * Per-adapter notification preprocessor. When set, every `session/update`
   * is run through it before the shared canonical mapper consumes it. Use to
   * bridge provider-specific wire quirks; the shared mapper itself remains
   * provider-agnostic.
   */
  sessionUpdateTransform?: (notification: SessionNotification) => SessionNotification;
  /**
   * Vendor ACP extension notifications (e.g. Cursor `cursor/task`) that are
   * not surfaced as standard `session/update` messages.
   */
  extensionNotificationHandler?: import("../base/types").AcpExtensionNotificationHandler;
  browserMcp?: BrowserMcpHttpConfig;
  subagentMcp?: SubagentMcpHttpConfig;
}

export class AcpStructuredSession implements StructuredSessionHandle {
  launchOptions: AgentLaunchOptions;

  private loadSessionErrorRewriter: (error: unknown, sessionId: string) => Error =
    rewriteLoadSessionError;

  private sessionUpdateTransform?: (notification: SessionNotification) => SessionNotification;

  private extensionNotificationHandler?: import("../base/types").AcpExtensionNotificationHandler;

  private readonly acpToolCallIdToItemId = new Map<string, string>();
  private readonly child: ChildProcess;
  private readonly connection: ClientSideConnection;
  private readonly cwd: string;
  private readonly projectLocation: ProjectLocation;
  private readonly browserMcp: BrowserMcpHttpConfig | undefined;
  private readonly subagentMcp: SubagentMcpHttpConfig | undefined;
  /** Poracode thread id (stable identifier we report in RuntimeEvents). */
  private readonly threadId: string;
  private readonly stderrChunks: string[] = [];
  private listener: StructuredSessionListener | undefined;
  private sessionId: string | undefined;
  private isDisposed = false;
  private currentConfig: ThreadConfig | undefined;
  private currentSlashCommands: AgentSlashCommand[] | undefined;
  private currentStatus: ThreadStatus = "idle";
  private currentAttention: ThreadAttention = "none";
  private spawnReady: Promise<void> = Promise.resolve();
  private currentTurnId: string | undefined;
  private stableSessionRef: SessionRef | undefined;
  /**
   * True while a `connection.prompt()` call is in flight (between issue and
   * resolution). Used together with `pendingPromptInterrupt` to close the
   * window where `interruptTurn()` fires before the ACP runtime has actually
   * accepted the prompt — without this, `connection.cancel()` lands on an
   * idle session and is silently dropped, so the steer would be lost.
   * Mirrors Codex's `pendingTurnInterrupt` race guard at codex/acp.ts:264.
   */
  private promptInFlight = false;
  private pendingPromptInterrupt = false;
  private currentTurnInterruptRequested = false;
  private recentInterruptAckTextTail = "";
  /** User-visible error text from an `agent_message_chunk` before `prompt()` settles. */
  private agentSurfacedErrorMessage: string | undefined;
  private availableModeIds: string[] = [];
  private currentConfigOptions: unknown[] = [];
  private modeConfigId: string | undefined;
  private modelConfigValue: string | undefined;
  private thoughtLevelConfigId: string | undefined;
  private agentPromptCapabilities: PromptCapabilities | undefined;
  private agentSessionCapabilities: SessionCapabilities | undefined;
  private agentMcpCapabilities: McpCapabilities | undefined;
  private readonly acpTerminals = new Map<string, AcpTerminalRecord>();
  private acpTerminalSeq = 0;
  /**
   * Final stdout/stderr snapshot kept around after `releaseTerminal` so the
   * canonical mapper can still surface output when the agent emits its
   * completed `tool_call_update` AFTER releasing the terminal. Without this
   * the live `acpTerminals` entry is gone and the chat row would render
   * without a body even though we have the bytes in hand.
   */
  private readonly releasedAcpTerminalOutput = new Map<string, string>();
  private readonly acpTerminalCommandById = new Map<string, string>();

  private mapperState: AcpMapperState | undefined;
  /**
   * Runtime events that fired before the listener was wired (typical race:
   * the supervisor calls `void startTurn(...)` and then `await`s plugin-env
   * resolution, which lets the turn's microtask emit user_message events
   * before `spawnThread` reaches `setListener`). Replayed on `setListener`.
   */
  private bufferedRuntimeEvents: RuntimeEvent[] = [];
  /**
   * True while `loadSession` is replaying historical `session/update`
   * notifications. Poracode persists thread history in its own DB, so
   * surfacing the replay as new canonical events would duplicate every
   * message in the chat pane. We drop ACP→canonical mapping for the duration
   * and let normal mapping resume once the load completes.
   */
  private isReplayingHistory = false;
  private replayHistoryUntil = 0;

  private constructor(
    child: ChildProcess,
    connection: ClientSideConnection,
    projectLocation: ProjectLocation,
    cwd: string,
    threadId: string,
    options?: AcpStructuredSessionOptions,
  ) {
    this.child = child;
    this.connection = connection;
    this.projectLocation = projectLocation;
    this.cwd = cwd;
    this.threadId = threadId;
    this.launchOptions = { suppressResumeConfigOverrides: true };
    if (options?.loadSessionErrorRewriter) {
      this.loadSessionErrorRewriter = options.loadSessionErrorRewriter;
    }
    if (options?.sessionUpdateTransform) {
      this.sessionUpdateTransform = options.sessionUpdateTransform;
    }
    if (options?.extensionNotificationHandler) {
      this.extensionNotificationHandler = options.extensionNotificationHandler;
    }
    this.browserMcp = options?.browserMcp;
    this.subagentMcp = options?.subagentMcp;
  }

  private shouldAutoApproveSyntheticPermissionRequest(): boolean {
    const config = this.currentConfig;
    const policy = config?.approvalPolicy;
    if (!config || config.mode === "plan" || !policy) return false;
    // Bypass-style policy ids across adapters: legacy "never"/"yolo" and the
    // adapter-agnostic "bypassPermissions" used by Claude, Grok, etc. When the
    // agent has no native ACP mode for the requested policy we resolve the
    // synthetic request ourselves instead of prompting the user.
    if (policy !== "never" && policy !== "yolo" && policy !== "bypassPermissions") return false;
    return !hasNativeAcpPermissionMode(policy, this.availableModeIds);
  }

  /** Initialize the canonical mapper once we have a stable thread id. */
  private ensureMapperState(): AcpMapperState {
    if (!this.mapperState || this.mapperState.threadId !== this.threadId) {
      this.mapperState = createAcpMapperState(this.threadId);
      // Bridge the client-hosted ACP terminal store into the mapper so
      // `ToolCallContent` entries of type `"terminal"` (Gemini's shell tool)
      // get inlined as the canonical `result` payload.
      this.mapperState.resolveTerminalOutput = (terminalId) =>
        this.acpTerminals.get(terminalId)?.output ?? this.releasedAcpTerminalOutput.get(terminalId);
      this.mapperState.resolveTerminalOutputByCommand = (command) =>
        this.resolveAcpTerminalOutputByCommand(command);
    }
    return this.mapperState;
  }

  private emitRuntimeEvents(events: RuntimeEvent[]): void {
    if (events.length === 0) return;
    if (!this.listener?.onRuntimeEvent) {
      this.bufferedRuntimeEvents.push(...events);
      return;
    }
    for (const event of events) {
      this.listener.onRuntimeEvent(event);
    }
  }

  private emitListenerUpdate(update: StructuredSessionUpdate): void {
    this.currentStatus = update.status;
    this.currentAttention = update.attention;
    this.listener?.onUpdate(update);
  }

  private emitCurrentState(listener: StructuredSessionListener): void {
    const sessionRef = this.currentSessionRef();
    listener.onUpdate({
      status: this.currentStatus,
      attention: this.currentAttention,
      ...(this.currentConfig ? { config: this.currentConfig } : {}),
      ...(sessionRef ? { sessionRef } : {}),
      ...(this.currentSlashCommands !== undefined
        ? { slashCommands: this.currentSlashCommands }
        : {}),
    });
  }

  private updateSlashCommands(commands: AgentSlashCommand[]): void {
    if (areAgentSlashCommandsEqual(this.currentSlashCommands, commands)) {
      return;
    }
    this.currentSlashCommands = commands;
    const sessionRef = this.currentSessionRef();
    this.emitListenerUpdate({
      status: this.currentStatus,
      attention: this.currentAttention,
      ...(this.currentConfig ? { config: this.currentConfig } : {}),
      ...(sessionRef ? { sessionRef } : {}),
      slashCommands: commands,
    });
  }

  private currentSessionRef(): SessionRef | undefined {
    if (!this.sessionId) return undefined;
    if (this.stableSessionRef?.providerSessionId !== this.sessionId) {
      this.stableSessionRef = createKnownSessionRef(this.sessionId);
    }
    return this.stableSessionRef;
  }

  private adoptSessionRef(sessionRef: SessionRef): void {
    this.sessionId = sessionRef.providerSessionId;
    this.stableSessionRef = sessionRef;
  }

  private rememberSessionOptions(availableModeIds: string[], configOptions: unknown): void {
    this.availableModeIds = availableModeIds;
    this.currentConfigOptions = Array.isArray(configOptions) ? configOptions : [];
    this.modeConfigId = findSelectConfigOption(configOptions, "mode")?.id;
    const modelConfig = findSelectConfigOption(configOptions, "model");
    this.modelConfigValue = modelConfig?.currentValue;
    this.thoughtLevelConfigId = findThoughtLevelConfig(configOptions)?.id;
  }

  private async applyTurnConfig(config: ThreadConfig): Promise<void> {
    if (!this.sessionId) {
      return;
    }

    const previousConfig = this.currentConfig;
    const nextModeId = resolveAcpMode(config, this.availableModeIds);
    const previousModeId = previousConfig
      ? resolveAcpMode(previousConfig, this.availableModeIds)
      : undefined;

    if (nextModeId && nextModeId !== previousModeId && this.modeConfigId) {
      try {
        const result = await this.connection.setSessionConfigOption({
          sessionId: this.sessionId,
          configId: this.modeConfigId,
          value: nextModeId,
        });
        this.rememberSessionOptions(this.availableModeIds, result.configOptions);
        console.log("[acp] mode config set to:", nextModeId);
      } catch (error) {
        console.log(
          "[acp] live mode config change rejected, continuing: %s",
          error instanceof Error ? error.message : String(error),
        );
      }
    } else if (nextModeId && nextModeId !== previousModeId) {
      try {
        await this.connection.setSessionMode({ sessionId: this.sessionId, modeId: nextModeId });
        console.log("[acp] mode set to:", nextModeId);
      } catch (error) {
        console.log(
          "[acp] live mode change rejected, continuing: %s",
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    const modelConfig = resolveModelConfigValue(config, this.currentConfigOptions);
    if (
      config.model !== previousConfig?.model ||
      (modelConfig && modelConfig.value !== this.modelConfigValue)
    ) {
      if (modelConfig) {
        try {
          const result = await this.connection.setSessionConfigOption({
            sessionId: this.sessionId,
            configId: modelConfig.configId,
            value: modelConfig.value,
          });
          this.rememberSessionOptions(this.availableModeIds, result.configOptions);
          console.log("[acp] model config set to:", modelConfig.value);
        } catch (error) {
          console.log(
            "[acp] live model config change rejected, continuing: %s",
            error instanceof Error ? error.message : String(error),
          );
        }
      } else {
        try {
          await this.connection.unstable_setSessionModel({
            sessionId: this.sessionId,
            modelId: config.model,
          });
          console.log("[acp] model set to:", config.model);
        } catch (error) {
          console.log(
            "[acp] live model change rejected, continuing: %s",
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }

    if (config.effort && this.thoughtLevelConfigId && config.effort !== previousConfig?.effort) {
      try {
        await this.connection.setSessionConfigOption({
          sessionId: this.sessionId,
          configId: this.thoughtLevelConfigId,
          value: config.effort,
        });
        console.log("[acp] effort set to:", config.effort);
      } catch (error) {
        console.log(
          "[acp] live effort change rejected, continuing: %s",
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    this.currentConfig = config;
  }

  /**
   * Spawn the ACP agent process and create a session handle.
   *
   * The `command` should launch the CLI in ACP mode (e.g. `gemini --acp`).
   * The SDK communicates over stdin/stdout using newline-delimited JSON.
   */
  static create(
    command: CommandSpec,
    projectLocation: ProjectLocation,
    threadId: string,
    options?: AcpStructuredSessionOptions,
  ): AcpStructuredSession {
    const sessionCwd = resolveSessionCwd(projectLocation);
    const spawnCwd = command.cwd ?? resolveSpawnCwd(projectLocation);

    const child = spawnChild(command.command, command.args, {
      ...(spawnCwd ? { cwd: spawnCwd } : {}),
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, TERM: "xterm-256color", ...(command.env ?? {}) },
      shell: false,
      windowsHide: true,
    });

    // Track spawn outcome — activate() awaits this before writing to stdin.
    const spawnReady = new Promise<void>((resolve, reject) => {
      child.on("error", (err) => {
        console.log("[acp] spawn error:", err.message);
        reject(new Error(`ACP agent failed to start: ${err.message}`));
      });
      child.on("spawn", resolve);
    });

    // Collect stderr for error diagnostics
    const stderrChunks: string[] = [];
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk);
      console.log("[acp stderr]", text.trimEnd());
      stderrChunks.push(text);
      if (stderrChunks.length > 20) stderrChunks.shift();
    });

    // Wrap Node.js streams into Web Streams for the ACP SDK.
    // The Node.js → Web Stream adapters produce compatible types but
    // tsgo's strict generics require explicit casts.
    const toAgent = Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>;
    const fromAgent = Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>;
    const stream = filterAcpInboundNoise(ndJsonStream(toAgent, fromAgent));

    let session: AcpStructuredSession;

    const connection = new ClientSideConnection(
      (_agent): Client => ({
        requestPermission(params: RequestPermissionRequest) {
          return session.handlePermissionRequest(params);
        },
        unstable_createElicitation(params: CreateElicitationRequest) {
          return session.handleElicitationRequest(params);
        },
        unstable_completeElicitation(params: CompleteElicitationNotification) {
          session.handleElicitationComplete(params);
          return Promise.resolve();
        },
        sessionUpdate(params: SessionNotification) {
          session.handleSessionUpdate(params);
          return Promise.resolve();
        },
        async readTextFile(params) {
          return session.handleReadTextFile(params);
        },
        async writeTextFile(params) {
          return session.handleWriteTextFile(params);
        },
        async createTerminal(params: CreateTerminalRequest) {
          return session.handleCreateTerminal(params);
        },
        async terminalOutput(params: TerminalOutputRequest) {
          return session.handleTerminalOutput(params);
        },
        async releaseTerminal(params: ReleaseTerminalRequest) {
          session.handleReleaseTerminal(params);
          return {};
        },
        waitForTerminalExit(params: WaitForTerminalExitRequest) {
          return session.handleWaitForTerminalExit(params);
        },
        async killTerminal(params: KillTerminalRequest) {
          session.handleKillTerminal(params);
          return {};
        },
        extNotification(method: string, params: Record<string, unknown>) {
          session.handleExtNotification(method, params);
          return Promise.resolve();
        },
        extMethod(method: string, params: Record<string, unknown>) {
          session.handleExtNotification(method, params);
          return Promise.resolve({});
        },
      }),
      stream,
    );

    session = new AcpStructuredSession(
      child,
      connection,
      projectLocation,
      sessionCwd,
      threadId,
      options,
    );
    session.spawnReady = spawnReady;
    session.stderrChunks.push(...stderrChunks);

    // Handle connection close
    void connection.closed.then(() => {
      if (!session.isDisposed) {
        session.listener?.onClose();
      }
    });

    child.once("exit", (code) => {
      // Quiet path: the structured session is one-shot for adapters whose
      // `liveInputMode === "terminal"` (every adapter today). The runtime
      // disposes us once `openThread` returns, and some agents (OpenCode)
      // exit non-zero on stdin close even when everything went fine —
      // there's nothing actionable to surface in that case.
      const expected = session.isDisposed || session.sessionId !== undefined;
      if (expected) {
        console.log(`[acp] child exited (code ${code})`);
      } else {
        console.log(`[acp] child exited unexpectedly (code ${code})`);
      }
      if (!session.isDisposed) {
        session.listener?.onClose();
      }
    });

    return session;
  }

  setListener(listener: StructuredSessionListener): void {
    this.listener = listener;

    // Drain any runtime events that landed before the listener was wired
    // (turn.started / user_message from startTurn typically race ahead of
    // spawnThread's setListener call).
    if (listener.onRuntimeEvent && this.bufferedRuntimeEvents.length > 0) {
      const drained = this.bufferedRuntimeEvents;
      this.bufferedRuntimeEvents = [];
      for (const event of drained) {
        listener.onRuntimeEvent(event);
      }
    }

    // Re-emit current state for late listeners
    if (this.sessionId || this.currentConfig || this.currentSlashCommands !== undefined) {
      this.emitCurrentState(listener);
    }
  }

  /**
   * Phase 1: Initialize the ACP protocol handshake.
   */
  async activate(): Promise<void> {
    if (this.isDisposed) {
      throw new Error("ACP session was disposed before activation.");
    }
    await this.spawnReady;

    console.log("[acp] sending initialize...");
    const initResult = await this.connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: "lightcode", version: "0.1.0" },
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        elicitation: { form: {}, url: {} },
        terminal: true,
      },
    });
    this.agentPromptCapabilities = initResult.agentCapabilities?.promptCapabilities;
    this.agentSessionCapabilities = initResult.agentCapabilities?.sessionCapabilities;
    this.agentMcpCapabilities = initResult.agentCapabilities?.mcpCapabilities;
    console.log(
      "[acp] initialized — protocol v%d, agent: %s",
      initResult.protocolVersion,
      initResult.agentInfo?.name ?? "unknown",
    );

    if (initResult.authMethods?.length) {
      console.log("[acp] agent advertised auth methods:", initResult.authMethods.length);
    }
  }

  /**
   * Phase 2: Create or resume an ACP session.
   *
   * The agent's response includes its available modes and models.
   * We store them to map Poracode's `ThreadConfig` to the correct
   * ACP mode/model IDs (which vary per agent).
   */
  /**
   * Drop HTTP MCP servers when the agent's `initialize` response does not
   * advertise `mcpCapabilities.http === true`. Some ACP agents (e.g. Factory
   * Droid via `droid exec --output-format acp-daemon`) reject `newSession`
   * outright with an internal error when handed an HTTP MCP server they can't
   * support, instead of ignoring it — which would kill the thread launch. This
   * is provider-agnostic: it keys purely off the advertised capability, so
   * agents that DO support HTTP MCP (Cursor, Grok, Gemini) keep their servers.
   */
  private gateHttpMcpServers(servers: AcpHttpMcpServer[]): AcpHttpMcpServer[] {
    const kept = gateAcpHttpMcpServers(servers, this.agentMcpCapabilities);
    if (kept.length < servers.length) {
      console.log(
        "[acp] dropping %d HTTP MCP server(s) — agent does not advertise mcpCapabilities.http; launching without them: %s",
        servers.length - kept.length,
        servers.map((s) => s.name).join(", "),
      );
    }
    return kept;
  }

  async openThread(config: ThreadConfig, sessionRef?: SessionRef): Promise<string> {
    let availableModeIds: string[] = [];
    let configOptions: unknown[] = [];
    this.currentConfig = undefined;
    this.currentSlashCommands = undefined;
    const mcpServers = this.gateHttpMcpServers([
      ...(await buildAcpBrowserMcpServers(
        this.projectLocation,
        config.browserMcp === true,
        this.browserMcp,
      )),
      ...buildAcpSubagentMcpServers(config.subagentMcp === true, this.subagentMcp),
    ]);

    if (sessionRef) {
      if (this.agentSessionCapabilities?.resume !== undefined) {
        console.log("[acp] resuming session:", sessionRef.providerSessionId);
        this.isReplayingHistory = true;
        this.replayHistoryUntil = Infinity;
        try {
          const result = await this.connection.resumeSession({
            sessionId: sessionRef.providerSessionId,
            cwd: this.cwd,
            mcpServers,
          });
          this.adoptSessionRef(sessionRef);
          availableModeIds = result.modes?.availableModes?.map((m) => m.id) ?? [];
          configOptions = result.configOptions ?? [];
        } catch (error) {
          throw this.loadSessionErrorRewriter(error, sessionRef.providerSessionId);
        } finally {
          this.isReplayingHistory = false;
          this.replayHistoryUntil = Date.now() + 500;
        }
      } else {
        console.log("[acp] loading session:", sessionRef.providerSessionId);
        this.isReplayingHistory = true;
        this.replayHistoryUntil = Infinity;
        try {
          const result = await this.connection.loadSession({
            sessionId: sessionRef.providerSessionId,
            cwd: this.cwd,
            mcpServers,
          });
          this.adoptSessionRef(sessionRef);
          availableModeIds = result.modes?.availableModes?.map((m) => m.id) ?? [];
          configOptions = result.configOptions ?? [];
        } catch (error) {
          throw this.loadSessionErrorRewriter(error, sessionRef.providerSessionId);
        } finally {
          this.isReplayingHistory = false;
          this.replayHistoryUntil = Date.now() + 500;
        }
      }
    } else {
      console.log("[acp] creating new session in", this.cwd);
      const result = await this.connection.newSession({
        cwd: this.cwd,
        mcpServers,
      });
      this.sessionId = result.sessionId;
      this.stableSessionRef = createKnownSessionRef(result.sessionId);
      availableModeIds = result.modes?.availableModes?.map((m) => m.id) ?? [];
      configOptions = result.configOptions ?? [];
      console.log("[acp] session created:", this.sessionId, "modes:", availableModeIds);
    }

    this.rememberSessionOptions(availableModeIds, configOptions);
    await this.applyTurnConfig(config);

    if (this.sessionId) {
      this.launchOptions = { ...this.launchOptions, resumeThreadId: this.sessionId };
    }
    return this.sessionId!;
  }

  /**
   * Phase 3: Send a prompt to the agent.
   *
   * `prompt()` is async and resolves when the turn completes (the agent
   * returns a `stopReason`). During the turn, `session/update` notifications
   * flow through `handleSessionUpdate` which emits status updates.
   */
  async startTurn(
    prompt: string,
    config: ThreadConfig,
    segments?: PromptSegment[],
    options?: StartTurnOptions,
  ): Promise<void> {
    if (!this.sessionId) {
      throw new Error("ACP session not opened yet.");
    }
    this.currentTurnInterruptRequested = false;
    this.recentInterruptAckTextTail = "";
    this.agentSurfacedErrorMessage = undefined;

    await this.applyTurnConfig(config);

    // Mark a new canonical turn and surface the user-typed message as a
    // user_message item (the prompt itself doesn't generate a session/update).
    // When the runtime has already pushed an optimistic user_message ahead of
    // structured-session setup, we reuse the same item id so the renderer's
    // per-id dedupe drops this duplicate emit.
    this.currentTurnId = `turn-${randomUUID()}`;
    const userItemId = options?.userMessageItemId ?? `user-${this.currentTurnId}`;
    this.emitRuntimeEvents([
      { type: "turn.started", threadId: this.threadId, turnId: this.currentTurnId },
      {
        type: "item.started",
        threadId: this.threadId,
        itemId: userItemId,
        itemType: "user_message",
        payload: {
          content: buildPromptContentBlocks(prompt, segments),
        },
      },
      { type: "item.completed", threadId: this.threadId, itemId: userItemId },
    ]);

    // Signal working state immediately
    this.emitListenerUpdate({ status: "working", attention: "working" });

    const contentBlocks = await segmentsToContentBlocks(
      prompt,
      this.projectLocation,
      segments,
      this.agentPromptCapabilities,
    );

    try {
      this.promptInFlight = true;
      // If `interruptTurn()` was called between `startTurn` entry and this
      // point (rare, but possible: the supervisor stages a steer immediately
      // after a previous turn ended), fire the cancel now so the agent
      // doesn't process this prompt.
      if (this.pendingPromptInterrupt && this.sessionId) {
        this.pendingPromptInterrupt = false;
        await this.connection.cancel({ sessionId: this.sessionId });
      }
      const result = await this.connection.prompt({
        sessionId: this.sessionId,
        prompt: contentBlocks,
      });
      const usageEvent = createAcpPromptUsageEvent(this.threadId, result.usage);
      if (usageEvent) this.emitRuntimeEvents([usageEvent]);

      // Map stopReason to Poracode status
      const normalizedStopReason = normalizeAcpStopReason(result.stopReason, {
        interruptRequested: this.currentTurnInterruptRequested,
        recentAgentText: this.recentInterruptAckTextTail,
      });
      this.emitTurnStatusAfterPrompt(normalizedStopReason);
      this.completeTurn(
        this.ensureMapperState(),
        this.agentSurfacedErrorMessage
          ? "failed"
          : normalizedStopReason === "cancelled"
            ? "cancelled"
            : "completed",
      );
    } catch (error) {
      if (this.isDisposed) return;
      this.emitPromptFailure(error);
    } finally {
      this.promptInFlight = false;
      this.pendingPromptInterrupt = false;
      this.currentTurnInterruptRequested = false;
      this.recentInterruptAckTextTail = "";
      this.agentSurfacedErrorMessage = undefined;
      // The mapper's per-turn item state has been cleared via
      // `closeOpenTurnItems`, so any output snapshots from terminals that
      // belonged to this turn are no longer reachable. Drop them so the cache
      // can't grow across a long-lived session.
      this.releasedAcpTerminalOutput.clear();
      this.clearAcpToolCallItemIdMap();
    }
  }

  /**
   * Respond to a permission request from the agent.
   */
  async resolveServerRequest(requestId: ThreadServerRequestId, response: unknown): Promise<void> {
    // The permission response is stored and resolved by the pending promise
    // in handlePermissionRequest. The runtime calls this with the user's
    // chosen option.
    const resolver = this.pendingPermissionResolvers.get(requestId);
    if (resolver) {
      this.pendingPermissionResolvers.delete(requestId);
      resolver(response);
      return;
    }
    this.resolvePendingElicitationRequest(requestId, response);
  }

  async interruptTurn(): Promise<void> {
    if (!this.sessionId || this.isDisposed) {
      return;
    }

    this.cancelPendingServerRequests();
    this.currentTurnInterruptRequested = true;
    // Race guard: if interrupt fires before `connection.prompt()` has been
    // entered (e.g. the supervisor stages a steer in the same microtask as
    // a fresh startTurn), set a flag instead of issuing the cancel directly.
    // The cancel would land on an idle session and be silently ignored;
    // `startTurn` checks the flag right before awaiting `prompt()` and fires
    // the cancel from there. Mirrors codex/acp.ts:584-599.
    if (!this.promptInFlight) {
      this.pendingPromptInterrupt = true;
      return;
    }
    await this.connection.cancel({ sessionId: this.sessionId });
  }

  async dispose(): Promise<void> {
    if (this.isDisposed) return;
    this.isDisposed = true;

    this.cancelPendingServerRequests();
    this.releaseAllAcpTerminals();

    if (this.sessionId && this.agentSessionCapabilities?.close !== undefined) {
      try {
        await this.connection.closeSession({ sessionId: this.sessionId });
      } catch (error) {
        console.warn("[acp] session/close failed during dispose:", error);
      }
    }

    // Don't send cancel — the ACP process may not be generating,
    // and the connection may already be closing. Just kill the process.

    if (!this.child.killed) {
      terminateChildProcessTree(this.child);
    }
  }

  // ── Resume artifacts ──────────────────────────────────────────

  /**
   * Wait for the session file to appear on disk.
   *
   * Called by the runtime AFTER `startTurn` fires the initial prompt.
   * Gemini's ACP mode persists the session to disk during prompt processing.
   * The TUI needs this file to exist before `--resume <id>` will work.
   *
   * Polls `~/.gemini/tmp/<project>/chats/` for a file containing the session UUID.
   */
  async ensureResumeArtifacts(): Promise<void> {
    if (!this.sessionId) return;

    const projectName = basename(this.cwd);
    const chatsDir = join(homedir(), ".gemini", "tmp", projectName, "chats");
    const uuid8 = this.sessionId.split("-")[0] ?? this.sessionId.slice(0, 8);

    console.log("[acp] waiting for session file (uuid prefix: %s)...", uuid8);

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      try {
        const { readdirSync } = await import("node:fs");
        const files = readdirSync(chatsDir);
        const match = files.find((f) => f.includes(uuid8) && f.endsWith(".json"));
        if (match) {
          console.log("[acp] session file found:", join(chatsDir, match));
          return;
        }
      } catch {
        // Directory may not exist yet
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    console.log("[acp] session file not found after timeout, proceeding anyway");
  }

  // ── Internal handlers ────────────────────────────────────────

  private assertRequestSession(sessionId: string): void {
    if (!this.sessionId || sessionId !== this.sessionId) {
      throw RequestError.invalidParams({ message: `Unknown ACP session: ${sessionId}` });
    }
  }

  private async handleReadTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    this.assertRequestSession(params.sessionId);
    const path = resolveAcpReadableHostFsPath(this.projectLocation, params.path);
    const fullContent = await readFile(path, "utf8");
    const content = sliceTextFileContent(fullContent, params.line, params.limit);
    return { content };
  }

  private async handleWriteTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    this.assertRequestSession(params.sessionId);
    const path = resolveAcpHostFsPath(this.projectLocation, params.path);
    await writeFile(path, params.content, "utf8");
    return {};
  }

  private handleCreateTerminal(params: CreateTerminalRequest): CreateTerminalResponse {
    this.assertRequestSession(params.sessionId);
    if (this.acpTerminals.size >= MAX_ACP_TERMINALS_PER_SESSION) {
      throw RequestError.invalidParams({
        message: `ACP terminal limit reached (${MAX_ACP_TERMINALS_PER_SESSION}); release existing terminals before creating more.`,
      });
    }
    const terminalId = `acp-terminal-${this.acpTerminalSeq++}`;
    const cwd = params.cwd
      ? resolveAcpTerminalCwd(this.projectLocation, params.cwd)
      : resolveAcpTerminalCwd(this.projectLocation, this.cwd);
    const launch = buildAcpTerminalLaunch(
      this.projectLocation,
      cwd,
      params.command,
      params.args ?? [],
      acpTerminalEnvEntries(params.env),
    );
    const outputByteLimit =
      typeof params.outputByteLimit === "number" ? params.outputByteLimit : undefined;

    if (process.platform === "win32") {
      const child = spawnChild(launch.command, launch.args, {
        ...(launch.cwd ? { cwd: launch.cwd } : {}),
        env: launch.env,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
      });
      const record: AcpTerminalRecord = {
        kill: () => terminateChildProcessTree(child),
        commandLine: buildTerminalCommandLine(params.command, params.args ?? []),
        output: "",
        outputByteLimit,
        truncated: false,
        exitStatus: undefined,
        waiters: [],
        subscriptions: [],
      };
      this.acpTerminals.set(terminalId, record);
      this.acpTerminalCommandById.set(terminalId, record.commandLine);
      child.stdout?.on("data", (chunk) => appendTerminalOutput(record, String(chunk)));
      child.stderr?.on("data", (chunk) => appendTerminalOutput(record, String(chunk)));
      child.once("error", (error) => {
        appendTerminalOutput(record, `${error.message}\n`);
        completeAcpTerminal(record, { exitCode: 1 });
      });
      child.once("exit", (code, signal) => {
        completeAcpTerminal(record, childExitStatus(code, signal));
      });
      return { terminalId };
    }

    ensureNodePtySpawnHelperExecutable();
    const pty = spawnPty(launch.command, launch.args, {
      ...(launch.cwd ? { cwd: launch.cwd } : {}),
      env: launch.env,
      cols: 80,
      rows: 24,
    });
    const record: AcpTerminalRecord = {
      kill: () => pty.kill(),
      commandLine: buildTerminalCommandLine(params.command, params.args ?? []),
      output: "",
      outputByteLimit,
      truncated: false,
      exitStatus: undefined,
      waiters: [],
      subscriptions: [],
    };
    this.acpTerminals.set(terminalId, record);
    this.acpTerminalCommandById.set(terminalId, record.commandLine);
    record.subscriptions.push(pty.onData((data) => appendTerminalOutput(record, data)));
    record.subscriptions.push(
      pty.onExit((event) => {
        completeAcpTerminal(record, {
          exitCode: event.exitCode,
          ...(event.signal ? { signal: String(event.signal) } : {}),
        });
      }),
    );
    return { terminalId };
  }

  private handleTerminalOutput(params: TerminalOutputRequest): TerminalOutputResponse {
    this.assertRequestSession(params.sessionId);
    const record = this.getAcpTerminal(params.terminalId);
    return {
      output: record.output,
      truncated: record.truncated,
      ...(record.exitStatus ? { exitStatus: record.exitStatus } : {}),
    };
  }

  private handleReleaseTerminal(params: ReleaseTerminalRequest): void {
    this.assertRequestSession(params.sessionId);
    const record = this.getAcpTerminal(params.terminalId);
    this.disposeAcpTerminal(params.terminalId, record);
  }

  private async handleWaitForTerminalExit(
    params: WaitForTerminalExitRequest,
  ): Promise<WaitForTerminalExitResponse> {
    this.assertRequestSession(params.sessionId);
    const record = this.getAcpTerminal(params.terminalId);
    if (record.exitStatus) return record.exitStatus;
    return new Promise((resolve) => {
      record.waiters.push(resolve);
    });
  }

  private handleKillTerminal(params: KillTerminalRequest): void {
    this.assertRequestSession(params.sessionId);
    const record = this.getAcpTerminal(params.terminalId);
    if (!record.exitStatus) {
      record.kill();
    }
  }

  private getAcpTerminal(terminalId: string): AcpTerminalRecord {
    const record = this.acpTerminals.get(terminalId);
    if (!record) {
      throw RequestError.invalidParams({ message: `Unknown ACP terminal: ${terminalId}` });
    }
    return record;
  }

  private releaseAllAcpTerminals(): void {
    for (const [terminalId, record] of [...this.acpTerminals]) {
      this.disposeAcpTerminal(terminalId, record);
    }
  }

  private disposeAcpTerminal(terminalId: string, record: AcpTerminalRecord): void {
    this.acpTerminals.delete(terminalId);
    if (record.output.length > 0) {
      this.releasedAcpTerminalOutput.set(terminalId, record.output);
    }
    for (const subscription of record.subscriptions.splice(0)) {
      subscription.dispose();
    }
    if (!record.exitStatus) {
      record.kill();
    }
    completeAcpTerminal(record, record.exitStatus ?? { signal: "SIGTERM" });
  }

  private resolveAcpTerminalOutputByCommand(command: string): string | undefined {
    const target = normalizeTerminalCommandText(command);
    if (!target) return undefined;

    for (const [_terminalId, record] of [...this.acpTerminals].reverse()) {
      if (!record.output || !isSameTerminalCommand(target, record.commandLine)) continue;
      return record.output;
    }
    for (const [terminalId, output] of [...this.releasedAcpTerminalOutput].reverse()) {
      const commandLine = this.acpTerminalCommandById.get(terminalId);
      if (!output || !commandLine || !isSameTerminalCommand(target, commandLine)) continue;
      return output;
    }
    return undefined;
  }

  private readonly pendingPermissionResolvers = new Map<
    ThreadServerRequestId,
    (response: unknown) => void
  >();
  private readonly pendingElicitationResolvers = new Map<
    ThreadServerRequestId,
    {
      resolve: (response: unknown) => void;
      elicitationId?: string;
      request: CreateElicitationRequest;
    }
  >();
  private readonly pendingElicitationRequestIdsByElicitationId = new Map<
    string,
    ThreadServerRequestId
  >();

  private permissionRequestSeq = 0;
  private elicitationRequestSeq = 0;

  private cancelPendingServerRequests(): void {
    const cancelledIds: ThreadServerRequestId[] = [];
    for (const [requestId, resolver] of this.pendingPermissionResolvers) {
      cancelledIds.push(requestId);
      resolver({ outcome: { outcome: "cancelled" } });
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
      this.emitRuntimeEvents(
        cancelledIds.map((requestId) => ({
          type: "request.resolved",
          threadId: this.threadId,
          requestId: String(requestId),
          outcome: "cancelled",
        })),
      );
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
    this.emitRuntimeEvents(
      buildAcpElicitationAnswerEvents({
        threadId: this.threadId,
        itemId: `acp-question-answer-${String(requestId)}`,
        request: entry.request,
        response,
      }),
    );
    return true;
  }

  /**
   * Handle `requestPermission` calls from the agent.
   *
   * Maps ACP permission requests to Poracode's `ThreadServerRequest` system.
   * The agent blocks until we respond — we create a pending promise and emit
   * the request to the UI via the listener.
   */
  private handlePermissionRequest(
    params: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse> {
    if (this.shouldAutoApproveSyntheticPermissionRequest()) {
      const optionId = selectAutoApprovedPermissionOption(params);
      if (optionId) {
        return Promise.resolve({ outcome: { outcome: "selected", optionId } });
      }
    }

    return new Promise<RequestPermissionResponse>((resolve) => {
      const requestId = `acp-perm-${this.permissionRequestSeq++}`;

      this.pendingPermissionResolvers.set(requestId, (response: unknown) => {
        const resp = response as { optionId?: string } | undefined;
        if (resp?.optionId) {
          resolve({ outcome: { outcome: "selected", optionId: resp.optionId } });
        } else {
          resolve({ outcome: { outcome: "cancelled" } });
        }
      });

      // Emit a canonical request.opened — the composer-level runtime-request
      // panel renders it and resolves through `bridge.resolveThreadServerRequest`
      // → `resolveServerRequest()` here.
      const mapperState = this.ensureMapperState();
      this.emitRuntimeEvents([mapAcpPermissionRequest(params, mapperState, String(requestId))]);

      // Also signal that the thread needs approval
      this.emitListenerUpdate({ status: "needs_approval", attention: "needs_approval" });
    });
  }

  private handleElicitationRequest(
    params: CreateElicitationRequest,
  ): Promise<CreateElicitationResponse> {
    return new Promise<CreateElicitationResponse>((resolve) => {
      const requestId = `acp-elicit-${this.elicitationRequestSeq++}`;
      const urlElicitationId = params.mode === "url" ? params.elicitationId : undefined;

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

      const mapperState = this.ensureMapperState();
      this.emitRuntimeEvents([mapAcpElicitationRequest(params, mapperState, String(requestId))]);
      this.emitListenerUpdate({ status: "needs_reply", attention: "needs_reply" });
    });
  }

  private handleElicitationComplete(params: CompleteElicitationNotification): void {
    const requestId = this.pendingElicitationRequestIdsByElicitationId.get(params.elicitationId);
    if (!requestId) return;
    if (this.resolvePendingElicitationRequest(requestId, { action: "accept" })) {
      this.emitRuntimeEvents([
        {
          type: "request.resolved",
          threadId: this.threadId,
          requestId: String(requestId),
          outcome: "answered",
        },
      ]);
    }
  }

  /**
   * Handle vendor-extension JSON-RPC notifications (methods outside the ACP
   * spec). The SDK routes anything that isn't `session/update` or
   * `session/elicitation_complete` here; without a handler the connection
   * throws `methodNotFound` and logs every notification as an error.
   *
   * Grok's `_x.ai/session_notification` carries the same `{ sessionId, update }`
   * shape as a standard `session/update`, just with extension-only
   * `sessionUpdate` discriminators (`hook_execution`, etc.). Forward it to the
   * normal handler — the canonical mapper falls through to its `default` arm
   * on unrecognized discriminators, so unknown extensions are swallowed
   * without polluting the chat stream.
   */
  private handleExtNotification(method: string, params: Record<string, unknown>): void {
    if (looksLikeAcpSessionNotification(params)) {
      this.handleSessionUpdate(params as unknown as SessionNotification);
      return;
    }
    if (
      this.extensionNotificationHandler &&
      !this.isReplayingHistory &&
      Date.now() >= (this.replayHistoryUntil || 0)
    ) {
      const events = this.extensionNotificationHandler(method, params, {
        threadId: this.threadId,
        resolveToolCallItemId: (toolCallId) => this.acpToolCallIdToItemId.get(toolCallId),
      });
      if (events.length > 0) {
        this.emitRuntimeEvents(events);
      }
    }
  }

  private rememberAcpToolCallItemId(
    notification: SessionNotification,
    events: RuntimeEvent[],
  ): void {
    const update = notification.update;
    if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") {
      return;
    }
    const toolCallId = (update as { toolCallId?: unknown }).toolCallId;
    if (typeof toolCallId !== "string" || toolCallId.length === 0) return;

    const fromMapper = this.mapperState?.toolCallItems.get(toolCallId)?.itemId;
    if (fromMapper) {
      this.acpToolCallIdToItemId.set(toolCallId, fromMapper);
      return;
    }

    for (const event of events) {
      if (event.type !== "item.started" || event.itemType !== "tool_call") continue;
      this.acpToolCallIdToItemId.set(toolCallId, event.itemId);
      return;
    }
  }

  private clearAcpToolCallItemIdMap(): void {
    this.acpToolCallIdToItemId.clear();
  }

  /**
   * Handle `session/update` notifications from the agent.
   *
   * These are the real-time updates the agent sends while processing
   * a turn: text chunks, tool calls, plan updates, etc.
   */
  private handleSessionUpdate(rawParams: SessionNotification): void {
    maybeCaptureAcpUpdate(rawParams, this.threadId, this.sessionId, this.cwd);

    const params = this.applySessionUpdateTransform(rawParams);
    const update: SessionUpdate = params.update;

    if (update.sessionUpdate === "available_commands_update") {
      this.updateSlashCommands(mapAcpSlashCommands(update.availableCommands));
      if (this.isReplayingHistory) {
        return;
      }
    }

    // Emit canonical events for chat-mode renderers. The legacy text/status
    // path below stays in place — terminal-mode threads still get all the
    // existing behaviour, and the canonical channel runs in parallel.
    //
    // During session resume/load the agent may replay persisted history as
    // `session/update` notifications. Poracode already has those messages
    // in its own DB, so we skip canonical mapping for the replay window to
    // avoid duplicating every message in the chat pane.
    if (!this.isReplayingHistory && Date.now() >= (this.replayHistoryUntil || 0)) {
      const events = mapAcpSessionUpdate(params, this.ensureMapperState());
      this.rememberAcpToolCallItemId(params, events);
      if (events.length > 0) {
        this.recordAgentSurfacedError(events);
        this.emitRuntimeEvents(events);
      }
    } else {
      return;
    }

    switch (update.sessionUpdate) {
      case "agent_message_chunk": {
        const content = (update as { content?: ContentBlock }).content;
        if (
          this.currentTurnInterruptRequested &&
          content?.type === "text" &&
          content.text.length > 0
        ) {
          this.recentInterruptAckTextTail = appendInterruptAckTextTail(
            this.recentInterruptAckTextTail,
            content.text,
          );
        }
      }
      // fallthrough
      case "agent_thought_chunk":
      case "user_message_chunk":
        // Agent is producing output — stay in "working" state
        break;

      case "tool_call":
        // Agent started a tool call — working state
        this.emitListenerUpdate({ status: "working", attention: "working" });
        break;

      case "tool_call_update":
        // Tool call status changed — still working
        break;

      case "plan":
        // Agent shared its plan — working state
        break;

      case "available_commands_update":
        break;

      case "current_mode_update":
        if (
          this.currentConfig &&
          "currentModeId" in update &&
          typeof update.currentModeId === "string"
        ) {
          const nextConfig = applyAcpModeUpdateToConfig(this.currentConfig, update.currentModeId);
          if (!isThreadConfigEqual(this.currentConfig, nextConfig)) {
            this.currentConfig = nextConfig;
            const sessionRef = this.currentSessionRef();
            // Mode-change confirmations are metadata, not turn boundaries —
            // preserve the live status so the renderer's working-time clock
            // doesn't reset when the agent echoes back a setSessionMode call.
            this.emitListenerUpdate({
              status: this.currentStatus,
              attention: this.currentAttention,
              config: nextConfig,
              ...(sessionRef ? { sessionRef } : {}),
            });
          }
        }
        break;

      case "config_option_update":
        if (this.currentConfig && "configOptions" in update) {
          this.rememberSessionOptions(this.availableModeIds, update.configOptions);
          const thoughtLevelConfig = findThoughtLevelConfig(update.configOptions);
          if (
            thoughtLevelConfig?.currentValue &&
            thoughtLevelConfig.currentValue !== this.currentConfig.effort
          ) {
            const nextConfig = { ...this.currentConfig, effort: thoughtLevelConfig.currentValue };
            this.currentConfig = nextConfig;
            const sessionRef = this.currentSessionRef();
            this.emitListenerUpdate({
              status: this.currentStatus,
              attention: this.currentAttention,
              config: nextConfig,
              ...(sessionRef ? { sessionRef } : {}),
            });
          }
        }
        break;

      case "session_info_update": {
        // Session metadata (title) updates are not evidence of active work.
        break;
      }

      default:
        break;
    }
  }

  private recordAgentSurfacedError(events: RuntimeEvent[]): void {
    for (const event of events) {
      if (event.type !== "error") continue;
      this.agentSurfacedErrorMessage = event.message;
      this.emitListenerUpdate({
        status: "error",
        attention: "error",
        errorMessage: event.message,
      });
      return;
    }
  }

  private emitTurnStatusAfterPrompt(normalizedStopReason: string): void {
    if (this.agentSurfacedErrorMessage) {
      this.emitListenerUpdate({
        status: "error",
        attention: "error",
        errorMessage: this.agentSurfacedErrorMessage,
      });
      return;
    }
    const { status, attention } = this.mapStopReason(normalizedStopReason);
    this.emitListenerUpdate({ status, attention });
  }

  private completeTurn(
    mapperState: AcpMapperState,
    turnState: "completed" | "cancelled" | "failed",
  ): void {
    if (!this.currentTurnId) return;
    this.emitRuntimeEvents([
      ...closeOpenTurnItems(mapperState),
      {
        type: "turn.completed",
        threadId: this.threadId,
        turnId: this.currentTurnId,
        state: turnState,
      },
    ]);
  }

  private emitPromptFailure(error: unknown): void {
    const headerMessage = resolveAcpPromptFailureMessage(error, this.agentSurfacedErrorMessage);
    const rpcMessage = resolveAcpPromptRpcErrorMessage(error);
    this.emitListenerUpdate({
      status: "error",
      attention: "error",
      errorMessage: headerMessage,
    });
    const mapperState = this.ensureMapperState();
    const events: RuntimeEvent[] = [...closeOpenTurnItems(mapperState)];
    if (shouldEmitAcpPromptRpcErrorItem(error, this.agentSurfacedErrorMessage)) {
      events.push({ type: "error", threadId: this.threadId, message: rpcMessage });
    }
    if (this.currentTurnId) {
      events.push({
        type: "turn.completed",
        threadId: this.threadId,
        turnId: this.currentTurnId,
        state: "failed",
      });
    }
    this.emitRuntimeEvents(events);
  }

  private mapStopReason(stopReason: string): { status: ThreadStatus; attention: ThreadAttention } {
    switch (stopReason) {
      case "end_turn":
      case "cancelled":
        return { status: "idle", attention: "none" };
      case "max_tokens":
      case "max_turn_requests":
      case "refusal":
        return { status: "error", attention: "error" };
      default:
        return { status: "idle", attention: "none" };
    }
  }

  private applySessionUpdateTransform(notification: SessionNotification): SessionNotification {
    if (!this.sessionUpdateTransform) return notification;
    try {
      return this.sessionUpdateTransform(notification);
    } catch (error) {
      console.error(
        "[acp] sessionUpdateTransform threw — using original notification:",
        error instanceof Error ? error.message : String(error),
      );
      return notification;
    }
  }
}

// ── Factory ──────────────────────────────────────────────────────

/**
 * Decide whether `createAcpStructuredSession` should actually spawn the ACP
 * agent for this thread launch. Pulled out as a pure predicate so adapters
 * (and tests) can audit the contract without instantiating a real process.
 *
 *   - **Terminal resume** → `false`. The TUI re-attaches via its native flag
 *     (`--resume <id>`, `--session <id>`, etc.) and a parallel ACP session
 *     would just waste a process and confuse the renderer.
 *   - **GUI resume** → `true`. The structured session IS the chat surface,
 *     so it must stay live for the thread's whole lifetime; `openThread`
 *     calls `loadSession` to re-attach.
 *   - **Initial launch (any presentation)** → `true`. Even terminal threads
 *     use a short-lived ACP session to allocate the provider session id
 *     before the TUI takes over.
 */
export function shouldSpawnAcpSession(input: CreateStructuredSessionInput): boolean {
  if (input.sessionRef && input.presentationMode !== "gui") {
    return false;
  }
  return true;
}

/**
 * Create an ACP structured session for the given adapter command.
 *
 * Agent adapters call this from their `createStructuredSession()` method,
 * passing the ACP-mode command (e.g. `gemini --acp`, `copilot --acp --stdio`).
 *
 * The factory owns the resume/presentation gating via {@link shouldSpawnAcpSession}
 * so every ACP-speaking provider behaves identically. Adapters should NOT add
 * their own `if (input.sessionRef) return undefined` gate — that's what
 * produced the Copilot GUI-resume regression. Just call this factory
 * unconditionally and trust the shared decision.
 */
export function createAcpStructuredSession(
  acpCommand: CommandSpec,
  input: CreateStructuredSessionInput,
): AcpStructuredSession | undefined {
  if (!shouldSpawnAcpSession(input)) {
    return undefined;
  }
  return AcpStructuredSession.create(acpCommand, input.projectLocation, input.threadId, {
    ...(input.loadSessionErrorRewriter
      ? { loadSessionErrorRewriter: input.loadSessionErrorRewriter }
      : {}),
    ...(input.acpSessionUpdateTransform
      ? { sessionUpdateTransform: input.acpSessionUpdateTransform }
      : {}),
    ...(input.acpExtensionNotificationHandler
      ? { extensionNotificationHandler: input.acpExtensionNotificationHandler }
      : {}),
    ...(input.browserMcp !== undefined ? { browserMcp: input.browserMcp } : {}),
    ...(input.subagentMcp !== undefined ? { subagentMcp: input.subagentMcp } : {}),
  });
}

/**
 * Diagnostic capture of inbound ACP `session/update` notifications.
 *
 * Off by default. Set `LIGHTCODE_ACP_LOG=toolcalls` to capture just
 * `tool_call` / `tool_call_update` updates (what we use to design
 * per-adapter wire-format transforms); set `LIGHTCODE_ACP_LOG=full` to
 * capture every update. Each line is a self-contained JSON object written
 * to the channel's `logs/acp-sessions.jsonl`.
 */
const ACP_LOG_MODE = (() => {
  const mode = process.env.LIGHTCODE_ACP_LOG;
  return mode === "toolcalls" || mode === "full" ? mode : null;
})();
let acpLogDirEnsured = false;

function maybeCaptureAcpUpdate(
  params: SessionNotification,
  threadId: string,
  sessionId: string | undefined,
  cwd: string,
): void {
  if (ACP_LOG_MODE === null) return;
  const kind = params.update.sessionUpdate;
  if (ACP_LOG_MODE === "toolcalls" && kind !== "tool_call" && kind !== "tool_call_update") return;
  try {
    const dir = resolveLightcodePaths(process.env.LIGHTCODE_DATA_DIR).logsDir;
    if (!acpLogDirEnsured) {
      mkdirSync(dir, { recursive: true });
      acpLogDirEnsured = true;
    }
    const line = `${JSON.stringify({
      ts: new Date().toISOString(),
      threadId,
      sessionId,
      cwd,
      notification: params,
    })}\n`;
    appendFileSync(join(dir, "acp-sessions.jsonl"), line, "utf8");
  } catch {
    // capture is best-effort and must never break a session
  }
}
