import type { AgentCapability, ProjectLocation } from "@/shared/contracts";
import { dedupeAcpAuthMethods, probeAcpCapabilities, type AcpProbeResult } from "../acp";
import {
  batchWslCommandsAsync,
  buildAgentCommand,
  envVarAuthProbe,
  quotePosixShellArg,
  quotePowerShellLiteral,
  type CapabilitiesProbeResult,
  type DetectionSpec,
} from "../base";
import { getAgentProbeCwd, resolveProbeSpawnCwd } from "../probeCwd";
import { devinModelCatalogKey, loadDevinModels, loadDevinModelsForKey } from "./modelCatalog";
import { devinTerminalFamilySelections } from "./modelFamilySelections";
import { devinModelCapabilities, type DevinModelFamily } from "./models";
import {
  devinCloudSelectionCapabilities,
  devinNegotiatedGuiSelectionCapabilities,
} from "./selectionCapabilities";
import { parseDevinCredentials, readDevinCredentials } from "./credentials";
import { resolveDevinExecutionContext, type DevinExecutionSettings } from "./profileContext";
import { DEVIN_ACP_CLIENT_CAPABILITY_MANIFEST } from "./acp/capabilityManifest";
import { prepareDevinProfileLaunch } from "./launchContext";
import { resolveDevinVolatileCatalogScope } from "./volatileCatalog";
import { resolveDevinAuthStateForContext } from "./profileAuth";

type DevinProbeAuthMethod = NonNullable<AcpProbeResult["authMethods"]>[number];

export const devinDefaultCapabilities: AgentCapability = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "normal", label: "Normal" },
    { id: "accept-edits", label: "Accept Edits" },
    { id: "smart", label: "Smart" },
    { id: "bypass", label: "Bypass Approvals" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsOneShot: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  mcpScope: { terminal: "none", gui: "launch" },
  defaultApprovalPolicy: "smart",
  presentationCapabilities: { gui: { defaultApprovalPolicy: "bypass" } },
  bypassPermissions: { approvalPolicy: "bypass" },
  settingDefs: [],
};

export function buildDevinCommand(
  location: ProjectLocation,
  args: string[],
  executablePath?: string,
  env?: Record<string, string>,
) {
  return buildAgentCommand(location, "devin", args, executablePath, env);
}

/**
 * Merge probe-advertised auth methods with Devin's static terminal fallback.
 * The shared dedupe only collapses env-var twins, so identical ids from the
 * probe and the static entry (both `devin-terminal-login` on 3000.11.3) are
 * deduped locally — the probe-advertised method wins because it carries the
 * CLI's own login args (`["--login"]`).
 */
export function dedupeDevinAuthMethods(
  methods: readonly DevinProbeAuthMethod[],
): DevinProbeAuthMethod[] {
  const seen = new Set<string>();
  return dedupeAcpAuthMethods(methods).filter((method) => {
    if (seen.has(method.id)) return false;
    seen.add(method.id);
    return true;
  });
}

/**
 * Merge the session's negotiated approval policies into Devin's defaults
 * (probe entries win labels; probe-only entries — e.g. `ask` from the live
 * five-choice baseline — are appended). A policy is only offered when the
 * session actually advertised it, so the picker and the session agree.
 */
function mergeDevinApprovalPolicies(
  probePolicies: readonly { id: string; label: string }[] | undefined,
): Array<{ id: string; label: string }> {
  const merged = new Map(
    devinDefaultCapabilities.approvalPolicies.map((policy) => [policy.id, policy]),
  );
  for (const policy of probePolicies ?? []) {
    merged.set(policy.id, policy);
  }
  return [...merged.values()];
}

/**
 * Project an ACP probe into provider capabilities.
 *
 * Auth state: Devin's `newSession` succeeds even logged out, so a successful
 * probe is NOT auth proof and is never propagated. Only the authoritative
 * negative — the `auth_required` error, surfaced by the probe as `missing` —
 * refines status; everything else falls back to the credential probes below.
 */
