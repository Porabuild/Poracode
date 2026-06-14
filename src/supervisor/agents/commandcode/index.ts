import type { AgentCapability, PromptSegment } from "@/shared/contracts";
import { detectAgentInstall, type AgentAdapter } from "../base";
import { buildCommandCodeArgs } from "./argv";
import {
  COMMANDCODE_DEFAULT_MODEL_ID,
  commandCodeDetectionSpec,
  defaultCommandCodeCapabilities,
} from "./detection";
import { detectCommandCodeInvalidSessionRef } from "./session";
import {
  isUuid,
  makeCommandCodeDiscoverSessionRef,
  makeCommandCodeWatchSessionRef,
  snapshotCommandCodePreSpawnSessions,
} from "./sessionFiles";
import { detectCommandCodeTerminalStatus } from "./terminal";

export { detectCommandCodeInvalidSessionRef } from "./session";

// A cheap model for one-shot utility runs (title/commit generation) when the
// caller doesn't pin one. Kept in sync with the renderer's registered
// utility-task defaults.
const COMMANDCODE_ONESHOT_MODEL_ID = "gpt-5.4-mini";

export function createCommandCodeAdapter(): AgentAdapter {
  let capabilities: AgentCapability = defaultCommandCodeCapabilities;

  return {
    kind: "commandcode",
    label: "Command Code",
    binary: "command-code",
    // Surface the update spec on the adapter (not just on the detection status)
    // so the shared updater and the npm "latest version" probe behind the
    // Settings registry card can read `adapter.update`. Mirrors every other
    // native adapter; without it the not-installed card shows no version.
    ...(commandCodeDetectionSpec.update ? { update: commandCodeDetectionSpec.update } : {}),
    get capabilities() {
      return capabilities;
    },
    // `command-code login` opens a browser for OAuth; BROWSER=/bin/true keeps
    // the WSL flow from trying to `xdg-open` inside the distro and hanging the
    // PTY (the user completes auth via the printed URL instead).
    spawnEnv: {
      wsl: { BROWSER: "/bin/true" },
    },

    async detectInstall(ctx) {
      const status = await detectAgentInstall(ctx, commandCodeDetectionSpec);
      capabilities = status.capabilities;
      return status;
    },

    buildLaunchArgv(location, config, prompt) {
      // `command-code` has no flag to pre-assign or report a session id, so we
      // snapshot the existing transcripts here and let the runtime discover the
      // real id afterward (discoverSessionRef below). Returning no sessionRef
      // is what enables that discovery path; resume then targets the exact id.
      const cwd = location.kind === "wsl" ? location.linuxPath : location.path;
      snapshotCommandCodePreSpawnSessions(location, cwd);
      const args = buildCommandCodeArgs(config, prompt);
      return { binary: "command-code", args };
    },

    buildResumeArgv(_location, config, prompt, sessionRef) {
      // Resume the exact discovered session id (`--resume <id>`). A dead/stale
      // id surfaces command-code's "found to resume" error, which the runtime
      // recovers by relaunching fresh (see detectCommandCodeInvalidSessionRef)
      // — same contract as grok/codex. A non-UUID ref (legacy/degenerate) falls
      // back to `--continue`.
      const id = sessionRef?.providerSessionId;
      const args = buildCommandCodeArgs(config, prompt, id && isUuid(id) ? id : "");
      return { binary: "command-code", args };
    },

    createInitialSessionRef() {
      return undefined;
    },

    // `command-code` writes the transcript only on the first message, so poll a
    // beat after launch and rely on watchSessionRef to catch the file's
    // creation. Mirrors codex's discovery cadence.
    initialSessionRefDiscoveryDelayMs: 1000,
    discoverSessionRef: makeCommandCodeDiscoverSessionRef(),
    watchSessionRef: makeCommandCodeWatchSessionRef(),

    buildDirectInput(prompt) {
      // The TUI treats bulk writes as a paste, so an embedded `\r` becomes a
      // literal newline instead of submitting. Pause ~40ms between the text and
      // the Enter key so they arrive as separate events.
      return [prompt, "@wait:40", "\r"];
    },

    formatPromptSegments(segments: PromptSegment[]) {
      const attachments = segments.filter((s) => s.kind === "attachment");
      const rest = segments.filter((s) => s.kind !== "attachment");
      const attachmentLines = attachments.map((s) => `@${s.path}`).join(" ");
      const restStr = rest.map((s) => (s.kind === "file" ? `@${s.path}` : s.content)).join("");
      return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
    },

    detectTerminalStatus: detectCommandCodeTerminalStatus,
    detectInvalidSessionRef: detectCommandCodeInvalidSessionRef,

    defaultOneShotModel: COMMANDCODE_ONESHOT_MODEL_ID,

    buildOneShotCommand(model, _effort, prompt) {
      if (!prompt) return undefined;
      return {
        command: "command-code",
        args: [
          "--trust",
          "--skip-onboarding",
          "--model",
          model || COMMANDCODE_DEFAULT_MODEL_ID,
          "-p",
          prompt,
        ],
        stdin: "",
      };
    },
  };
}
