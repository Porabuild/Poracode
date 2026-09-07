import { useEffect, useRef } from "react";
import type { AgentStatus, Thread } from "@/shared/contracts";
import { agentStatusForPresentation } from "@/shared/agentSelection";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { getComposerControls } from "@/renderer/components/providers/providerComposer";
import {
  resolveComposerControlIcon,
  type ComposerControl,
} from "@/renderer/components/thread/ThreadComposer";
import { buildControls } from "@/renderer/components/thread/buildModelPickerControls";
import { formatEffortLabel } from "@/renderer/components/thread/threadDraftViewHelpers";

type PresentedAgentStatus = NonNullable<ReturnType<typeof agentStatusForPresentation>>;

/**
 * Read-only active-thread parameters pinned to the right edge of the compact
 * composer pill. Model and effort stay readable as text; the provider and
 * boolean/state controls remain compact icons. Inert (pointer-events: none) —
 * tapping anywhere still expands the composer, where the real controls live.
 * Hidden by CSS while the composer is expanded or has typed content (the
 * pinned send button owns that corner).
 */
export function ComposerCompactSummary(props: {
  readonly thread: Thread;
  readonly agentStatus: AgentStatus | undefined;
}) {
  const { thread, agentStatus } = props;
  const presentationMode =
    thread.presentationMode ?? agentStatus?.capabilities.presentationMode ?? "terminal";
  const effectiveAgentStatus = agentStatus
    ? agentStatusForPresentation(agentStatus, presentationMode, thread.sessionRef)
    : undefined;
  const presentationCapabilities = effectiveAgentStatus?.capabilities;
  const modelLabel =
    presentationCapabilities?.models.find((model) => model.id === thread.config.model)?.label ??
    thread.config.model;
  const effortLabel = thread.config.effort ? formatEffortLabel(thread.config.effort) : undefined;
  let controls: ComposerControl[] = [];
  if (effectiveAgentStatus) {
    if (presentationMode === "gui") {
      controls = buildControls(thread, effectiveAgentStatus, undefined, () => undefined);
    } else {
      const buildProviderControls = getComposerControls(thread.agentKind);
      if (buildProviderControls) {
        controls = buildProviderControls({
          capabilities: effectiveAgentStatus.capabilities,
          config: thread.config,
          isDisabled: true,
          onConfigChange: () => undefined,
          presentationMode,
        });
      }
    }
  }

  if (!effectiveAgentStatus) return null;
  return (
    <ComposerSummaryBody
      thread={thread}
      agentStatus={effectiveAgentStatus}
      modelLabel={modelLabel}
      effortLabel={effortLabel}
      controls={controls}
    />
  );
}

// Owns the width-publishing observer behind a committed component boundary:
// the parent gates this on the async agent status, so the summary node mounts
// together with its content and a mount-only effect never misses it. The
// observer itself keeps the published width fresh as the content resizes.
function ComposerSummaryBody(props: {
  readonly thread: Thread;
  readonly agentStatus: PresentedAgentStatus;
  readonly modelLabel: string;
  readonly effortLabel: string | undefined;
  readonly controls: readonly ComposerControl[];
}) {
  const { thread, agentStatus } = props;
  const ref = useRef<HTMLDivElement | null>(null);

  // Publish the rendered width on the bubble so the compact input can reserve
  // right padding for it (the placeholder would otherwise run underneath).
  useEffect(() => {
    const node = ref.current;
    const bubble = node?.parentElement?.closest(".m-compose-bubble");
    if (!node || !(bubble instanceof HTMLElement)) return;
    const syncWidth = () => {
      bubble.style.setProperty("--m-compose-summary-width", `${node.offsetWidth}px`);
    };
    syncWidth();
    const observer = new ResizeObserver(syncWidth);
    observer.observe(node);
    return () => {
      observer.disconnect();
      bubble.style.removeProperty("--m-compose-summary-width");
    };
  }, []);

  const fastControl = props.controls.find(
    (control) => control.kind === "toggle" && control.iconKind === "fast" && control.isSelected,
  );
  const fastEnabled = fastControl?.kind === "toggle" && fastControl.isSelected;
  const modeControl = props.controls.find(
    (control) => "iconKind" in control && control.iconKind === "mode",
  );
  const permissionControl = props.controls.find(
    (control) => "iconKind" in control && control.iconKind === "permission",
  );

  return (
    <div ref={ref} className="m-compose-summary" aria-hidden="true">
      <ProviderIcon
        kind={thread.agentKind}
        tone="active"
        fallbackLabel={agentStatus.label}
        className="size-3.5 shrink-0"
        {...(agentStatus.icon ? { icon: agentStatus.icon } : {})}
      />
      <span className="m-compose-summary__model">{props.modelLabel}</span>
      {props.effortLabel ? (
        <span className="m-compose-summary__effort">{props.effortLabel}</span>
      ) : null}
      {fastEnabled ? (
        <span className="m-compose-summary__item m-compose-summary__item--fast">
          {resolveComposerControlIcon(fastControl)}
        </span>
      ) : null}
      {modeControl ? (
        <span className="m-compose-summary__item">{resolveComposerControlIcon(modeControl)}</span>
      ) : null}
      {permissionControl ? (
        <span className="m-compose-summary__item">
          {resolveComposerControlIcon(permissionControl)}
        </span>
      ) : null}
    </div>
  );
}
