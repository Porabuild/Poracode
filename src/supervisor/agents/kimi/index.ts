import type { PromptSegment } from "@/shared/contracts";
import { msg } from "@/shared/messages";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import { createAcpStructuredSession } from "../acp";
import { createAcpSubagentCoordinator } from "../acp/subagentCoordinator";
import {
  detectAgentInstall,
  detectProbeLocation,
  type AgentAdapter,
  type AgentEnvContext,
  type CreateStructuredSessionInput,
} from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { createKimiAcpSessionUpdateTransform } from "./acpTransform";
import { buildKimiAcpArgs, buildKimiArgs, buildKimiContinueArgs } from "./argv";
import { createKimiBackgroundBridge } from "./backgroundBridge";
import { buildKimiCommand, kimiDefaultCapabilities, kimiDetectionSpec } from "./detection";
import { buildKimiLogoutCommand } from "./kimiLogout";
import { ensureKimiWorkspaceTrust } from "./kimiTrust";
import {
  makeKimiDiscoverSessionRef,
  makeKimiWatchSessionRef,
  snapshotKimiPreSpawnSessions,
} from "./sessionFiles";
import {
  detectKimiTerminalStatus,
  KIMI_CACHE_HINT_PATTERN,
  KIMI_TRUST_PROMPT_PATTERN,
} from "./terminal";

// Kimi Code provider implementation (Moonshot AI).
// Docs: https://www.kimi.com/code/docs/en/
// npm:  @moonshot-ai/kimi-code

export function resolveKimiEmptyResponseError(input: {
  stopReason: string;
  stderr: readonly string[];
}): Error {
  const stderr = input.stderr.join("\n").toLowerCase();
  const credentialRenameBlocked =
    stderr.includes("kimi-code.json") &&
    stderr.includes("rename") &&
    (stderr.includes("eperm") ||
      stderr.includes("ebusy") ||
      stderr.includes("operation not permitted") ||
      stderr.includes("access is denied"));
  return new Error(msg(credentialRenameBlocked ? "kimi.credentialsLocked" : "kimi.emptyResponse"));
}

