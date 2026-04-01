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

// --- Title generation defaults registry ---

export interface TitleGenDefaults {
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
