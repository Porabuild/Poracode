import type { ProjectLocation, SessionRef } from "@/shared/contracts";
import {
  prepareAgentLocationEnvironment,
  detectProbeLocation,
  type AgentEnvContext,
} from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { validateDevinAccountRoot } from "./accountRoots";
import { resolveDevinProvenScopeIdentity, DevinAccountIdentityError } from "./accountIdentity";
import type { DevinCatalogScope } from "./modelCatalog";
import {
  devinDefaultExecutionSettings,
  resolveDevinExecutionContext,
  type DevinExecutionContext,
  type DevinExecutionSettings,
} from "./profileContext";
import { prepareDevinProfileLaunch } from "./launchContext";
import { assertDevinCloudSetupChatOnly } from "./cloudSetup";
import {
  DevinCatalogScopeUnavailableError,
  resolveDevinVolatileCatalogScope,
} from "./volatileCatalog";
import type { DevinDiscoveryScope } from "./sessionFiles";
import {
  assertAgentTypeNotTerminal,
  assertDevinResumeScope,
  identityUnavailable,
  profileUnavailable,
} from "./sessionBinding";

/**
 * The one-launch-context runtime every Devin spawn lane shares (plan §4):
 * context resolution, the discovery context cache, the proven scope identity,
 * and the volatile-scoped catalog/executor resolution. Extracted from
 * `index.ts` so the adapter composition stays readable (God-file rule) —
 * provider-owned leaf code, no shared seams.
 */
export interface DevinAdapterContexts {
  /** Fresh immutable context per call, including the native default account. */
  contextFor(
    location: ProjectLocation,
    launchOptions?: { provision?: boolean; signal?: AbortSignal },
  ): Promise<DevinExecutionContext | undefined>;
  /** Read-only discovery lanes reuse one resolved context per location. */
  contextForDiscovery(location: ProjectLocation): Promise<DevinExecutionContext | undefined>;
  /** The proved account identity; an unresolved context carries no proof. */
  provenIdentityOrFail(
    context: DevinExecutionContext | undefined,
    signal?: AbortSignal,
  ): Promise<string | undefined>;
  /**
   * Fully volatile-scoped catalog key material for a warm/load lane: the
   * effective context (the base adapter resolves the native default account)
   * plus the memory-only volatile scope (credential + effective config +
   * effective org — see `volatileCatalog.ts`). NEVER returns a
   * missing-dimension scope: a resolution failure throws so the lane degrades
   * to an unavailable catalog instead of reading or writing an entry another
   * credential/org/policy state could have cached under the same key.
   */
  catalogScope(
    location: ProjectLocation,
    context: DevinExecutionContext | undefined,
    signal?: AbortSignal,
  ): Promise<DevinCatalogScope>;
  executableFor(location: ProjectLocation, context?: DevinExecutionContext): string | undefined;
  discoveryScope(context: DevinExecutionContext | undefined): DevinDiscoveryScope | undefined;
  accountRootStillValid(
    context: DevinExecutionContext,
    location: ProjectLocation,
  ): Promise<boolean>;
  prepareTerminalLaunch(
    location: ProjectLocation,
    sessionRef: SessionRef | undefined,
    signal?: AbortSignal,
  ): Promise<{
    context: DevinExecutionContext | undefined;
    identity: string | undefined;
    isCloud: boolean;
  }>;
}

/**
 * The base adapter's ACTUAL default execution context (no profile): native
 * default roots resolved from the real host environment, used to derive
 * persona scan roots explicitly instead of guessing supervisor paths.
 */
export async function devinDefaultAccountContext(
  location: ProjectLocation,
): Promise<DevinExecutionContext | undefined> {
  const resolution = await resolveDevinExecutionContext(devinDefaultExecutionSettings, location);
  return resolution.ok ? resolution.context : undefined;
}