export function buildDevinProbeCapabilities(
  probe: AcpProbeResult | undefined,
): CapabilitiesProbeResult {
  return {
    ...(probe?.models?.length ? { models: probe.models } : {}),
    ...(probe?.efforts?.length ? { efforts: probe.efforts } : {}),
    ...(probe?.modelEfforts ? { modelEfforts: probe.modelEfforts } : {}),
    ...(probe?.modes?.length ? { modes: probe.modes } : {}),
    ...(probe?.subProviders?.length ? { subProviders: probe.subProviders } : {}),
    ...(probe?.modelSubProvider && Object.keys(probe.modelSubProvider).length > 0
      ? { modelSubProvider: probe.modelSubProvider }
      : {}),
    ...(probe?.slashCommands ? { slashCommands: probe.slashCommands } : {}),
    ...(probe?.authState === "missing" ? { authState: "missing" as const } : {}),

    approvalPolicies: mergeDevinApprovalPolicies(probe?.approvalPolicies),
    authMethods: dedupeDevinAuthMethods([
      ...(probe?.authMethods ?? []),
      { id: "devin-terminal-login", name: "Login", type: "terminal" },
    ]),
    authLogoutSupported: true,
  };
}

/**
 * `_meta` the capability probe advertises for grouped session config options,
 * derived from the same manifest entry the live-session advertisement
 * (`devinAcpClientCapabilitiesMeta` → structuredLaunch) reads, so the probe
 * and the sessions cannot drift: the probe negotiates a grouped model menu
 * exactly while the manifest state is `advertised`, and not earlier. While
 * the entry is disabled this is `undefined` and the grouped projection stays
 * inert. Streaming/subagent flags are deliberately not advertised here — the
 * probe only needs the config-option menu shape it projects.
 */
export function devinProbeClientCapabilitiesMeta(): Record<string, true> | undefined {
  const grouped = DEVIN_ACP_CLIENT_CAPABILITY_MANIFEST.find(
    (entry) => entry.flag === "grouped_options",
  );
  return grouped?.state === "advertised" ? { [grouped.wireKey]: true } : undefined;
}

/**
 * Compose the detected capability set.
 *
 * The CLI catalog stays the BASE selection truth: Terminal's `--model`
 * accepts every catalog family/variant, so the terminal picker keeps the
 * complete catalog. The GUI selection instead carries the ACP-NEGOTIATED
 * menu (accepted model values, the separate thought-level ladder, observed
 * per-model controls) as an explicit `presentationCapabilities.gui` override
 * — offering a catalog variant the live session would refuse is what made
 * the GUI model picker launch-broken. The catalog contributes labels/cost to
 * the negotiated entries only, never extra choices.
 */
export function composeDevinDetectedCapabilities(
  probe: AcpProbeResult | undefined,
  families: DevinModelFamily[] | undefined,
): CapabilitiesProbeResult {
  const projection = buildDevinProbeCapabilities(probe);
  const catalog = families?.length ? devinModelCapabilities(families) : undefined;
  // The catalog owns the base effort defaults: the negotiated thought level
  // must not become a base draft default for models the catalog declares
  // effort-less (opaque Fusion pairs) — the GUI override keeps it.
  const { defaultEffort: _negotiatedDefaultEffort, ...catalogBaseProjection } = projection;
  // The Terminal family relation: one Fusion descriptor carrying every
  // decoded catalog pair with its effort/Fast coordinates (see
  // modelFamilySelections.ts). Attached through a spread — the optional
  // `modelFamilies` capability field joins the shared schema independently.
  const familySelections = families?.length
    ? { modelFamilies: devinTerminalFamilySelections(families) }
    : {};
  return {
    ...(catalog ? catalogBaseProjection : projection),
    ...(catalog ?? {}),
    ...familySelections,
    ...(devinNegotiatedGuiSelectionCapabilities(
      devinDefaultCapabilities,
      projection,
      families ?? [],
    ) ?? {}),
  };
}

