import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import type { ComposerSelectionOrigin } from "@/renderer/components/thread/composerSelectionMutation";
import type { MessageDescriptor } from "@lingui/core";
import { isAgentProfileKind } from "@/shared/contracts";
import type {
  AgentCapability,
  AgentStatus,
  NpmPackageVersionQuery,
  Project,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { lookupProviderRegistration } from "./providerRegistry";

export interface ComposerControlsInput {
  capabilities: AgentCapability;
  config: ThreadConfig;
  isDisabled: boolean;
  /**
   * One resolved config edit. `origin` is the optional ephemeral
   * selection-event metadata (see `ComposerSelectionOrigin`): a patch the
   * shared relation helper resolved carries `family-resolved` so the
   * composition point can route the event, while an absent origin classifies
   * from the patch's touched keys alone. Purely in-process — never persisted.
   */
  onConfigChange: (patch: Partial<ThreadConfig>, origin?: ComposerSelectionOrigin) => void;
  /** Active presentation mode for this thread, when the caller knows it. */
  presentationMode?: ThreadPresentationMode;
}

type ComposerControlsFactory = (input: ComposerControlsInput) => ComposerControl[];

/**
 * Providers can register controls shared by both presentation surfaces or
 * controls specific to the GUI/terminal implementation. Shared controls run
 * first; an unknown presentation mode intentionally runs only that shared set.
 */
export type ComposerControlsRegistration =
  | ComposerControlsFactory
  | {
      shared?: ComposerControlsFactory;
      gui?: ComposerControlsFactory;
      terminal?: ComposerControlsFactory;
    };

const composerControlsRegistry = new Map<string, ComposerControlsRegistration>();

export function registerComposerControls(kind: string, registration: ComposerControlsRegistration) {
  composerControlsRegistry.set(kind, registration);
}

export function getComposerControls(kind: string): ComposerControlsFactory | undefined {
  const registration = lookupProviderRegistration(composerControlsRegistry, kind);
  if (!registration) return undefined;
  if (typeof registration === "function") return registration;
  return (input) => {
    const out: ComposerControl[] = [];
    if (registration.shared) out.push(...registration.shared(input));
    if (input.presentationMode === "gui" && registration.gui) {
      out.push(...registration.gui(input));
    } else if (input.presentationMode === "terminal" && registration.terminal) {
      out.push(...registration.terminal(input));
    }
    return out;
  };
}

export interface ConfigNormalizerInput {
  capabilities: AgentCapability;
  config: ThreadConfig;
  presentationMode: ThreadPresentationMode;
}

type ConfigNormalizer = (input: ConfigNormalizerInput) => Partial<ThreadConfig>;

const configNormalizerRegistry = new Map<string, ConfigNormalizer>();

export function registerConfigNormalizer(kind: string, normalizer: ConfigNormalizer) {
  configNormalizerRegistry.set(kind, normalizer);
}

export function getConfigNormalizer(kind: string): ConfigNormalizer | undefined {
  return lookupProviderRegistration(configNormalizerRegistry, kind);
}

export interface ComposerRuntimeUpdate {
  label: string;
  installed: boolean;
  installedVersion?: string;
  npmPackage?: NpmPackageVersionQuery;
  command?: string;
  /**
   * Shell command for a probed target version. Used when a floating range
   * would leave an already-satisfying install unchanged.
   */
  commandForVersion?: (version: string) => string | undefined;
  /** Reserve a shared installation until its command and status refresh finish. */
  reservePackage?: (hostKey: string | undefined) => (() => void) | undefined;
}

type ComposerRuntimeUpdateResolver = (input: {
  agentStatus: AgentStatus;
  project: Project;
}) => ComposerRuntimeUpdate | undefined;

const composerRuntimeUpdateRegistry = new Map<string, ComposerRuntimeUpdateResolver>();

export function registerComposerRuntimeUpdate(
  kind: string,
  resolver: ComposerRuntimeUpdateResolver,
) {
  composerRuntimeUpdateRegistry.set(kind, resolver);
}

export function getComposerRuntimeUpdate(kind: string): ComposerRuntimeUpdateResolver | undefined {
  return lookupProviderRegistration(composerRuntimeUpdateRegistry, kind);
}

export type CombinedRuntimeUpdateChannel =
  | { kind: "agent-binary" }
  | { kind: "acp-registry"; agentId: string }
  | {
      kind: "npm-package";
      query: NpmPackageVersionQuery;
      /** Omitted for installations managed outside the app's global update flow. */
      commandForVersion?: (project: Project, version: string) => string | undefined;
      reservePackage?: ComposerRuntimeUpdate["reservePackage"];
    };

export interface CombinedRuntimeUpdate {
  id: string;
  label: MessageDescriptor;
  installed: boolean;
  installedVersion?: string;
  channel: CombinedRuntimeUpdateChannel;
}

type CombinedRuntimeUpdatesResolver = (input: {
  agentStatus: AgentStatus;
}) => readonly CombinedRuntimeUpdate[];

const combinedRuntimeUpdatesRegistry = new Map<string, CombinedRuntimeUpdatesResolver>();
const providerListRuntimeUpdatesRegistry = new Map<string, CombinedRuntimeUpdatesResolver>();

/**
 * Registers independently versioned runtimes that one provider exposes as a
 * single update action. Shared UI probes and updates the declared channels;
 * provider-specific binary knowledge stays in the provider plugin.
 */
export function registerCombinedRuntimeUpdates(
  kind: string,
  resolver: CombinedRuntimeUpdatesResolver,
  /** The provider list can show all installed runtimes, regardless of the active chat runtime. */
  surface?: "provider-list",
) {
  const registry =
    surface === "provider-list"
      ? providerListRuntimeUpdatesRegistry
      : combinedRuntimeUpdatesRegistry;
  registry.set(kind, resolver);
}

export function getCombinedRuntimeUpdates(
  kind: string,
  surface?: "provider-list",
): CombinedRuntimeUpdatesResolver | undefined {
  if (surface === "provider-list") {
    const resolver = lookupProviderRegistration(providerListRuntimeUpdatesRegistry, kind);
    if (resolver) return resolver;
    // Profiles opt in through a provider-list registration for their own runtime.
    if (isAgentProfileKind(kind)) return undefined;
  }
  return lookupProviderRegistration(combinedRuntimeUpdatesRegistry, kind);
}