export function createDevinAdapterContexts(
  profile: DevinExecutionSettings | undefined,
): DevinAdapterContexts {
  const contextFor = async (
    location: ProjectLocation,
    launchOptions?: { provision?: boolean; signal?: AbortSignal },
  ): Promise<DevinExecutionContext | undefined> => {
    const resolution = await resolveDevinExecutionContext(
      profile ?? devinDefaultExecutionSettings,
      location,
      {
        executablePath: resolveAgentBinaryPath(location, "devin"),
        provision: launchOptions?.provision,
        ...(launchOptions?.signal ? { signal: launchOptions.signal } : {}),
      },
    );
    if (!resolution.ok) throw profileUnavailable(resolution.code, resolution.message);
    return resolution.context;
  };

  /**
   * Context cache for the read-only discovery lanes. Launch lanes keep fresh
   * resolutions (so a rotated credential is re-fingerprinted per launch);
   * discovery runs on every watcher event, so it reuses the adapter's
   * resolved context (adapters are rebuilt whenever the profile config or
   * its owner changes, so the cache cannot outlive a reassignment). The
   * cached context never feeds catalog keys — discovery reads no catalog —
   * and every attribution re-validates the account root manifest.
   */
  const discoveryContextCache = new Map<string, Promise<DevinExecutionContext | undefined>>();
  const locationCacheKey = (location: ProjectLocation): string =>
    location.kind === "wsl"
      ? `wsl:${location.distro}:${location.linuxPath}`
      : `${location.kind}:${location.path}`;
  const contextForDiscovery = (location: ProjectLocation) => {
    const key = locationCacheKey(location);
    let entry = discoveryContextCache.get(key);
    if (!entry) {
      entry = contextFor(location).catch((error) => {
        // Guard failures stay retryable (the user may repair the root);
        // successful resolutions are immutable.
        discoveryContextCache.delete(key);
        throw error;
      });
      discoveryContextCache.set(key, entry);
    }
    return entry;
  };

  /**
   * The PROVEN immutable identity this adapter stamps on every ref it creates
   * and validates on every resume: the scope dimensions plus the stable
   * account user id proved over authenticated native metadata. The base
   * adapter resolves and proves its native default account in the same way.
   * An identity-proof failure is a visible launch failure, never a skipped
   * verification; only genuinely cancellable aborts propagate unchanged.
   */
  const provenIdentityOrFail = async (
    context: DevinExecutionContext | undefined,
    signal?: AbortSignal,
  ): Promise<string | undefined> => {
    if (!context) return undefined;
    try {
      return await resolveDevinProvenScopeIdentity(context, signal);
    } catch (error) {
      if (error instanceof DevinAccountIdentityError) throw identityUnavailable(error);
      throw error;
    }
  };

  /**
   * The catalog warm/load lanes' volatile scope. The base adapter (no
   * profile context) resolves the native default account so its keys stay
   * scoped to the default credential + effective config + org state too;
   * resolution failures throw and the lane degrades — never a
   * missing-dimension key.
   */
  const catalogScope = async (
    location: ProjectLocation,
    context: DevinExecutionContext | undefined,
    signal?: AbortSignal,
  ): Promise<DevinCatalogScope> => {
    const effective = context ?? (await devinDefaultAccountContext(location));
    if (!effective) {
      throw new DevinCatalogScopeUnavailableError(
        "The Devin execution context for the model catalog could not be resolved.",
      );
    }
    return {
      location,
      generation: effective.generation,
      volatileGeneration: await resolveDevinVolatileCatalogScope(effective, signal),
    };
  };

  const executableFor = (location: ProjectLocation, context?: DevinExecutionContext) =>
    context?.binaryIdentity ?? resolveAgentBinaryPath(location, "devin");

  /** Session discovery is scoped per account data root; the default root is shared. */
  const discoveryScope = (
    context: DevinExecutionContext | undefined,
  ): DevinDiscoveryScope | undefined =>
    context && context.account.kind !== "default"
      ? { dataRoot: context.roots.dataRoot }
      : undefined;

  /**
   * Re-validate an isolated/reference account root before attributing refs or
   * watch events to it. The discovery context cache holds immutable resolved
   * contexts, so WITHOUT this a root whose manifest is later corrupted or
   * replaced would keep being attributed through the cached context forever.
   */
  const accountRootStillValid = async (
    context: DevinExecutionContext,
    location: ProjectLocation,
  ): Promise<boolean> => {
    if (context.account.kind === "default") return true;
    return validateDevinAccountRoot(context.roots, context.account.ownerId, location).then(
      () => true,
      () => false,
    );
  };

  /**
   * Resolve and verify the execution context for a Terminal (PTY) launch or
   * resume: agent-type refusals, the identity proof, the resume-scope
   * binding, and config seeding — all before any process starts.
   */
  const prepareTerminalLaunch = async (
    location: ProjectLocation,
    sessionRef: SessionRef | undefined,
    signal?: AbortSignal,
  ) => {
    const context = await contextFor(location, { provision: true, ...(signal ? { signal } : {}) });
    // A profile declaring a root agent persona (review/summarizer) cannot be
    // honored by the terminal CLI (acp --agent-type only) — refuse visibly.
    assertAgentTypeNotTerminal(context?.agentType);
    assertDevinCloudSetupChatOnly(context?.runtimeTarget, context?.cloudDefaults);
    const identity = await provenIdentityOrFail(context, signal);
    // Refuse a foreign/missing scope binding BEFORE any provisioning side
    // effect or process spawn (recovery lanes pass a replacement ref here).
    assertDevinResumeScope(identity, sessionRef);
    if (context) await prepareDevinProfileLaunch(context);
    return { context, identity, isCloud: context?.runtimeTarget === "cloud" };
  };

  return {
    contextFor,
    contextForDiscovery,
    provenIdentityOrFail,
    catalogScope,
    executableFor,
    discoveryScope,
    accountRootStillValid,
    prepareTerminalLaunch,
  };
}

/** Probe-lane context for the auth (login/logout) flows. */
export async function prepareDevinAuthFlow(
  contexts: DevinAdapterContexts,
  ctx: AgentEnvContext | undefined,
): Promise<{ location: ProjectLocation; context: DevinExecutionContext | undefined }> {
  const location = detectProbeLocation(ctx);
  await prepareAgentLocationEnvironment(location, { signal: ctx?.signal });
  const context = await contexts.contextFor(location, {
    provision: true,
    ...(ctx?.signal ? { signal: ctx.signal } : {}),
  });
  if (context) await prepareDevinProfileLaunch(context);
  return { location, context };
}
