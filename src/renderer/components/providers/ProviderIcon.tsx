import type { ReactNode } from "react";
import type { StatusTone } from "./statusTone";

// --- Icon registry ---

type IconComponent = (props: { tone: StatusTone; className?: string }) => ReactNode;

const ICON_REGISTRY = new Map<string, IconComponent>();

export function registerProviderIcon(kind: string, icon: IconComponent) {
  ICON_REGISTRY.set(kind, icon);
}

export function ProviderIcon(props: { kind: string; tone?: StatusTone; className?: string }) {
  const Icon = ICON_REGISTRY.get(props.kind);
  if (!Icon) return null;
  return (
    <Icon
      tone={props.tone ?? "inactive"}
      {...(props.className ? { className: props.className } : {})}
    />
  );
}

// --- Composer controls registry ---

import type { ComposerControl } from "../thread/ThreadComposer";
import type { AgentCapability, ThreadConfig } from "../../../shared/contracts";

export interface ComposerControlsInput {
  capabilities: AgentCapability;
  config: ThreadConfig;
  isDisabled: boolean;
  onConfigChange: (patch: Partial<ThreadConfig>) => void;
}

type ComposerControlsFactory = (input: ComposerControlsInput) => ComposerControl[];

const COMPOSER_CONTROLS_REGISTRY = new Map<string, ComposerControlsFactory>();

export function registerComposerControls(kind: string, factory: ComposerControlsFactory) {
  COMPOSER_CONTROLS_REGISTRY.set(kind, factory);
}

export function getComposerControls(kind: string): ComposerControlsFactory | undefined {
  return COMPOSER_CONTROLS_REGISTRY.get(kind);
}

// --- Commit generation defaults registry ---

export interface CommitGenDefaults {
  label?: string;
  hint?: string;
  model: string;
  effort: string;
}

const COMMIT_GEN_REGISTRY = new Map<string, CommitGenDefaults>();

export function registerCommitGenDefaults(kind: string, defaults: CommitGenDefaults) {
  COMMIT_GEN_REGISTRY.set(kind, defaults);
}

export function getCommitGenDefaults(kind: string): CommitGenDefaults | undefined {
  return COMMIT_GEN_REGISTRY.get(kind);
}

export function getCommitGenDefaultsHint(): string | undefined {
  const entries = [...COMMIT_GEN_REGISTRY.values()]
    .flatMap((defaults) =>
      defaults.hint && defaults.label ? [`${defaults.label} -> ${defaults.hint}`] : [],
    )
    .sort()
    .join(", ");

  return entries ? `Defaults: ${entries}` : undefined;
}

// --- Title generation defaults registry ---

export interface TitleGenDefaults {
  label?: string;
  hint?: string;
  model: string;
  effort: string;
}

const TITLE_GEN_REGISTRY = new Map<string, TitleGenDefaults>();

export function registerTitleGenDefaults(kind: string, defaults: TitleGenDefaults) {
  TITLE_GEN_REGISTRY.set(kind, defaults);
}

export function getTitleGenDefaults(kind: string): TitleGenDefaults | undefined {
  return TITLE_GEN_REGISTRY.get(kind);
}

export function getTitleGenDefaultsHint(): string | undefined {
  const entries = [...TITLE_GEN_REGISTRY.values()]
    .flatMap((defaults) =>
      defaults.hint && defaults.label ? [`${defaults.label} -> ${defaults.hint}`] : [],
    )
    .sort()
    .join(", ");

  return entries ? `Defaults: ${entries}` : undefined;
}

// --- Conflict resolver defaults registry ---

export interface ConflictResolverDefaults {
  label?: string;
  hint?: string;
  model: string;
  effort: string;
}

const CONFLICT_RESOLVER_REGISTRY = new Map<string, ConflictResolverDefaults>();

export function registerConflictResolverDefaults(kind: string, defaults: ConflictResolverDefaults) {
  CONFLICT_RESOLVER_REGISTRY.set(kind, defaults);
}

export function getConflictResolverDefaults(kind: string): ConflictResolverDefaults | undefined {
  return CONFLICT_RESOLVER_REGISTRY.get(kind);
}

export function getConflictResolverDefaultsHint(): string | undefined {
  const entries = [...CONFLICT_RESOLVER_REGISTRY.values()]
    .flatMap((defaults) =>
      defaults.hint && defaults.label ? [`${defaults.label} -> ${defaults.hint}`] : [],
    )
    .sort()
    .join(", ");

  return entries ? `Defaults: ${entries}` : undefined;
}

export function resolveConflictResolverConfig(
  agent:
    | {
        kind: string;
        capabilities: {
          models: { id: string }[];
          efforts: string[];
          modelEfforts: Record<string, string[]>;
          defaultEffort?: string | undefined;
        };
      }
    | undefined,
  model: string,
  effort: string,
): { model: string; effort: string; availableEfforts: string[] } {
  if (!agent) return { model: "", effort: "", availableEfforts: [] };

  const defaults = getConflictResolverDefaults(agent.kind);
  const nextModel = agent.capabilities.models.some((m) => m.id === model)
    ? model
    : defaults?.model && agent.capabilities.models.some((m) => m.id === defaults.model)
      ? defaults.model
      : (agent.capabilities.models[0]?.id ?? "");

  const modelEfforts = agent.capabilities.modelEfforts[nextModel];
  const availableEfforts = modelEfforts?.length ? modelEfforts : agent.capabilities.efforts;
  if (availableEfforts.length === 0) return { model: nextModel, effort: "", availableEfforts };

  if (availableEfforts.includes(effort)) return { model: nextModel, effort, availableEfforts };

  const fallback = [defaults?.effort, agent.capabilities.defaultEffort, availableEfforts[0]].find(
    (c) => c && availableEfforts.includes(c!),
  );
  return { model: nextModel, effort: fallback ?? "", availableEfforts };
}