export const devinDetectionSpec: DetectionSpec = {
  kind: "devin",
  label: "Devin",
  binary: "devin",
  versionArgs: ["--version"],
  capabilities: devinDefaultCapabilities,
  loginCommand: ({ location, executablePath }) =>
    executablePath
      ? location.kind === "windows"
        ? `& ${quotePowerShellLiteral(executablePath)} auth login`
        : `${quotePosixShellArg(executablePath)} auth login`
      : undefined,
  update: {
    // `devin update` requires an interactive terminal; installers are noninteractive.
    homebrewCask: "devin-cli",
    winget: "CognitionAI.DevinCLI",
    latestVersionUrls: ["https://static.devin.ai/cli/current/manifest.json"],
    installer: {
      posix: { binary: "sh", args: ["-c", "curl -fsSL https://cli.devin.ai/install.sh | bash"] },
      windows: {
        binary: "powershell.exe",
        args: ["-NoProfile", "-Command", "irm https://static.devin.ai/cli/setup.ps1 | iex"],
      },
    },
  },
  authProbes: [
    envVarAuthProbe(["WINDSURF_API_KEY"]),
    async ({ location }) => {
      if (location.kind !== "wsl")
        return (await readDevinCredentials()) ? "authenticated" : "missing";
      const [result] = await batchWslCommandsAsync(location.distro, [
        'if [ -n "$WINDSURF_API_KEY" ]; then printf authenticated; else cat "${XDG_DATA_HOME:-$HOME/.local/share}/devin/credentials.toml" 2>/dev/null; fi',
      ]);
      return result?.stdout === "authenticated" ||
        (result?.ok && parseDevinCredentials(result.stdout))
        ? "authenticated"
        : "missing";
    },
  ],
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath) return undefined;
    const command = buildDevinCommand(ctx.location, ["acp"], ctx.executablePath);
    const processCwd = resolveProbeSpawnCwd(ctx.location, command.cwd);
    const catalogPromise = loadDevinModels(ctx.location, ctx.executablePath, ctx.signal).catch(
      () => undefined,
    );
    const configOptionMeta = devinProbeClientCapabilitiesMeta();
    const probe = await probeAcpCapabilities(
      command.command,
      command.args,
      getAgentProbeCwd(ctx.location),
      {
        ...(processCwd ? { processCwd } : {}),
        ...(command.env ? { env: command.env } : {}),
        ...(ctx.signal ? { signal: ctx.signal } : {}),
        ...(configOptionMeta ? { clientCapabilitiesMeta: configOptionMeta } : {}),
        timeoutMs: 30_000,
        label: `devin:${ctx.location.kind}`,
      },
    );
    const families = await catalogPromise;
    return composeDevinDetectedCapabilities(probe, families);
  },
};

/**
 * Detection spec for a Devin profile: identical executable and probes, but
 * auth status and the ACP capability probe resolve through the profile's
 * execution context (redirected account roots, `--config` prefix, sealed
 * instance environment) so they report the profile's own account view.
 */
