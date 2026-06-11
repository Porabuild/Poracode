import type { CSSProperties, ReactNode } from "react";
import { baseAgentKind } from "@/shared/contracts";
import type { StatusTone } from "./statusTone";
import {
  getUtilityTaskCandidates,
  getUtilityTaskDefaultsHint,
  resolveUtilityTaskConfig,
  type UtilityTaskCandidateAgent,
  type UtilityTaskConfigAgent,
  type UtilityTaskDefaults,
} from "./utilityTask";

export { AUTO_PROVIDER_PREFERENCE_ORDER, sortByAutoPreference } from "./utilityTask";

// --- Icon registry ---

type IconComponent = (props: { tone: StatusTone; className?: string }) => ReactNode;

const ICON_REGISTRY = new Map<string, IconComponent>();

export function registerProviderIcon(kind: string, icon: IconComponent) {
  ICON_REGISTRY.set(kind, icon);
}

function externalIconStyle(src: string): CSSProperties {
  const cssUrl = `url(${JSON.stringify(src)})`;
  return {
    WebkitMaskImage: cssUrl,
    maskImage: cssUrl,
  };
}

function DoneCheckOverlay() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="lightcode-provider-icon__done-check text-success"
    >
      <path
        d="M5 13l4 4L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExternalProviderIcon(props: { src: string; tone: StatusTone; className?: string }) {
  const style = externalIconStyle(props.src);
  return (
    <span
      className={`lightcode-provider-icon lightcode-provider-icon--external lightcode-provider-icon--${props.tone}${props.className ? ` ${props.className}` : ""}`}
    >
      <span
        className={`lightcode-provider-icon__mask${props.tone === "done" ? " opacity-40" : ""}`}
        style={style}
      />
      {props.tone === "working" ? (
        <span
          className="lightcode-provider-icon__mask lightcode-provider-icon__mask-scan"
          style={style}
        />
      ) : null}
      {props.tone === "done" ? <DoneCheckOverlay /> : null}
    </span>
  );
}

