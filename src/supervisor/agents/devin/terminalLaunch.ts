import type { ProjectLocation, SessionRef, ThreadConfig } from "@/shared/contracts";
import { createKnownSessionRef, resolveCheckedOneShotBuilderSelection } from "../base";
import type { OneShotGenerationOptions } from "../base";
import { cachedDevinModelsForKey, devinModelCatalogKey, warmDevinModels } from "./modelCatalog";
import {
  devinConfigNeedsVariantMapping,
  effectiveDevinUserConfigPath,
  prepareDevinProfileLaunch,
  resolveDevinLaunchModel,
} from "./launchContext";
import { withDevinScopeIdentity } from "./sessionScope";
import { createDevinSessionDiscovery, prepareDevinSessionRecordLaunch } from "./sessionFiles";
import { buildDevinArgs, buildDevinOneShotArgs } from "./argv";
import { isDevinCloudDefaultModelId } from "./models";
import { assertDevinUnmappedOneShotControls, resolveDevinUtilityModel } from "./oneShotSelection";
import { DevinProfileUnavailableError, profileUnavailable } from "./sessionBinding";
import type { DevinAdapterContexts } from "./adapterContext";

/**
 * Terminal (PTY) launch lanes: initial launch, resume, config rewrite and
 * one-shot utilities. Extracted from `index.ts` (God-file rule); every lane
 * resolves its fresh execution context and proven identity BEFORE any
 * process starts.
 */
export interface DevinTerminalLaunch {
  buildLaunchArgv(
    location: ProjectLocation,
    config: ThreadConfig,
    prompt: string,
    sessionRef: SessionRef | undefined,
  ): Promise<{
    binary: string;
    args: string[];
    env?: Record<string, string>;
    cleanup?: () => Promise<void>;
    sessionRef?: SessionRef;
  }>;
  buildResumeArgv(
    location: ProjectLocation,
    config: ThreadConfig,
    prompt: string,
    sessionRef: SessionRef | undefined,
  ): Promise<{ binary: string; args: string[]; env?: Record<string, string> }>;
  rewriteLaunchArgsForConfig(
    args: string[],
    config: ThreadConfig,
    location: ProjectLocation,
  ): Promise<string[]>;
  buildOneShotCommand(
    model: string,
    effort: string | undefined,
    prompt: string,
    location: ProjectLocation | undefined,
    fast: boolean | undefined,
    options?: OneShotGenerationOptions,
  ): Promise<
    | {
        command: string;
        args: string[];
        stdin: string;
        env?: Record<string, string>;
      }
    | undefined
  >;
}

