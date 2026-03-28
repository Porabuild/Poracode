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

// --- Model label registry ---

type ModelLabelFormatter = (modelId: string) => string;

const MODEL_LABEL_REGISTRY = new Map<string, ModelLabelFormatter>();

export function registerModelLabels(kind: string, formatter: ModelLabelFormatter) {
  MODEL_LABEL_REGISTRY.set(kind, formatter);
}

export function getModelLabel(kind: string, modelId: string): string | undefined {
  return MODEL_LABEL_REGISTRY.get(kind)?.(modelId);
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
