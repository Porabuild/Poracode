import type { CSSProperties, ReactNode } from "react";
import {
  ACP_GENERIC_KIND_PREFIX,
  baseAgentKind,
  isClaudeProfileKind,
  isHomeProfileKind,
} from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import type { StatusTone } from "./statusTone";
import { getProviderManifest } from "./providerManifest";
import { syncMaskScanPhase } from "./syncMaskScanPhase";
import { lookupProviderRegistration } from "./providerRegistry";

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
      className="poracode-provider-icon__done-check text-success"
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
      className={`poracode-provider-icon poracode-provider-icon--external poracode-provider-icon--${props.tone}${props.className ? ` ${props.className}` : ""}`}
    >
      <span
        className={`poracode-provider-icon__mask${props.tone === "done" ? " opacity-40" : ""}`}
        style={style}
      />
      {props.tone === "working" ? (
        <span
          ref={syncMaskScanPhase}
          className="poracode-provider-icon__mask poracode-provider-icon__mask-scan"
          style={style}
        />
      ) : null}
      {props.tone === "done" ? <DoneCheckOverlay /> : null}
    </span>
  );
}

function fallbackInitial(label: string | undefined): string {
  const raw = label?.startsWith(ACP_GENERIC_KIND_PREFIX)
    ? label.slice(ACP_GENERIC_KIND_PREFIX.length).trim()
    : (label?.trim() ?? "");
  return (raw.match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase();
}

function profileBadgeLabel(kind: string, fallbackLabel: string | undefined): string {
  const profileId = kind.slice(kind.indexOf(":") + 1);
  const baseKind = baseAgentKind(kind);
  const label = fallbackLabel?.trim();
  if (!label) return profileId;
  if (label === kind || label.toLowerCase().startsWith(`${baseKind.toLowerCase()}:`)) {
    return profileId;
  }
  const manifestLabel = getProviderManifest(baseKind)?.label;
  const providerLabels = [...(manifestLabel ? [i18n._(manifestLabel)] : []), baseKind];
  for (const providerLabel of providerLabels) {
    if (label.toLowerCase().startsWith(`${providerLabel.toLowerCase()} `)) {
      return label.slice(providerLabel.length).trim() || profileId;
    }
  }
  return label;
}

function GenericProviderIcon(props: { label?: string; tone: StatusTone; className?: string }) {
  return (
    <span
      className={`poracode-provider-icon poracode-provider-icon--${props.tone}${props.className ? ` ${props.className}` : ""}`}
    >
      <span
        className={`poracode-provider-icon__generic${props.tone === "done" ? " opacity-40" : ""}`}
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
  const Icon = lookupProviderRegistration(ICON_REGISTRY, props.kind);
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
  if (isClaudeProfileKind(props.kind) || isHomeProfileKind(props.kind)) {
    return (
      <span className={`relative inline-flex ${props.className ?? ""}`}>
        {rendered}
        <span className="absolute -bottom-0.5 -right-0.5 flex size-2.5 items-center justify-center rounded-full border border-background bg-surface text-[6px] font-semibold leading-none text-foreground">
          {fallbackInitial(profileBadgeLabel(props.kind, props.fallbackLabel))}
        </span>
      </span>
    );
  }
  return rendered;
}
