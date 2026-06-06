import type { AgentCapability, PromptSegment } from "@/shared/contracts";
import { createKnownSessionRef, detectAgentInstall, type AgentAdapter } from "../base";
import { buildCommandCodeArgs } from "./argv";
import {
  COMMANDCODE_DEFAULT_MODEL_ID,
  commandCodeDetectionSpec,
  defaultCommandCodeCapabilities,
} from "./detection";
import { detectCommandCodeInvalidSessionRef } from "./session";
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

    buildLaunchArgv(_location, config, prompt) {
      // `command-code` has no flag to pre-assign or report a session id, so we
      // mint a synthetic ref to mark the thread resumable immediately. Resume
      // then uses `--continue` (the last conversation in this cwd) — robust for
      // the worktree-isolated common case; see buildResumeArgv.
      const args = buildCommandCodeArgs(config, prompt);
      return { binary: "command-code", args, sessionRef: createKnownSessionRef() };
    },

    buildResumeArgv(_location, config, prompt) {
      const args = buildCommandCodeArgs(config, prompt, true);
      return { binary: "command-code", args };
    },

    createInitialSessionRef() {
      return undefined;
    },

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
