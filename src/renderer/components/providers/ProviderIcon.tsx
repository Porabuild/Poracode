import type { CSSProperties, ReactNode } from "react";
import { ACP_GENERIC_KIND_PREFIX, baseAgentKind, isAgentProfileKind } from "@/shared/contracts";
import type { StatusTone } from "./statusTone";
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
  // Prefer a latin/digit initial, but fall back to the first grapheme of any
  // script so a profile named "Работа" or "工作" gets its own initial instead
  // of a shared "?" badge. Segmenting keeps combining marks and emoji whole.
  const latin = raw.match(/[A-Za-z0-9]/)?.[0];
  if (latin) return latin.toUpperCase();
  const [firstGrapheme] = new Intl.Segmenter().segment(raw);
  return (firstGrapheme?.segment ?? "?").toUpperCase();
}

function profileBadgeLabel(kind: string, fallbackLabel: string | undefined): string {
  const baseKind = baseAgentKind(kind);
  const profileId = kind.slice(baseKind.length + 1);
  const label = fallbackLabel?.trim();
  if (!label) return profileId;
  // An unlabelled status can arrive carrying the raw kind; the instance id
  // reads better as a badge than the provider's first letter.
  if (label === kind || label.toLowerCase().startsWith(`${baseKind.toLowerCase()}:`))
    return profileId;
  const profileLabel = label.toLowerCase().startsWith(`${baseKind.toLowerCase()} `)
    ? label.slice(baseKind.length).trim()
    : label;
  return profileLabel || profileId;
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
  // Every multi-profile provider gets the same instance badge, so the icon
  // needs no per-provider knowledge.
  if (isAgentProfileKind(props.kind)) {
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
