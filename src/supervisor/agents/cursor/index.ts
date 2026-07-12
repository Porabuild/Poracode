import type { AgentCapability, PromptSegment } from "@/shared/contracts";
import { createAcpStructuredSession } from "../acp";
import {
  buildAgentCommand,
  buildAgentLogoutCommand,
  createKnownSessionRef,
  detectAgentInstall,
  detectProbeLocation,
  type AgentAdapter,
  type AgentEnvContext,
  type CreateStructuredSessionInput,
  type TerminalStatusHint,
} from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { resolveInstallNodePath, warnIfPluginManifestMissing } from "../plugin/installerBase";
import { transformCursorAcpSessionUpdate } from "./acpTransform";
import { handleCursorAcpExtensionNotification } from "./acpExtension";
import { buildCursorArgs } from "./argv";
import {
  cursorDefaultCapabilities,
  cursorDetectionSpec,
  isCursorVersionSupportedForHooks,
} from "./detection";
import {
  installCursorPlugin,
  isCursorPluginInstalled,
  readBundledCursorPluginVersion,
  uninstallCursorPlugin,
} from "./plugin/install";
import { createCursorChatSync } from "./session";
import { CURSOR_IDLE_RE, CURSOR_WORKING_RE, detectCursorTerminalStatus } from "./terminal";

export {
  buildCursorAcpModelPickerCapabilities,
  buildCursorModelPickerCapabilities,
  buildCursorProbeSpec,
  parseCursorModels,
  sortCursorModels,
} from "./detection";
export { detectCursorTerminalStatus } from "./terminal";

const CURSOR_PLUGIN_VERSION = readBundledCursorPluginVersion();

warnIfPluginManifestMissing("cursor", CURSOR_PLUGIN_VERSION);

/**
 * Hook coverage gap: Cursor's `beforeShellExecution` / `beforeMCPExecution`
 * fire on every command, not only when the user is being prompted for
 * approval. Keep the existing terminal regex (`CURSOR_ATTENTION_RE` matching
 * `Run this command?` / `Suggested Plan` / `Waiting for approval`)
 * authoritative for `needs_approval` while hooks own the rest.
 */
function cursorHookActiveTerminalFallback(hint: TerminalStatusHint): boolean {
  return hint.status === "needs_approval";
}

/**
 * Cursor's ACP server advertises `loadSession: true` but immediately rejects
 * every sessionId it issues via `session/new` with `-32602 Session not found`.
 * Acknowledged Cursor bug (forum thread #155516) with no client workaround, so
 * we replace the raw transport error with copy that names the limitation.
 */
export function rewriteCursorLoadSessionError(error: unknown, _sessionId: string): Error {
  const message =
    "Cursor's ACP integration doesn't currently support resuming chat sessions. Start a new thread to continue.";
  return Object.assign(new Error(message), { cause: error });
}

