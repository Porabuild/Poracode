import type { AgentCapability, PromptSegment, ProjectLocation } from "@/shared/contracts";
import {
  createKnownSessionRef,
  detectAgentInstall,
  watchSessionPaths,
  type AgentAdapter,
} from "../base";
import { buildAntigravityArgs } from "./argv";
import {
  ANTIGRAVITY_MANAGED_MODEL_ID,
  antigravityDetectionSpec,
  defaultAntigravityCapabilities,
} from "./detection";
import {
  describeAntigravityLocation,
  detectAntigravityInvalidSessionRef,
  locationCwd,
  readAntigravityConversationIds,
  readAntigravityLastConversationForCwd,
  readNewestAntigravityConversationId,
  resolveAntigravityWatchPaths,
} from "./session";
import { detectAntigravityTerminalStatus } from "./terminal";

export { detectAntigravityInvalidSessionRef } from "./session";

export function createAntigravityAdapter(): AgentAdapter {
  let capabilities: AgentCapability = defaultAntigravityCapabilities;
  let preSpawnConversationIds = new Set<string>();
  let preSpawnLastConversationForCwd: string | undefined;

  return {
    kind: "antigravity",
    label: "Antigravity",
    binary: "agy",
    get capabilities() {
      return capabilities;
    },
    // BROWSER=/bin/true keeps the WSL OAuth flow from trying to `xdg-open`
    // a browser inside the distro and hanging the PTY.
    spawnEnv: {
      wsl: { BROWSER: "/bin/true" },
    },

    async detectInstall(ctx) {
      const status = await detectAgentInstall(ctx, antigravityDetectionSpec);
      capabilities = status.capabilities;
      return status;
    },

    buildLaunchArgv(location, config, prompt) {
      // `agy` has no flag to pre-assign a conversation id; the id is only
      // visible after the session writes its first `.pb` file. Snapshot the
      // existing ids + the workspace's cached "last" id so `discoverSessionRef`
      // can identify the brand-new one once it appears.
      preSpawnConversationIds = readAntigravityConversationIds(location);
      preSpawnLastConversationForCwd = readAntigravityLastConversationForCwd(
        location,
        locationCwd(location),
      );
      const args = buildAntigravityArgs(config, prompt);
      return { binary: "agy", args };
    },

    buildResumeArgv(_location, config, prompt, sessionRef) {
      const args = buildAntigravityArgs(config, prompt, sessionRef.providerSessionId);
      return { binary: "agy", args };
    },

    createInitialSessionRef() {
      return undefined;
    },
    initialSessionRefDiscoveryDelayMs: 1000,

    async discoverSessionRef(location: ProjectLocation) {
      const cwd = locationCwd(location);
      const latest = readAntigravityLastConversationForCwd(location, cwd);
      if (
        latest &&
        latest !== preSpawnLastConversationForCwd &&
        !preSpawnConversationIds.has(latest)
      ) {
        return createKnownSessionRef(latest);
      }
      const newest = readNewestAntigravityConversationId(location, preSpawnConversationIds);
      return newest ? createKnownSessionRef(newest) : undefined;
    },

    watchSessionRef(location, onChanged) {
      const paths = resolveAntigravityWatchPaths(location);
      if (paths.length === 0) return undefined;
      return watchSessionPaths(
        location,
        paths,
        onChanged,
        `antigravity:${describeAntigravityLocation(location)}`,
      );
    },

    buildDirectInput(prompt) {
      // The TUI treats bulk writes as paste, so an embedded `\r` becomes a
      // literal newline in the input field instead of submitting. Pause ~40ms
      // between the text and the Enter key so they arrive as separate events.
      return [prompt, "@wait:40", "\r"];
    },

    formatPromptSegments(segments: PromptSegment[]) {
      const attachments = segments.filter((s) => s.kind === "attachment");
      const rest = segments.filter((s) => s.kind !== "attachment");
      const attachmentLines = attachments.map((s) => `@${s.path}`).join(" ");
      const restStr = rest.map((s) => (s.kind === "file" ? `@${s.path}` : s.content)).join("");
      return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
    },
    detectTerminalStatus: detectAntigravityTerminalStatus,
    detectInvalidSessionRef: detectAntigravityInvalidSessionRef,

    defaultOneShotModel: ANTIGRAVITY_MANAGED_MODEL_ID,

    buildOneShotCommand(_model, _effort, prompt) {
      if (!prompt) return undefined;
      return { command: "agy", args: ["-p", prompt], stdin: "" };
    },
  };
}
