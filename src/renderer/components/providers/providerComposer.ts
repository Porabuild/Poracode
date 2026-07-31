import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
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
  onConfigChange: (patch: Partial<ThreadConfig>) => void;
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
