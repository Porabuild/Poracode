import type { AgentStatus, Thread } from "@/shared/contracts";
import { agentStatusForPresentation } from "@/shared/agentSelection";
import { canonicalProviderModelId } from "@/renderer/components/providers/modelConfig";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { PoracodeGlyph } from "@/renderer/components/common/PoracodeGlyph";
import { ChevronDown, Lock, SlidersHorizontal } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { threadCrewBinding } from "@/shared/crew";
import { getComposerControls } from "@/renderer/components/providers/providerComposer";
import {
  resolveComposerControlIcon,
  type ComposerControl,
} from "@/renderer/components/thread/ThreadComposer";
import { buildControls } from "@/renderer/components/thread/buildModelPickerControls";
import { formatEffortLabel } from "@/renderer/components/thread/threadDraftViewHelpers";
import { modelFamilyMemberLabel } from "@/renderer/components/common/ProviderModelMenu/parts/modelFamilyDisplay";
import { modelFamilyDisplayConfig } from "@/shared/modelFamilySelection";

type PresentedAgentStatus = NonNullable<ReturnType<typeof agentStatusForPresentation>>;

/**
 * Read-only active-thread parameters shown as the compact pill's own label.
 * Model and effort stay readable as text; the provider and boolean/state
 * controls remain compact icons. Inert (pointer-events: none) — tapping
 * anywhere still expands the composer, where the real controls live. Hidden
 * by CSS while the composer is expanded or has typed content (the prompt and
 * the pinned send button own the pill then).
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
  const modelId = canonicalProviderModelId(
    thread.agentKind,
    thread.config.model,
    presentationCapabilities?.models ?? [],
  );
  // Inside a family relation the summary reads the UID-derived view: the
  // compact family + selector label and the encoded Effort/Fast coordinates,
  // not the giant native pair label or the saved (possibly inert) carriers.
  const familyConfig = presentationCapabilities
    ? modelFamilyDisplayConfig(presentationCapabilities, thread.config)
    : undefined;
  const modelLabel =
    modelFamilyMemberLabel(presentationCapabilities, modelId) ??
    presentationCapabilities?.models.find((model) => model.id === modelId)?.label ??
    thread.config.model;
  const crewBinding = threadCrewBinding(thread.config);
  const displayEffort = familyConfig?.effort ?? thread.config.effort;
  const effortLabel = displayEffort ? formatEffortLabel(displayEffort) : undefined;
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
      {...(crewBinding ? { crewName: crewBinding.name ?? "" } : {})}
      {...(crewBinding ? { crewRoleCount: crewBinding.roles.length } : {})}
      {...(crewBinding ? { crewOnly: crewBinding.policy === "crew-only" } : {})}
      controls={controls}
    />
  );
}

function ComposerSummaryBody(props: {
  readonly thread: Thread;
  readonly agentStatus: PresentedAgentStatus;
  readonly modelLabel: string;
  readonly effortLabel: string | undefined;
  readonly crewName?: string;
  readonly crewRoleCount?: number;
  readonly crewOnly?: boolean;
  readonly controls: readonly ComposerControl[];
}) {
  const { t } = useLingui();
  const { thread, agentStatus } = props;

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
    <div className="m-compose-summary" aria-hidden="true">
      {props.crewName !== undefined ? (
        <>
          <PoracodeGlyph className="size-3.5 shrink-0 text-foreground" />
          <span className="m-compose-summary__model">{props.crewName || t`Crew`}</span>
          <span className="m-compose-summary__item">
            <SlidersHorizontal className="size-3" />
            {t`+${props.crewRoleCount ?? 0}`}
            {props.crewOnly ? <Lock className="size-3" /> : null}
            <ChevronDown className="size-3 text-muted" />
          </span>
        </>
      ) : (
        <>
          <ProviderIcon
            kind={thread.agentKind}
            tone="active"
            fallbackLabel={agentStatus.label}
            className="size-3.5 shrink-0"
            {...(agentStatus.icon ? { icon: agentStatus.icon } : {})}
          />
          <span className="m-compose-summary__model">{props.modelLabel}</span>
        </>
      )}
      {props.crewName === undefined && props.effortLabel ? (
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
