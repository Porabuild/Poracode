import { inlinePromptSegmentText } from "@/shared/promptContent";
import { detectAgentInstall, type AgentAdapter, type AgentEnvContext } from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import {
  createDevinAdapterContexts,
  devinDefaultAccountContext,
  prepareDevinAuthFlow,
} from "./adapterContext";
import { createDevinTerminalLaunch } from "./terminalLaunch";
import { createDevinStructuredSessionLauncher } from "./structuredLaunch";
import { runDevinOneShot } from "./oneShot";
import {
  buildDevinCommand,
  createDevinDetectionSpec,
  devinDefaultCapabilities,
  devinDetectionSpec,
} from "./detection";
import { buildDevinLogoutCommand } from "./profileAuth";
import { devinProfileSkillConfigBase, type DevinExecutionSettings } from "./profileContext";
import { createDevinSessionDiscovery, detectDevinInvalidSessionRef } from "./sessionFiles";
import { detectDevinTerminalStatus } from "./terminal";
import { withDevinScopeIdentity } from "./sessionScope";
import { withDevinPresentationCapabilities } from "./presentationCapabilities";
import { devinCloudSelectionCapabilities } from "./selectionCapabilities";

export { DevinProfileUnavailableError } from "./sessionBinding";

/**
 * Devin adapter composition root. Each lane lives in its own provider-owned
 * leaf — `adapterContext` (execution contexts, identity, fingerprint,
 * discovery cache), `terminalLaunch` (PTY lanes), `structuredLaunch` (ACP
 * session composition), `selectionCapabilities` (negotiated GUI selection),
 * `orgSelection` (effective org binding), `models`/`modelCatalog`
 * (catalogs + negotiation) — this file stays the readable composition.
 */

export interface DevinAdapterOptions {
  kind?: string;
  label?: string;
  /**
   * Profile execution settings derived from the parsed `DevinProfileConfig`.
   * `undefined` declares the built-in native default account.
   */
  profile?: DevinExecutionSettings | undefined;
}