export function createDevinTerminalLaunch(
  contexts: DevinAdapterContexts,
  discovery: ReturnType<typeof createDevinSessionDiscovery>,
  agentKind: string,
): DevinTerminalLaunch {
  const owner = { agentKind, presentationMode: "terminal" as const };
  /**
   * The private cloud native-default choice is an ACP INTENT, never a CLI
   * id: it is dropped from Terminal argv (the cloud CLI picks its own
   * version) instead of being sent as a model flag.
   */
  const terminalModel = (config: ThreadConfig): ThreadConfig =>
    isDevinCloudDefaultModelId(config.model) ? { ...config, model: "" } : config;

  return {
    async buildLaunchArgv(location, config, prompt, sessionRef) {
      const { context, identity, isCloud } = await contexts.prepareTerminalLaunch(
        location,
        sessionRef,
      );
      const id = sessionRef?.providerSessionId;
      // Exact session identity for NEW terminal sessions: a private per-launch
      // hook view records the CLI's SessionStart session_id (plan V3). The
      // hook view already contains the effective user config, so it replaces
      // any other `--config` prefix for this launch; if it cannot be prepared
      // (or never fires) the snapshot-diff discovery below still applies.
      // Skipped for WSL locations (Linux record paths the host fs cannot read)
      // and for cloud targets: a cloud session is neither written to nor
      // discoverable from the local account db, and a local hook record would
      // be foreign discovery. No qualified cloud session-id path exists.
      const record =
        id || isCloud || location.kind === "wsl"
          ? undefined
          : await prepareDevinSessionRecordLaunch(effectiveDevinUserConfigPath(context), {
              strictSource: context?.configPath !== undefined,
            }).catch(() => undefined);
      const reservation = isCloud
        ? undefined
        : discovery.prepare(location, contexts.discoveryScope(context), record?.recordPath);
      const cleanups: Array<() => void | Promise<void>> = [];
      if (record) cleanups.push(record.cleanup);
      if (reservation) cleanups.push(reservation);
      return {
        binary: "devin",
        args: [
          ...(record?.prefixArgs ?? context?.prefixArgs ?? []),
          // Real PTY cloud parity: `--cloud` drives cloud sessions instead of
          // silently running the local agent (a top-level CLI option, live
          // verified on 3000.11.3).
          ...(isCloud ? ["--cloud"] : []),
          ...buildDevinArgs(terminalModel(config), prompt, id),
        ],
        ...(context?.env ? { env: context.env } : {}),
        ...(cleanups.length > 0
          ? {
              cleanup: async () => {
                await Promise.all(cleanups.map((cleanup) => Promise.resolve(cleanup())));
              },
            }
          : {}),
        ...(id
          ? {
              sessionRef: identity
                ? withDevinScopeIdentity(createKnownSessionRef(id), identity)
                : createKnownSessionRef(id),
            }
          : {}),
      };
    },

    async buildResumeArgv(location, config, prompt, sessionRef) {
      const id = sessionRef?.providerSessionId;
      if (!id) {
        throw profileUnavailable(
          "resume-session-missing",
          "Terminal resume requires an exact owned session ID; the latest-session fallback cannot identify this thread.",
        );
      }
      const { context, isCloud } = await contexts.prepareTerminalLaunch(location, sessionRef);
      // A cwd can contain several app threads or outside CLI sessions. Only
      // the exact native id belongs to this thread; never guess the latest.
      return {
        binary: "devin",
        args: [
          ...(context?.prefixArgs ?? []),
          ...(isCloud ? ["--cloud"] : []),
          ...buildDevinArgs(terminalModel(config), prompt, id),
        ],
        ...(context?.env ? { env: context.env } : {}),
      };
    },

    async rewriteLaunchArgsForConfig(args, config, location) {
      // The native-default intent never maps to a CLI id: drop the model pair.
      if (isDevinCloudDefaultModelId(config.model)) {
        const modelIndex = args.indexOf("--model");
        return modelIndex < 0
          ? args
          : [...args.slice(0, modelIndex), ...args.slice(modelIndex + 2)];
      }
      const context = await contexts.contextFor(location).catch((error) => {
        // Launch already resolved this context; a failure here must not
        // downgrade an explicit model silently — surface it.
        if (error instanceof DevinProfileUnavailableError) throw error;
        return undefined;
      });
      await discovery.ready(location, contexts.discoveryScope(context));
      const modelIndex = args.indexOf("--model");
      if (modelIndex < 0) return args;
      const executable = contexts.executableFor(location, context);
      if (!executable) {
        resolveDevinLaunchModel(undefined, config, owner);
        return args;
      }
      let families;
      try {
        families = await warmDevinModels(
          // Fully volatile-scoped key (credential + effective config + org);
          // a scope failure degrades to no catalog inside the catch instead
          // of touching a missing-dimension cache entry.
          await contexts.catalogScope(location, context),
          executable,
          // Skip the catalog subprocess entirely when the raw model suffices.
          devinConfigNeedsVariantMapping(config),
          undefined,
          // The catalog subprocess must resolve the profile's account view,
          // not the supervisor's environment (plan §4 spawn-lane parity).
          context?.env,
          context?.prefixArgs,
        );
      } catch {
        families = undefined;
      }
      const resolved = [...args];
      const model = resolveDevinLaunchModel(families, config, owner);
      if (model !== undefined) resolved[modelIndex + 1] = model;
      return resolved;
    },

    async buildOneShotCommand(model, effort, prompt, location, fast, oneShotOptions) {
      // The positionals are a checked projection of the one complete utility
      // selection; disagreement is a visible input error before any catalog
      // read or spawn.
      const selection = resolveCheckedOneShotBuilderSelection(
        { model, effort, fast },
        oneShotOptions,
      );
      const effectiveModel = isDevinCloudDefaultModelId(model) ? "" : model;
      const effectiveSelection = { ...selection, model: effectiveModel };
      if (!effectiveModel) assertDevinUnmappedOneShotControls(effectiveSelection);
      if (!prompt) return undefined;
      const context = location
        ? await contexts.contextFor(location, { provision: true })
        : undefined;
      // Declared unsupported for cloud profiles (see sessionBinding): the
      // shared generator surfaces a visible "does not support" error instead
      // of silently running the utility against the local default account.
      if (context?.runtimeTarget === "cloud") return undefined;
      if (context) await prepareDevinProfileLaunch(context);
      // A volatile-scope failure degrades to no catalog (raw id, or the typed
      // explicit-control failure below) — never a cache key missing the
      // credential/config/org dimensions.
      const scope = location
        ? await contexts.catalogScope(location, context).catch(() => undefined)
        : undefined;
      const executable = location ? contexts.executableFor(location, context) : undefined;
      // Same conservative gate over the complete selection: present
      // thinking/context carriers need the catalog exactly like effort/Fast.
      const needsMapping =
        Boolean(effort || fast !== undefined) ||
        devinConfigNeedsVariantMapping({
          model: effectiveModel,
          effort,
          fast,
          thinking: selection.thinking,
          contextSize: selection.contextSize,
        });
      let families;
      if (scope && executable) {
        const key = devinModelCatalogKey(scope);
        families = cachedDevinModelsForKey(key).length
          ? cachedDevinModelsForKey(key)
          : await warmDevinModels(
              scope,
              executable,
              needsMapping,
              undefined,
              context?.env,
              context?.prefixArgs,
            ).catch(() => undefined);
      }
      return {
        command: "devin",
        args: [
          ...(context?.prefixArgs ?? []),
          ...buildDevinOneShotArgs(
            resolveDevinUtilityModel(families, effectiveSelection, owner) || undefined,
            prompt,
          ),
        ],
        stdin: "",
        ...(context?.env ? { env: context.env } : {}),
      };
    },
  };
}
