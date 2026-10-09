import type { CreateStructuredSessionInput, StructuredSessionHandle } from "../base/types";
import { msg } from "@/shared/messages";

import { createAcpStructuredSession } from "../acp";
import { prepareAgentLocationEnvironment } from "../base";
import { prepareMcpToolFilters } from "../../mcp/McpToolFilterService";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { prepareDevinMcpConfig } from "./mcpConfig";
import { createDevinAcpTransform } from "./acpTransform";
import { warmDevinModels } from "./modelCatalog";
import {
  createDevinAcpModelResolver,
  devinAcknowledgedModelCarriesEffort,
  resolveDevinAcpLaunchModel,
} from "./models";
import {
  DevinProfilePolicyError,
  devinConfigNeedsVariantMapping,
  prepareDevinProfileLaunch,
  prepareDevinProfileMcpOverlay,
} from "./launchContext";
import { devinAcpClientCapabilitiesMeta } from "./acp/capabilityManifest";
import { createDevinDiagnosticsRequestHandler } from "./acp/diagnostics";
import {
  DEVIN_ACP_FAST_CONFIG_BINDING,
  devinAcpConfigOptionsNormalizerFor,
  devinAcpLiveConfigActionDescriptors,
} from "./acp/sessionConfiguration";
import { projectQualifiedAllowOtherPresentation } from "./acp/allowOtherPresentation";
import { devinAcpSessionActionDescriptors } from "./acp/sessionActions";
import { resolveDevinAcpMode } from "./acp/sessionModes";
import { buildDevinCommand } from "./detection";
import { buildDevinAcpArgs } from "./argv";
import { allowDevinCloudRepositorySelection, configureDevinCloudSetup } from "./cloudSetup";
import {
  assertDevinResumeScope,
  profileUnavailable,
  stampDevinStructuredSessionRefs,
} from "./sessionBinding";
import { scanDevinPersonasForContext } from "./personas/catalog";
import { devinNativePersonasSessionAction } from "./personas/sessionAction";
import type { DevinAdapterContexts, devinDefaultAccountContext } from "./adapterContext";

/**
 * Structured (GUI/ACP) session composition. Extracted from `index.ts`
 * (God-file rule): identity validation, MCP policy (cloud omission /
 * profile overlay / stdio relays), the neutral persona catalog, the
 * negotiated-menu model resolver, and the cloud-target-gated session
 * actions — one provider-owned composition with no shared seams.
 */