export function createCursorAdapter(): AgentAdapter {
  let capabilities: AgentCapability = cursorDefaultCapabilities;

  return {
    kind: cursorDetectionSpec.kind,
    label: cursorDetectionSpec.label,
    binary: cursorDetectionSpec.binary,
    ...(cursorDetectionSpec.update ? { update: cursorDetectionSpec.update } : {}),
    get capabilities() {
      return capabilities;
    },
    spawnEnv: { wsl: { BROWSER: "/bin/true" } },
    pluginId: "lightcode-status@cursor",
    pluginVersion: CURSOR_PLUGIN_VERSION,
    minProtocolVersion: 1,

    async isPluginSupported(ctx) {
      return await isCursorVersionSupportedForHooks(ctx);
    },
    async isPluginInstalled(ctx) {
      return isCursorPluginInstalled(ctx);
    },
    async installPlugin(ctx) {
      const node = await resolveInstallNodePath(ctx);
      if (!node.ok) return node;
      const result = installCursorPlugin(ctx, { resolvedNodePath: node.nodePath });
      if (!result.ok) return result;
      return { ok: true, version: result.version };
    },
    async uninstallPlugin(ctx) {
      uninstallCursorPlugin(ctx);
    },

    detectInstall: async (ctx) => {
      const status = await detectAgentInstall(ctx, cursorDetectionSpec);
      capabilities = status.capabilities;
      return status;
    },
    // Cursor CLI has no documented per-launch MCP config or isolated config
    // home. Do not project launchOptions.mcpServers into the user's persistent
    // ~/.cursor/mcp.json; ACP sessions receive MCP servers through ACP itself.
    buildLaunchArgv(location, config, prompt) {
      const chatId = createCursorChatSync(location);
      const args = buildCursorArgs(config, prompt, chatId);
      return {
        binary: "cursor-agent",
        args,
        ...(chatId ? { sessionRef: createKnownSessionRef(chatId) } : {}),
      };
    },
    buildResumeArgv(_location, config, prompt, sessionRef) {
      const args = buildCursorArgs(config, prompt, sessionRef.providerSessionId);
      return { binary: "cursor-agent", args };
    },
    createInitialSessionRef() {
      return undefined;
    },
    async createStructuredSession(input: CreateStructuredSessionInput) {
      const command = buildAgentCommand(
        input.projectLocation,
        "cursor-agent",
        ["acp"],
        resolveAgentBinaryPath(input.projectLocation, "cursor-agent"),
      );
      return createAcpStructuredSession(command, {
        ...input,
        loadSessionErrorRewriter: rewriteCursorLoadSessionError,
        acpSessionUpdateTransform: transformCursorAcpSessionUpdate,
        acpExtensionNotificationHandler: handleCursorAcpExtensionNotification,
      });
    },
    async buildAcpAuthCommand(ctx?: AgentEnvContext) {
      const location = detectProbeLocation(ctx);
      return buildAgentCommand(
        location,
        "cursor-agent",
        ["acp"],
        resolveAgentBinaryPath(location, "cursor-agent"),
      );
    },
    buildAcpLogoutCommand: buildAgentLogoutCommand("cursor-agent", ["logout"]),
    buildDirectInput(prompt, _segments, _config, projectLocation) {
      // Cursor's TUI debounces fast incoming bytes as a paste burst. With
      // less than ~120ms between the text and Enter, the agent submits but
      // the input repaint never fires and the prompt visually stays in the
      // input box. 150ms is the empirically-tested floor that lets the TUI
      // settle before the Enter keystroke.
      //
      // On Windows, no inner-newline sequence keeps text in Cursor's
      // composer (raw LF, CR, and bracketed paste all trigger submit).
      // Flatten to single-line so the prompt lands as one submission.
      const payload = projectLocation?.kind === "windows" ? prompt.replace(/\n/g, " ") : prompt;
      return [payload, "@wait:150", "\r"];
    },
    formatPromptSegments(segments: PromptSegment[]) {
      const attachments = segments.filter((s) => s.kind === "attachment");
      const rest = segments.filter((s) => s.kind !== "attachment");
      const attachmentLines = attachments.map((s) => `@${s.path}`).join(" ");
      const restStr = rest.map((s) => (s.kind === "file" ? `@${s.path}` : s.content)).join("");
      return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
    },
    isReadyForInitialPrompt(text) {
      return CURSOR_IDLE_RE.test(text) && !CURSOR_WORKING_RE.test(text);
    },
    detectTerminalStatus(text) {
      return detectCursorTerminalStatus(text);
    },
    shouldApplyTerminalStatusWhileHookActive: cursorHookActiveTerminalFallback,
    defaultOneShotModel: "composer-2.5",
    buildOneShotCommand(model) {
      const args = ["--print", "--force", "--trust", "--output-format", "json"];
      if (model && model !== "auto") {
        args.push("--model", model);
      }
      return { command: "cursor-agent", args };
    },
    buildContextExtractionCommand(sessionRef, _location, model) {
      const args = [
        "--print",
        "--force",
        "--trust",
        `--resume=${sessionRef.providerSessionId}`,
        "--output-format",
        "json",
      ];
      if (model && model !== "auto") {
        args.push("--model", model);
      }
      return { command: "cursor-agent", args };
    },
  };
}