export function createKimiAdapter(): AgentAdapter {
  let capabilities = kimiDefaultCapabilities;

  return {
    kind: kimiDetectionSpec.kind,
    label: kimiDetectionSpec.label,
    binary: kimiDetectionSpec.binary,
    skillSupport: {
      roots: [
        {
          id: "kimi",
          label: kimiDetectionSpec.label,
          globalPath: ".kimi-code/skills",
          projectPath: ".kimi-code/skills",
          globalOverride: { env: "KIMI_CODE_HOME", path: "skills" },
        },
        {
          id: "agents",
          label: "Shared agent skills",
          globalPath: ".agents/skills",
          projectPath: ".agents/skills",
        },
      ],
      invocation: "slash",
      precedence: {
        global: ["kimi", "agents"],
        project: ["kimi", "agents"],
      },
    },
    // Surface the update spec on the adapter so the shared updater and the npm
    // "latest version" probe behind the Settings registry card can read
    // `adapter.update` (the not-installed card shows no version otherwise).
    ...(kimiDetectionSpec.update ? { update: kimiDetectionSpec.update } : {}),
    get capabilities() {
      return capabilities;
    },
    // `kimi login` opens a browser for the OAuth device flow; BROWSER=/bin/true
    // keeps the WSL flow from trying to `xdg-open` inside the distro and hanging
    // the PTY (the user completes auth via the printed URL instead).
    spawnEnv: { wsl: { BROWSER: "/bin/true" } },

    async detectInstall(ctx) {
      const status = await detectAgentInstall(ctx, kimiDetectionSpec);
      capabilities = status.capabilities;
      return status;
    },

    // No `buildUpdateCommand` override: `kimi upgrade` is an interactive TUI, so
    // the shared resolver drives the update from the detection spec's
    // `installer` (re-runs the official install script non-interactively). This
    // also keeps the supervisor and the renderer's command preview in sync.

    buildLaunchArgv(location, config, prompt) {
      // Kimi mints its own opaque session id and exposes no flag to pre-assign
      // one, so snapshot the existing session dirs here and let the runtime
      // discover the real id afterward (discoverSessionRef below). Returning no
      // sessionRef is what enables that discovery path.
      snapshotKimiPreSpawnSessions(location);
      const args = buildKimiArgs(config, prompt);
      return { binary: "kimi", args };
    },

    buildResumeArgv(_location, config, prompt, sessionRef) {
      // Resume the exact discovered session id (`--session <id>`). Without one
      // (legacy/degenerate ref) fall back to `--continue`, which resumes the
      // most recent session in the cwd.
      const id = sessionRef?.providerSessionId;
      const args = id ? buildKimiArgs(config, prompt, id) : buildKimiContinueArgs(config);
      return { binary: "kimi", args };
    },

    // The only async hook that runs ahead of every PTY spawn — used to
    // pre-write Kimi 0.33's workspace-trust marker so the TUI's interactive
    // "Trust this folder?" dialog never blocks a launch (the args pass
    // through untouched).
    async rewriteLaunchArgsForConfig(args, _config, projectLocation) {
      await ensureKimiWorkspaceTrust(projectLocation);
      return args;
    },

    async createStructuredSession(input: CreateStructuredSessionInput) {
      await ensureKimiWorkspaceTrust(input.projectLocation);
      const acpArgs = buildKimiAcpArgs(input.config);
      const command = buildKimiCommand(
        input.projectLocation,
        [...acpArgs, "acp"],
        resolveAgentBinaryPath(input.projectLocation, "kimi"),
      );
      let session: ReturnType<typeof createAcpStructuredSession>;
      const subagents = createAcpSubagentCoordinator();
      const backgroundBridge = createKimiBackgroundBridge(
        input.projectLocation,
        (notification) => session?.ingestExternalSessionUpdate(notification),
        { subagents },
      );
      session = createAcpStructuredSession(command, {
        ...input,
        // Kimi's ACP server rejects the protocol's standard stdio MCP shape
        // during session/new ("ACP stdio MCP server <name> does not declare a
        // runtime identity", surfaced only as -32603 Internal error), and the
        // ACP schema gives it no mcpCapabilities flag to declare that gap.
        // Relay stdio servers optimistically instead of pre-dropping them:
        // the shared session retries once without them on that exact failure
        // (MoonshotAI/kimi-code#3069, fix pending in #3070) and, once a Kimi
        // release ships support, relays them with no change here.
        acpOptimisticMcpTransports: ["stdio"],
        // Kimi's ACP host filesystem routes *every* text read/write through
        // the client once fs capability is advertised — including its own
        // per-session state under ~/.kimi-code — and rethrows the client's
        // JSON-RPC error verbatim. Its "file does not exist" check only
        // recognizes an errno-shaped `ENOENT` reached through `Error.cause`,
        // so no JSON-RPC code (not even `-32002` resource-not-found) reads as
        // missing. Plan mode reads the plan file before creating it, so the
        // read of that not-yet-existing file killed every plan-mode turn:
        // `EnterPlanMode` returned `Tool "EnterPlanMode" failed: Internal
        // error`, and threads started in Plan mode ended with no response at
        // all. Keeping the capability unadvertised makes Kimi read and write
        // through its own local filesystem, where the errno survives.
        acpFsTextCapability: false,
        acpEmptyResponseErrorResolver: resolveKimiEmptyResponseError,
        acpSessionUpdateTransform: createKimiAcpSessionUpdateTransform({
          subagents,
          onBackgroundLaunch: backgroundBridge.onBackgroundLaunch,
        }),
      });
      if (!session) {
        backgroundBridge.dispose();
        return undefined;
      }
      const disposeAcpSession = session.dispose.bind(session);
      session.dispose = async () => {
        backgroundBridge.dispose();
        await disposeAcpSession();
      };
      return session;
    },

    // The `kimi acp` stdio process that dispatch uses for the ACP
    // `authenticate`/`logout` handshake. On 0.33.0's v2 server `authenticate`
    // only re-validates auth state (interactive sign-in is the terminal
    // `kimi acp --login` flow), while `logout` drives the real RPC logout.
    async buildAcpAuthCommand(ctx?: AgentEnvContext) {
      const location = detectProbeLocation(ctx);
      return buildKimiCommand(location, ["acp"], resolveAgentBinaryPath(location, "kimi"));
    },

    // Logout is ACP-RPC-first (v2 advertises `agentCapabilities.auth.logout`)
    // with the managed-OAuth credential file as the legacy fallback. dispatch
    // runs the RPC; this builder only describes the file cleanup, so asking
    // the adapter for its logout spec never signs anyone out.
    preferAcpLogoutRpc: true,
    async buildAcpLogoutCommand(ctx?: AgentEnvContext) {
      return buildKimiLogoutCommand(ctx);
    },

    createInitialSessionRef() {
      return undefined;
    },

    // Kimi writes the session dir shortly after launch; poll a beat afterward
    // and rely on watchSessionRef to catch the dir's creation.
    initialSessionRefDiscoveryDelayMs: 1000,
    discoverSessionRef: makeKimiDiscoverSessionRef(),
    watchSessionRef: makeKimiWatchSessionRef(),

    buildDirectInput(prompt) {
      // Kimi's paste-burst guard suppresses Enter for 120ms after rapidly
      // injected text. Stay beyond that window so Poracode submits the prompt
      // instead of inserting a newline into the composer.
      return [prompt, "@wait:200", "\r"];
    },

    isReadyForInitialPrompt(text) {
      // Modal dialogs are not a composer — typing the prompt into one would
      // just corrupt the choice. The trust dialog shows if the pre-written
      // marker ever misses; 0.34's cache-expiry dialog shows after a
      // long-idle session is resumed (a queued resume prompt would otherwise
      // be swallowed by the dialog and its Enter would pick "Compact and
      // continue"). Once the user answers, the composer text returns and the
      // gate re-passes on the next terminal update.
      if (KIMI_TRUST_PROMPT_PATTERN.test(text)) return false;
      if (KIMI_CACHE_HINT_PATTERN.test(text)) return false;
      const t = text.toLowerCase();
      if (t.includes("kimi")) return true;
      if (/\?\s+for shortcuts|\/\s+for commands/i.test(text)) return true;
      return false;
    },

    formatPromptSegments(segments: PromptSegment[]) {
      const attachments = segments.filter((s) => s.kind === "attachment");
      const rest = segments.filter((s) => s.kind !== "attachment");
      const attachmentLines = attachments.map((s) => `@${s.path}`).join(" ");
      const restStr = rest.map(inlinePromptSegmentText).join("");
      return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
    },

    detectTerminalStatus: detectKimiTerminalStatus,

    // Kimi's TUI has no flag for an initial interactive prompt (the only
    // headless path is `kimi -p`). Defer the prompt to the PTY: the runtime
    // queues it and types it via buildDirectInput once the TUI is ready.
    shouldDeferPromptToTerminal() {
      return true;
    },

    // One-shot (title / commit) generation reuses Kimi's documented headless
    // path: `kimi -p <prompt> --output-format text`. The `-p` path is
    // non-interactive (no approval flags are combined with it).
    defaultOneShotModel: "kimi-code/kimi-for-coding",
    buildOneShotCommand(model, _effort, prompt) {
      if (!prompt) return undefined;
      const args = ["-p", prompt];
      if (model) args.push("-m", model);
      args.push("--output-format", "text");
      return { command: "kimi", args, stdin: "" };
    },
  };
}