export function createDevinStructuredSessionLauncher(
  contexts: DevinAdapterContexts,
  defaultAccountContext: typeof devinDefaultAccountContext,
) {
  return async (
    input: CreateStructuredSessionInput,
  ): Promise<StructuredSessionHandle | undefined> => {
    // session/new does not persist a native session until a turn runs.
    // Terminal must create its own session in the real PTY.
    if (input.presentationMode !== "gui") {
      if (input.additionalDirectories?.length) {
        throw profileUnavailable(
          "workspace-roots-chat-only",
          msg("thread.configSelectionRejected"),
        );
      }
      return undefined;
    }
    const context = await contexts.contextFor(input.projectLocation, { provision: true });
    // Validate the profile's identity and resume binding BEFORE any
    // reattach or spawn: an unprovable account or a missing/foreign binding
    // fails visibly instead of resuming under a different account.
    const identity = await contexts.provenIdentityOrFail(context);
    assertDevinResumeScope(identity, input.sessionRef);
    if (context) await prepareDevinProfileLaunch(context);
    const isCloud = context?.runtimeTarget === "cloud";
    // These locations belong to the local execution host. A cloud relay
    // cannot turn them into cloud repository grants or a remote workspace.
    if (isCloud && input.additionalDirectories?.length) {
      throw profileUnavailable(
        "cloud-workspace-roots-unsupported",
        msg("thread.configSelectionRejected"),
      );
    }
    if (isCloud && context?.agentType !== undefined) {
      throw profileUnavailable(
        "cloud-root-agent-type-unsupported",
        "Cloud chat uses its cloud persona, not a local root agent type. Save this cloud profile to clear its local agent type.",
      );
    }
    // Best-effort enrichment: ACP negotiates model/mode after open, so a
    // cold or failing catalog opens the session on the raw id instead of
    // aborting the launch (plan G17). The catalog subprocess only runs when
    // explicit variant controls actually need mapping. Cloud is excluded:
    // the `--cloud` relay ignores `--model`/`--agent-type`, so the LOCAL
    // catalog's families must never be mapped onto it — the negotiated
    // cloud config options are the only model authority there.
    const families = isCloud
      ? undefined
      : await contexts
          .catalogScope(input.projectLocation, context)
          .then((scope) =>
            warmDevinModels(
              // Fully volatile-scoped key (credential + effective config +
              // org); a scope or catalog failure degrades to no catalog
              // below, never to a missing-dimension cache entry.
              scope,
              contexts.executableFor(input.projectLocation, context) ?? "devin",
              devinConfigNeedsVariantMapping(input.config),
              undefined,
              context?.env,
              context?.prefixArgs,
            ),
          )
          .catch(() => undefined);
    const mcpServers = isCloud
      ? // A cloud agent executes outside this host: stdio servers (including
        // Poracode's tool-filter relays) and config paths are unreachable.
        // Poracode's per-server `disabledTools` filtering is enforced by the
        // stdio relay, and no qualified cloud-side substitute exists (the
        // documented native filter does not apply to injected entries and a
        // `permissions.deny` mapping is unqualified for cloud session/new),
        // so a server carrying a tool filter is OMITTED — never forwarded
        // silently unfiltered. Unfiltered remote http/sse entries stay
        // negotiable through standard `session/new`.
        (input.mcpServers ?? []).filter(
          (server) => server.transport.type !== "stdio" && !server.disabledTools?.length,
        )
      : await prepareMcpToolFilters(input.mcpServers ?? [], input.projectLocation, {
          remoteViaStdio: true,
        });
    // Disk-catalog overlay: the default account uses the shared overlay; a
    // redirected profile builds its own PRIVATE overlay from its config
    // root, preserving the account's resources and credential root. A cloud
    // runtime cannot see a host config path, so no overlay is built for it —
    // faking a local scope/path there would pretend host injection works.
    const overlay = isCloud
      ? undefined
      : context?.env && (context.env.XDG_CONFIG_HOME || context.env.APPDATA)
        ? await prepareDevinProfileMcpOverlay(input.projectLocation, context, mcpServers).catch(
            (error) => {
              // A policy/config failure is NOT ordinary MCP enrichment: the
              // profile's own MCP catalog is unreadable or unparseable, and
              // degrading would hide that behind a working-looking session.
              // Transient overlay-mechanics failures still degrade to
              // injection-only.
              if (error instanceof DevinProfilePolicyError) {
                throw profileUnavailable("mcp-policy-unavailable", error.message);
              }
              return undefined;
            },
          )
        : await prepareDevinMcpConfig(input.projectLocation, mcpServers);
    await prepareAgentLocationEnvironment(input.projectLocation);
    // Neutral persona catalog for THIS session's execution context — served
    // Poracode-side (no agent RPC), so only for locations the scan can
    // actually read. WSL persona roots are Linux paths without a qualified
    // distro-side reader: the action is omitted there instead of pretending
    // an empty catalog.
    const personasAction =
      input.projectLocation.kind === "wsl"
        ? undefined
        : devinNativePersonasSessionAction(async ({ signal }) => {
            signal?.throwIfAborted();
            const scanContext = context ?? (await defaultAccountContext(input.projectLocation));
            if (!scanContext) {
              return {
                status: "unsupported-environment",
                reason: "The Devin execution context could not be resolved for persona discovery.",
              };
            }
            return scanDevinPersonasForContext(
              scanContext,
              undefined,
              signal ? { signal } : undefined,
            );
          });
    try {
      let model = input.config.model;
      if (!isCloud && families && families.length > 0) {
        // A loaded catalog is authoritative for every control it can map: an
        // unmapped family request, or fast/thinking/context against a
        // composite Fusion pair, fails the open visibly. A composite pair's
        // meaningful EFFORT alone defers to the strict post-open validation
        // instead of failing pre-negotiation: the ACP argv carries the id
        // alone, and the live thought_level select — its ladder membership
        // validated by the shared config sync before any prompt — is the
        // effort's carrier, including the level a native write echoed into
        // the persisted config (checkpoint L). The effort is never removed
        // from the config here; silently returning a stripped config would
        // drop the user's explicit selection.
        model = resolveDevinAcpLaunchModel(families, input.config);
      }
      // Catalog unavailable: the raw id passes through — a cold or failing
      // catalog is an enrichment gap, not a selection rejection (plan G17).
      const command = buildDevinCommand(
        input.projectLocation,
        [
          ...(context?.prefixArgs ?? []),
          ...buildDevinAcpArgs(
            { ...input.config, model },
            {
              ...(context?.agentType ? { agentType: context.agentType } : {}),
              ...(isCloud ? { cloud: true } : {}),
            },
          ),
        ],
        resolveAgentBinaryPath(input.projectLocation, "devin"),
        context?.env,
      );
      const session = createAcpStructuredSession(
        { ...command, ...(overlay?.env ? { env: { ...command.env, ...overlay.env } } : {}) },
        {
          ...input,
          mcpServers,
          acpSessionUpdateTransform: createDevinAcpTransform(),
          // Diagnostics are host IDE data, so a cloud execution cannot be
          // paired with a local workspace's findings. Only a local session
          // with the supervisor's project-bound source advertises the pull.
          acpClientCapabilitiesMeta: devinAcpClientCapabilitiesMeta({
            requestDiagnostics: !isCloud && input.readHostDiagnostics !== undefined,
          }),
          ...(!isCloud && input.readHostDiagnostics
            ? {
                acpExtensionRequestHandler: createDevinDiagnosticsRequestHandler(
                  input.readHostDiagnostics,
                ),
              }
            : {}),
          // Confirmed `_cognition.ai/*` RPCs plus the Poracode-side
          // `native-personas.list` as neutral session actions; the shared
          // session injects its live extMethod transport and addresses
          // them by id only (no raw RPC tunnel). Cloud-only archive is
          // composed for cloud targets and filtered out of the local
          // surface, where the method answers -32601.
          acpSessionActions: (transport) => {
            const targetDescriptors = devinAcpSessionActionDescriptors(transport, {
              target: isCloud ? "cloud" : "local",
            });
            // Live config pair (`devin.config.list`/`set`) when the shared
            // seam carries both transport members; the descriptors compose
            // after the vendor RPCs and before the Poracode-side persona
            // scan, which always stays last.
            const configDescriptors = devinAcpLiveConfigActionDescriptors(transport);
            const descriptors = [...targetDescriptors, ...configDescriptors];
            return personasAction ? [...descriptors, personasAction] : descriptors;
          },
          // Provider-owned pure normalizer: cloud options carry
          // `category: null`, so `devin_version` — the cloud model select —
          // is given the semantic `model` category (native ids/values/meta
          // preserved) and the shared reduction folds it into the thread
          // config after a confirmed write. Local wires no normalizer: the
          // native `speed` select keeps its native category and is bound
          // through DEVIN_ACP_FAST_CONFIG_BINDING in the behavior below.
          ...(devinAcpConfigOptionsNormalizerFor(isCloud ? "cloud" : "local")
            ? {
                acpConfigOptionsNormalizer: devinAcpConfigOptionsNormalizerFor(
                  isCloud ? "cloud" : "local",
                )!,
              }
            : {}),
          // The one qualified custom-answer flag is projected onto the shared
          // form. Reply normalization still reads the original request.
          acpElicitationPresentation: projectQualifiedAllowOtherPresentation,
          // A cloud agent runs outside the host's filesystem: client-hosted
          // text IO, terminal operations, and agent-origin host image reads
          // are refused. The image gate is independent of the text callback.
          ...(isCloud
            ? {
                acpFsTextCapability: false,
                acpTerminalCapability: false,
                acpLocalResourceResolution: false,
              }
            : {}),
        },
        {
          // Throwing resolver: an explicit selection the live session does
          // not accept fails the turn visibly (wrapped by the shared seam
          // into AcpConfigSelectionError) instead of falling back to the
          // legacy session/set_model request and prompting on whatever
          // model the agent holds. Cloud keeps an EMPTY family list and
          // resolves the `devin_version` role through the cloud contracts
          // (native-default intent → live current value; explicit ids only
          // when the live menu advertises them). Local resolves the stored
          // family onto the session's ADVERTISED representative with the
          // separate thought-level control carrying effort — on regular
          // variants and catalog-classified composite pairs alike.
          ...(isCloud
            ? {
                configureOpenedSession: configureDevinCloudSetup(context?.cloudDefaults),
                allowUnlistedSelectValue: allowDevinCloudRepositorySelection,
              }
            : {}),
          resolveModelConfig: createDevinAcpModelResolver({
            families: families ?? [],
            ...(isCloud ? { cloud: true } : {}),
          }),
          resolveMode: (config, availableModeIds) => resolveDevinAcpMode(config, availableModeIds),
          // Root's neutral strict selection: a model selection the live
          // session does not advertise is a typed visible error, never a
          // silent keep-the-raw-id fallback after open.
          behavior: {
            strictConfigSelection: true,
            // Live two-turn proof: prompt totals reset each turn (including
            // cached input); vendor stats echo those same totals. Count only
            // the standard reply, and retain usage_update as context truth.
            // Cloud counter semantics require their own qualification.
            ...(!isCloud
              ? {
                  promptUsageCounterKind: "per-call" as const,
                  promptUsageReportsContext: false,
                  // Live receipt (root-live-config-qualification-2.json): a
                  // local 3000.11.3 session accepted a `model` setter WHILE a
                  // prompt was pending, echoed the dependent thought level,
                  // and the follow-up ran on the new model. Cloud is NOT
                  // qualified for mid-prompt writes and keeps the shared
                  // default reject.
                  allowConfigWritesDuringPrompt: true,
                  // The native fast/standard quality select (exact capture:
                  // tmp/devin/checkpoint-l-native-pair-controls.json) binds
                  // the shared ThreadConfig.fast toggle: the shared seam
                  // classifies the bound select by exact id plus its exact
                  // advertised value pair, folds the agent's native echo back
                  // to the boolean, and pushes the exact native value on a
                  // toggle — ids and values are never rewritten and no
                  // `true`/`false` wire aliases are invented. Cloud declares
                  // nothing: the Fast model tier (`devin-fast-opus`) stays
                  // the sole cloud model choice.
                  fastConfigBinding: DEVIN_ACP_FAST_CONFIG_BINDING,
                  // Catalog variant identity encodes the level: after a
                  // model acknowledgement the shared strict target validation
                  // consults this provider-owned proof instead of demanding
                  // an independent reasoning select from every target model.
                  // Cloud declares nothing — the `devin_version` role carries
                  // no graded effort, so a meaningful level beside a version
                  // write stays a typed rejection, never a silent drop.
                  modelCarriesEffort: (config, sessionOptions) =>
                    devinAcknowledgedModelCarriesEffort(families ?? [], config, sessionOptions),
                }
              : {}),
          },
        },
      );
      if (!session) {
        await overlay?.cleanup();
        return undefined;
      }
      if (identity) {
        // Stamp every ref this session reports — both listener updates (the
        // persisted ref follows the listener path) and the shared getter
        // (spawn pipeline + subattempt runner) — so the immutable scope
        // binding is captured the moment the session exists.
        stampDevinStructuredSessionRefs(session, identity);
      }
      const dispose = session.dispose.bind(session);
      session.dispose = async () => {
        try {
          await dispose();
        } finally {
          await overlay?.cleanup();
        }
      };
      return session;
    } catch (error) {
      await overlay?.cleanup();
      throw error;
    }
  };
}
