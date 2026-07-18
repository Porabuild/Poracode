import type { PromptSegment } from "@/shared/contracts";
import { msg } from "@/shared/messages";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import { createAcpStructuredSession } from "../acp";
import {
  detectAgentInstall,
  detectProbeLocation,
  type AgentAdapter,
  type AgentEnvContext,
  type CreateStructuredSessionInput,
  quotePowerShellLiteral,
} from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { buildKimiAcpArgs, buildKimiArgs, buildKimiContinueArgs } from "./argv";
import {
  buildKimiCommand,
  kimiDefaultCapabilities,
  kimiDetectionSpec,
  nativeKimiOAuthCredentialPath,
} from "./detection";
import {
  makeKimiDiscoverSessionRef,
  makeKimiWatchSessionRef,
  snapshotKimiPreSpawnSessions,
} from "./sessionFiles";
import { detectKimiTerminalStatus } from "./terminal";

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

    buildUpdateCommand(_ctx, status) {
      return {
        binary: status.executablePath ?? kimiDetectionSpec.binary,
        args: ["upgrade"],
        strategy: "built-in",
      };
    },

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

    async createStructuredSession(input: CreateStructuredSessionInput) {
      const acpArgs = buildKimiAcpArgs(input.config);
      const command = buildKimiCommand(
        input.projectLocation,
        [...acpArgs, "acp"],
        resolveAgentBinaryPath(input.projectLocation, "kimi"),
      );
      return createAcpStructuredSession(command, {
        ...input,
        acpEmptyResponseErrorResolver: resolveKimiEmptyResponseError,
      });
    },

    // Kimi ACP advertises a single "login" auth method; the auth command is the
    // same `kimi acp` stdio process.
    async buildAcpAuthCommand(ctx?: AgentEnvContext) {
      const location = detectProbeLocation(ctx);
      return buildKimiCommand(location, ["acp"], resolveAgentBinaryPath(location, "kimi"));
    },

    // Kimi has no `kimi logout` subcommand and ACP logout is unimplemented.
    // Its own `/logout` handler removes this managed OAuth token through
    // FileTokenStorage, so do the same here without launching an interactive
    // TUI provider picker.
    async buildAcpLogoutCommand(ctx?: AgentEnvContext) {
      const location = detectProbeLocation(ctx);
      if (location.kind === "windows") {
        return {
          command: "powershell.exe",
          args: [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `Remove-Item -LiteralPath ${quotePowerShellLiteral(nativeKimiOAuthCredentialPath())} -Force -ErrorAction SilentlyContinue`,
          ],
          cwd: location.path,
        };
      }
      return buildKimiCommand(
        location,
        ["-c", 'rm -f -- "${KIMI_CODE_HOME:-$HOME/.kimi-code}/credentials/kimi-code.json"'],
        "sh",
      );
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