export function createDevinDetectionSpec(settings: DevinExecutionSettings): DetectionSpec {
  const contextFor = async (
    location: ProjectLocation,
    executablePath: string | undefined,
    signal?: AbortSignal,
  ) =>
    resolveDevinExecutionContext(settings, location, {
      ...(executablePath ? { executablePath } : {}),
      signal,
    });
  return {
    ...devinDetectionSpec,
    ...(settings.runtimeTarget === "cloud"
      ? {
          capabilities: {
            ...devinDefaultCapabilities,
            ...devinCloudSelectionCapabilities(devinDefaultCapabilities),
          },
        }
      : {}),
    authProbes: [
      async ({ location, signal }) => {
        const resolution = await contextFor(location, undefined, signal);
        if (!resolution.ok) return "unknown";
        return resolveDevinAuthStateForContext(resolution.context, signal);
      },
    ],
    async capabilitiesProbe(ctx) {
      if (!ctx.executablePath) return undefined;
      const resolution = await contextFor(ctx.location, ctx.executablePath, ctx.signal);
      if (!resolution.ok) return undefined;
      const context = resolution.context;
      const isCloud = context.runtimeTarget === "cloud";
      const command = buildDevinCommand(
        ctx.location,
        [
          ...context.prefixArgs,
          "acp",
          // The root persona enum exists only on `acp` and only for the LOCAL
          // agent (--cloud documents --agent-type/--model as ignored), so the
          // probe must exercise the same shape the GUI session will get.
          ...(isCloud ? ["--cloud"] : context.agentType ? ["--agent-type", context.agentType] : []),
        ],
        ctx.executablePath,
        context.env,
      );
      const processCwd = resolveProbeSpawnCwd(ctx.location, command.cwd);
      // Seed the profile's private config view BEFORE the volatile scope is
      // hashed and the catalog subprocess starts: the digest must cover
      // exactly the config the `--config`-prefixed command consumes, not a
      // stale or not-yet-seeded view under a key for another state.
      let seedSucceeded = true;
      try {
        await prepareDevinProfileLaunch(context);
      } catch {
        // A policy seed failure must not silently run the catalog subprocess
        // over the wrong view state; the probe still reports the account's
        // negotiated menu, and the launch path re-reports the seed failure.
        seedSucceeded = false;
      }
      const catalogPromise =
        isCloud || !seedSucceeded
          ? Promise.resolve(undefined)
          : resolveDevinVolatileCatalogScope(context, ctx.signal)
              .then((volatileGeneration) =>
                loadDevinModelsForKey(
                  devinModelCatalogKey({
                    location: ctx.location,
                    generation: context.generation,
                    // Full volatile scope (credential + effective config +
                    // effective org): a token rotation, a same-path policy
                    // edit or an org change must never be served the
                    // previous state's probed catalog.
                    volatileGeneration,
                  }),
                  ctx.location,
                  ctx.executablePath,
                  ctx.signal,
                  // The profile's own environment, not the supervisor's env.
                  context.env,
                  context.prefixArgs,
                ),
              )
              // An UNREADABLE credential/config/org source is never collapsed
              // to a partial-keyed load — that key could collide with another
              // state's entry and serve a stale/default catalog. The probe
              // reports the negotiated ACP menu without a catalog instead.
              .catch(() => undefined);
      const configOptionMeta = devinProbeClientCapabilitiesMeta();
      const probe = await probeAcpCapabilities(
        command.command,
        command.args,
        getAgentProbeCwd(ctx.location),
        {
          ...(processCwd ? { processCwd } : {}),
          ...(command.env ? { env: command.env } : {}),
          ...(ctx.signal ? { signal: ctx.signal } : {}),
          ...(configOptionMeta ? { clientCapabilitiesMeta: configOptionMeta } : {}),
          timeoutMs: 30_000,
          label: `devin:${ctx.location.kind}:${context.instanceId}`,
          ...(isCloud
            ? {
                sessionProbe: "initialize-only" as const,
                fsTextCapability: false,
                terminalCapability: false,
              }
            : {}),
        },
      );
      const families = await catalogPromise;
      // Cloud prelaunch startability: the initialize-only probe can never see
      // a cloud `model` menu (no model option exists; the model role is the
      // session-only `devin_version`), and a zero-model provider is hidden by
      // the pickers entirely. The provider-owned native-default selection is
      // the honest single entry on both surfaces; the ACP resolver resolves
      // it to the live cloud version (see models.ts). Local profiles get the
      // negotiated-menu GUI override over the complete terminal catalog.
      return isCloud
        ? {
            ...buildDevinProbeCapabilities(probe),
            ...devinCloudSelectionCapabilities(devinDefaultCapabilities),
          }
        : composeDevinDetectedCapabilities(probe, families);
    },
  };
}