export function createDevinAdapter(options: DevinAdapterOptions = {}): AgentAdapter {
  const profile = options.profile;
  const kind = options.kind ?? devinDetectionSpec.kind;
  const label = options.label ?? devinDetectionSpec.label;
  const isProfile = profile !== undefined;
  const detectionSpec = isProfile
    ? { ...createDevinDetectionSpec(profile), kind, label }
    : devinDetectionSpec;
  const discovery = createDevinSessionDiscovery();
  const contexts = createDevinAdapterContexts(profile);
  const terminal = createDevinTerminalLaunch(contexts, discovery, kind);
  const createStructuredSession = createDevinStructuredSessionLauncher(
    contexts,
    devinDefaultAccountContext,
  );
  // Profile resources live under the profile's own config root, which the
  // spawn env redirects — the shared skills scanner only sees supervisor env,
  // so the profile's roots carry the resolved base explicitly (plan G18).
  const skillConfigBase = profile ? devinProfileSkillConfigBase(profile) : undefined;
  let capabilities = withDevinPresentationCapabilities({
    ...devinDefaultCapabilities,
    ...(profile?.runtimeTarget === "cloud"
      ? devinCloudSelectionCapabilities(devinDefaultCapabilities)
      : {}),
  });

  return {
    kind,
    label,
    binary: "devin",
    ...(detectionSpec.update && !isProfile ? { update: detectionSpec.update } : {}),
    get capabilities() {
      return capabilities;
    },
    skillSupport: {
      roots: [
        {
          id: "devin",
          label,
          globalPath: ".config/devin/skills",
          globalOverride: { env: "XDG_CONFIG_HOME", path: "devin/skills" },
          ...(skillConfigBase !== undefined ? { globalBasePath: skillConfigBase } : {}),
          projectPath: ".devin/skills",
        },
        {
          // Devin 3000.11.3 loads global ~/.config/cognition/skills and
          // project .cognition/skills; both must appear in the picker or the
          // picker and the session disagree (plan G18).
          id: "cognition",
          label: "Cognition",
          globalPath: ".config/cognition/skills",
          globalOverride: { env: "XDG_CONFIG_HOME", path: "cognition/skills" },
          ...(skillConfigBase !== undefined ? { globalBasePath: skillConfigBase } : {}),
          projectPath: ".cognition/skills",
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
        global: ["devin", "cognition", "agents"],
        project: ["devin", "cognition", "agents"],
      },
    },
    spawnEnv: { wsl: { BROWSER: "/bin/true" } },
    async detectInstall(ctx) {
      const status = await detectAgentInstall(ctx, detectionSpec);
      capabilities = withDevinPresentationCapabilities(status.capabilities);
      return { ...status, capabilities };
    },
    buildLaunchArgv: terminal.buildLaunchArgv,
    buildResumeArgv: terminal.buildResumeArgv,
    rewriteLaunchArgsForConfig: terminal.rewriteLaunchArgsForConfig,
    buildOneShotCommand: terminal.buildOneShotCommand,
    createStructuredSession,
    supportsStructuredWorkspaceDirectories: profile?.runtimeTarget !== "cloud",
    initialSessionRefDiscoveryDelayMs: 1000,
    discoverSessionRef: async (location) => {
      // Profile discovery resolves the SAME scoped snapshot the launch
      // reserved against — an unscoped discover would read the default
      // account's db and attribute another account's session to this thread.
      const context = await contexts.contextForDiscovery(location).catch(() => undefined);
      if (isProfile && !context) return undefined;
      if (context?.runtimeTarget === "cloud") return undefined;
      // An account root that stopped being a valid Poracode root (corrupt,
      // future-format, or replaced manifest) must not have refs attributed to
      // it: the success cache above would otherwise bypass the ownership
      // guard on every subsequent event.
      if (context && !(await contexts.accountRootStillValid(context, location))) return undefined;
      // Profiles stamp only a PROVEN identity; a failed proof skips
      // attribution this tick (retryable) instead of stamping a binding the
      // resume check would later refuse.
      const identity = await contexts.provenIdentityOrFail(context).catch(() => undefined);
      if (context && identity === undefined) return undefined;
      const ref = await discovery.discover(location, contexts.discoveryScope(context));
      if (!ref) return undefined;
      return identity ? withDevinScopeIdentity(ref, identity) : ref;
    },
    watchSessionRef: (location, onChanged) => {
      // The adapter interface is synchronous; resolve the discovery scope
      // async and only attach when the context resolution and the account
      // root guard both succeeded.
      let stop: (() => void) | undefined;
      let cancelled = false;
      void (async () => {
        const context = await contexts.contextForDiscovery(location).catch(() => undefined);
        if (cancelled || (isProfile && !context)) return;
        if (context?.runtimeTarget === "cloud") return;
        if (context && !(await contexts.accountRootStillValid(context, location))) return;
        if (!cancelled)
          stop = discovery.watch(location, onChanged, contexts.discoveryScope(context));
      })();
      return () => {
        cancelled = true;
        stop?.();
      };
    },
    createInitialSessionRef() {
      return undefined;
    },
    // Live-captured on 3000.11.3: `No session found matching '<slug>'` when a
    // stored id is gone (deleted, or belonging to another account root after
    // the profile's owner was reassigned). The recovery coordinator then
    // replaces the ref instead of resending the dead id forever.
    detectInvalidSessionRef: detectDevinInvalidSessionRef,
    async buildAcpAuthCommand(ctx?: AgentEnvContext) {
      const { location, context } = await prepareDevinAuthFlow(contexts, ctx);
      return buildDevinCommand(
        location,
        [...(context?.prefixArgs ?? []), "acp"],
        resolveAgentBinaryPath(location, "devin"),
        context?.env,
      );
    },
    async buildAcpLogoutCommand(ctx?: AgentEnvContext) {
      const { location, context } = await prepareDevinAuthFlow(contexts, ctx);
      return buildDevinLogoutCommand(location, context, resolveAgentBinaryPath(location, "devin"));
    },
    preferAcpLogoutRpc: false,
    buildDirectInput(prompt) {
      return ["\x1b[200~", prompt, "\x1b[201~", "@wait:500", "\r"];
    },
    buildTerminalPreInputs(config) {
      return config.mode === "plan" ? [["/plan", "@wait:200", "\r"]] : undefined;
    },
    shouldDeferPromptToTerminal(config) {
      return config.mode === "plan";
    },
    isReadyForInitialPrompt(text) {
      return detectDevinTerminalStatus(text)?.status === "idle";
    },
    formatPromptSegments(segments) {
      return segments
        .map((segment) =>
          segment.kind === "attachment" ? `@${segment.path} ` : inlinePromptSegmentText(segment),
        )
        .join("");
    },
    detectTerminalStatus: detectDevinTerminalStatus,
    defaultOneShotModel: "swe-1-6-fast",
    runOneShot: (input) =>
      runDevinOneShot(input, profile, { agentKind: kind, presentationMode: "terminal" }),
  };
}
