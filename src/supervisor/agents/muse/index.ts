import type { AgentCapability } from "@/shared/contracts";
import { detectAgentInstall, type AgentAdapter, inheritBaseSpawnEnv } from "../base";
import { buildMuseArgs, buildMuseResumeArgs } from "./argv";
import { MUSE_DEFAULT_MODEL_ID, museDefaultCapabilities, museDetectionSpec } from "./detection";
import { formatMusePromptSegments } from "./prompt";
import {
  makeMuseDiscoverSessionRef,
  makeMuseWatchSessionRef,
  snapshotMusePreSpawnSessions,
} from "./sessionFiles";
import { detectMuseTerminalStatus, isMuseReadyForInitialPrompt } from "./terminal";

// Muse Code provider — Meta's terminal coding agent CLI.
// Docs: https://dev.meta.ai/docs/muse-code
// Install: curl -fsSL https://dev.meta.ai/install.sh | sh
//
// Terminal-only: interactive TUI via PTY. Muse has no ACP mode; a GUI
// structured session is deliberately deferred until Muse ships real ACP
// support (then wire it through the shared ACP client like Grok/Kimi/Qwen).

export function createMuseAdapter(): AgentAdapter {
  let capabilities: AgentCapability = museDefaultCapabilities;

  return {
    kind: museDetectionSpec.kind,
    label: museDetectionSpec.label,
    binary: museDetectionSpec.binary,
    // Surface the update spec on the adapter so the shared updater and the
    // Settings registry card can read `adapter.update` (not just status).
    ...(museDetectionSpec.update ? { update: museDetectionSpec.update } : {}),
    get capabilities() {
      return capabilities;
    },
    // `muse login` opens a browser for Meta OAuth; BROWSER=/bin/true keeps the
    // WSL flow from trying to `xdg-open` inside the distro and hanging the PTY.
    spawnEnv: { wsl: { BROWSER: "/bin/true" } },
    ...inheritBaseSpawnEnv(museDetectionSpec),

    async detectInstall(ctx) {
      const status = await detectAgentInstall(ctx, museDetectionSpec);
      capabilities = status.capabilities;
      return status;
    },

    buildLaunchArgv(location, config, prompt) {
      // Muse mints its own session UUID; snapshot existing sessions so
      // discoverSessionRef can identify the new one. Returning no sessionRef
      // enables that discovery path.
      snapshotMusePreSpawnSessions(location);
      const args = buildMuseArgs(config, prompt);
      return { binary: "muse", args };
    },

    buildResumeArgv(_location, config, _prompt, sessionRef) {
      const id = sessionRef.providerSessionId;
      // Degenerate/legacy ref: resume the most recent session in this workspace.
      const args = id
        ? buildMuseResumeArgs(id, config)
        : ["resume", "--last", ...buildMuseArgs(config)];
      return { binary: "muse", args };
    },

    createInitialSessionRef() {
      // CLI mints its own id in interactive mode — no pre-assign flag.
      return undefined;
    },

    // Muse writes the date-sharded session dir shortly after launch; poll a
    // beat afterward and rely on watchSessionRef to catch creation.
    initialSessionRefDiscoveryDelayMs: 1000,
    discoverSessionRef: makeMuseDiscoverSessionRef(),
    watchSessionRef: makeMuseWatchSessionRef(),

    buildDirectInput(prompt) {
      // The TUI treats bulk writes as paste, so an embedded `\r` becomes a
      // literal newline. Pause briefly between text and Enter (kimi-style).
      return [prompt, "@wait:200", "\r"];
    },

    // `muse resume <uuid>` accepts no positional prompt. Always hand the first
    // message to the ready TUI so fresh launches and resumed sessions follow
    // one lossless path.
    shouldDeferPromptToTerminal() {
      return true;
    },

    isReadyForInitialPrompt: isMuseReadyForInitialPrompt,

    formatPromptSegments: formatMusePromptSegments,

    detectTerminalStatus: detectMuseTerminalStatus,

    // `muse exec` requires the prompt as an argv argument (stdin and
    // /dev/stdin prompt files are unsupported), which matches the shared
    // one-shot fallback path used by other terminal CLIs.
    defaultOneShotModel: MUSE_DEFAULT_MODEL_ID,
    buildOneShotCommand(model, effort, prompt) {
      if (!prompt) return undefined;
      return {
        command: "muse",
        args: [
          "exec",
          "--no-session-log",
          "--trust-workspace",
          "--disable-write",
          "--disable-shell",
          "--user-input-auto-resolve",
          "--model",
          model || MUSE_DEFAULT_MODEL_ID,
          ...(effort ? ["--reasoning-effort", effort] : []),
          prompt,
        ],
        stdin: "",
      };
    },
  };
}