function fallbackInitial(label: string | undefined): string {
  const raw = label?.replace(/^acp-generic:/, "").trim() ?? "";
  return (raw.match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase();
}

function claudeProfileBadgeLabel(kind: string, fallbackLabel: string | undefined): string {
  const profileId = kind.slice("claude:".length);
  const label = fallbackLabel?.trim();
  if (!label) return profileId;
  if (label === kind || label.toLowerCase().startsWith("claude:")) return profileId;
  const profileLabel = label.replace(/^claude\s+/i, "").trim();
  return profileLabel || profileId;
}

/** Registry lookup that falls back to the base kind for instance-scoped kinds. */
function lookupByKind<T>(registry: Map<string, T>, kind: string): T | undefined {
  const exact = registry.get(kind);
  if (exact !== undefined) return exact;
  const baseKind = baseAgentKind(kind);
  return baseKind !== kind ? registry.get(baseKind) : undefined;
}

function GenericProviderIcon(props: { label?: string; tone: StatusTone; className?: string }) {
  return (
    <span
      className={`lightcode-provider-icon lightcode-provider-icon--${props.tone}${props.className ? ` ${props.className}` : ""}`}
    >
      <span
        className={`lightcode-provider-icon__generic${props.tone === "done" ? " opacity-40" : ""}`}
      >
        {fallbackInitial(props.label)}
      </span>
      {props.tone === "done" ? <DoneCheckOverlay /> : null}
    </span>
  );
}

export function ProviderIcon(props: {
  kind: string;
  tone?: StatusTone | undefined;
  className?: string | undefined;
  icon?: string | undefined;
  fallbackLabel?: string | undefined;
  /**
   * When true and the icon can't be resolved yet (no registered or external
   * icon), reserve a same-size empty slot instead of rendering the generic
   * letter fallback. Used while agent detection is still in flight so list
   * rows don't flash a placeholder that jumps to the real icon on resolve.
   */
  pending?: boolean | undefined;
}) {
  const Icon = lookupByKind(ICON_REGISTRY, props.kind);
  const tone = props.tone ?? "inactive";
  if (!Icon) {
    if (props.icon) {
      return (
        <ExternalProviderIcon
          src={props.icon}
          tone={tone}
          {...(props.className ? { className: props.className } : {})}
        />
      );
    }
    if (props.pending) {
      return <span aria-hidden className={props.className} />;
    }
    return (
      <GenericProviderIcon
        label={props.fallbackLabel ?? props.kind}
        tone={tone}
        {...(props.className ? { className: props.className } : {})}
      />
    );
  }
  const rendered = (
    <Icon tone={tone} {...(props.className ? { className: props.className } : {})} />
  );
  if (props.kind.startsWith("claude:")) {
    return (
      <span className={`relative inline-flex ${props.className ?? ""}`}>
        {rendered}
        <span className="absolute -bottom-0.5 -right-0.5 flex size-2.5 items-center justify-center rounded-full border border-background bg-surface text-[6px] font-semibold leading-none text-foreground">
          {fallbackInitial(claudeProfileBadgeLabel(props.kind, props.fallbackLabel))}
        </span>
      </span>
    );
  }
  return rendered;
}

// --- Provider label registry ---
//
// Each provider plugin registers its long-form display label here. Consumers
// like the first-launch discovery screen enumerate the registry to render an
// up-to-date list of supported agents — no central hardcoded list to update
// when a new provider is added.

const LABEL_REGISTRY = new Map<string, string>();

export function registerProviderLabel(kind: string, label: string) {
  LABEL_REGISTRY.set(kind, label);
}

export function getProviderLabel(kind: string): string | undefined {
  return LABEL_REGISTRY.get(kind);
}

export function getRegisteredProviders(): { kind: string; label: string }[] {
  return Array.from(LABEL_REGISTRY, ([kind, label]) => ({ kind, label }));
}

// --- Composer controls registry ---

import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import type {
  AgentCapability,
  AgentSlashCommand,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";

export interface ComposerControlsInput {
  capabilities: AgentCapability;
  config: ThreadConfig;
  isDisabled: boolean;
  onConfigChange: (patch: Partial<ThreadConfig>) => void;
  /**
   * Active presentation mode for this thread. Adapters can branch on it to
   * surface controls only available in the structured/chat path (e.g. Codex
   * plan toggle in `gui` mode where the ACP control channel exposes it).
   * Optional — built-in providers that don't care can ignore it.
   */
  presentationMode?: ThreadPresentationMode;
}

type ComposerControlsFactory = (input: ComposerControlsInput) => ComposerControl[];

/**
 * Adapters can register either a single factory (when controls don't differ
 * by surface) or a surface-keyed object that splits controls by presentation
 * mode. The dispatcher concatenates `shared` first, then the active surface's
 * factory, so a provider with both pieces gets `[...shared, ...gui]` in GUI
 * mode and `[...shared, ...terminal]` in terminal mode.
 *
 * When `presentationMode` is unknown (e.g. the "Continue in another provider"
 * dialog, which is surface-agnostic), only `shared` runs — that's the set of
 * controls a provider claims apply universally.
 */
export type ComposerControlsRegistration =
  | ComposerControlsFactory
  | {
      shared?: ComposerControlsFactory;
      gui?: ComposerControlsFactory;
      terminal?: ComposerControlsFactory;
    };

const COMPOSER_CONTROLS_REGISTRY = new Map<string, ComposerControlsRegistration>();

export function registerComposerControls(kind: string, registration: ComposerControlsRegistration) {
  COMPOSER_CONTROLS_REGISTRY.set(kind, registration);
}

export function getComposerControls(kind: string): ComposerControlsFactory | undefined {
  const registration = lookupByKind(COMPOSER_CONTROLS_REGISTRY, kind);
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

// --- GUI slash-command registry ---
//
// Some providers expose a GUI-only slash-command palette (open the model
// picker, toggle Fast, switch plan/agent). Adapters register a builder so
// the composer can offer these autocomplete entries and route the matching
// `/command` typed in the input to a local action without dispatching to
// the agent process.

export interface GuiSlashCommandContext {
  hasEffort: boolean;
  supportsFast: boolean;
}

export type LocalSlashCommandAction =
  | { kind: "set-mode"; mode: "agent" | "plan" }
  | { kind: "open-control"; target: "model" | "effort" }
  | { kind: "toggle-fast" };

export interface GuiSlashCommandRegistration {
  buildCommands: (context: GuiSlashCommandContext) => readonly AgentSlashCommand[];
  resolveLocalAction: (typedCommand: string) => LocalSlashCommandAction | null;
}

const GUI_SLASH_COMMAND_REGISTRY = new Map<string, GuiSlashCommandRegistration>();

export function registerGuiSlashCommands(kind: string, registration: GuiSlashCommandRegistration) {
  GUI_SLASH_COMMAND_REGISTRY.set(kind, registration);
}

export function getGuiSlashCommands(kind: string): GuiSlashCommandRegistration | undefined {
  return lookupByKind(GUI_SLASH_COMMAND_REGISTRY, kind);
}

// --- Config normalizer registry ---
//
// Adapters whose supported config values vary by presentation surface (e.g.
// Codex plan mode is ACP-only) register a normalizer that returns a patch
// dropping unsupported values when the active presentation mode changes.

export interface ConfigNormalizerInput {
  capabilities: AgentCapability;
  config: ThreadConfig;
  presentationMode: ThreadPresentationMode;
}

type ConfigNormalizer = (input: ConfigNormalizerInput) => Partial<ThreadConfig>;

const CONFIG_NORMALIZER_REGISTRY = new Map<string, ConfigNormalizer>();

export function registerConfigNormalizer(kind: string, normalizer: ConfigNormalizer) {
  CONFIG_NORMALIZER_REGISTRY.set(kind, normalizer);
}

export function getConfigNormalizer(kind: string): ConfigNormalizer | undefined {
  return lookupByKind(CONFIG_NORMALIZER_REGISTRY, kind);
}

// --- Trigger word registry ---
//
// The composer can promote certain literal words into chips to hint at a
// special agent capability. Those affordances only make sense for
// providers/models that actually expose the underlying feature, so each such
// provider registers a matcher returning which trigger words apply to a given
// model. Providers that opt into nothing leave every word as plain text.

import type { TriggerWordDef } from "@/renderer/components/composer/triggerWords";

type TriggerWordMatcher = (model: string | undefined) => readonly TriggerWordDef[];

const TRIGGER_WORD_REGISTRY = new Map<string, TriggerWordMatcher>();

export function registerTriggerWords(kind: string, resolve: TriggerWordMatcher) {
  TRIGGER_WORD_REGISTRY.set(kind, resolve);
}

/** Trigger words the given provider+model opts into (empty when none apply). */
export function getTriggerWords(
  kind: string | undefined,
  model: string | undefined,
): readonly TriggerWordDef[] {
  if (!kind) return [];
  const matcher = lookupByKind(TRIGGER_WORD_REGISTRY, kind);
  return matcher ? matcher(model) : [];
}

// --- Commit generation defaults registry ---

export interface CommitGenDefaults extends UtilityTaskDefaults {}

const COMMIT_GEN_REGISTRY = new Map<string, CommitGenDefaults>();

export function registerCommitGenDefaults(kind: string, defaults: CommitGenDefaults) {
  COMMIT_GEN_REGISTRY.set(kind, defaults);
}

export function getCommitGenDefaults(kind: string): CommitGenDefaults | undefined {
  return lookupByKind(COMMIT_GEN_REGISTRY, kind);
}

export function getCommitGenDefaultsHint(): string | undefined {
  return getUtilityTaskDefaultsHint(COMMIT_GEN_REGISTRY.values());
}

// --- Title generation defaults registry ---

export interface TitleGenDefaults extends UtilityTaskDefaults {}

const TITLE_GEN_REGISTRY = new Map<string, TitleGenDefaults>();

export function registerTitleGenDefaults(kind: string, defaults: TitleGenDefaults) {
  TITLE_GEN_REGISTRY.set(kind, defaults);
}

export function getTitleGenDefaults(kind: string): TitleGenDefaults | undefined {
  return lookupByKind(TITLE_GEN_REGISTRY, kind);
}

export function getTitleGenDefaultsHint(): string | undefined {
  return getUtilityTaskDefaultsHint(TITLE_GEN_REGISTRY.values());
}

// --- Conflict resolver defaults registry ---

export interface ConflictResolverDefaults extends UtilityTaskDefaults {}

const CONFLICT_RESOLVER_REGISTRY = new Map<string, ConflictResolverDefaults>();

export function registerConflictResolverDefaults(kind: string, defaults: ConflictResolverDefaults) {
  CONFLICT_RESOLVER_REGISTRY.set(kind, defaults);
}

export function getConflictResolverDefaults(kind: string): ConflictResolverDefaults | undefined {
  return lookupByKind(CONFLICT_RESOLVER_REGISTRY, kind);
}

export function getConflictResolverDefaultsHint(): string | undefined {
  return getUtilityTaskDefaultsHint(CONFLICT_RESOLVER_REGISTRY.values());
}

type ConflictResolverAgentLike = UtilityTaskCandidateAgent;

export function getConflictResolverCandidates<T extends ConflictResolverAgentLike>(
  agentStatuses: readonly T[],
  provider: string,
): T[] {
  return getUtilityTaskCandidates(agentStatuses, provider, getConflictResolverDefaults);
}

export function resolveConflictResolverConfig(
  agent: UtilityTaskConfigAgent | undefined,
  model: string,
  effort: string,
): { model: string; effort: string; availableEfforts: string[] } {
  return resolveUtilityTaskConfig(agent, model, effort, getConflictResolverDefaults);
}
