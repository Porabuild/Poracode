import { Lock, LockOpen, Pencil, PencilOff, Square, UsersRound, Zap } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { useShallow } from "zustand/shallow";
import { capabilitiesForPresentation } from "@/shared/agentSelection";
import { distinctSubProviderLabel } from "@/renderer/components/common/ProviderModelMenu/parts/deriveSubProvider";
import type { Thread, ToolCallPayload } from "@/shared/contracts";
import type { CrewMemberSelection, ThreadCrewBinding } from "@/shared/crew";
import {
  isLeadEdited,
  isRoleEdited,
  savedCrewFor,
  crewModelLabelOf,
  leadSelectionOf,
} from "@/renderer/components/crew/crewComposerModel";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { getRuntimeItemPayload } from "@/renderer/state/slices/runtimeEventSlice";
import { getRuntimeItemStoreSelector } from "./ChatPane/chatPaneSelectors";
import { readSubAgentType } from "./ChatPane/parts/items/toolDisplay";
import { AnimatedFraction } from "@/renderer/components/common/AnimatedNumber";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThreadComposerControlStore } from "@/renderer/state/threadComposerControlStore";
import { formatEffortLabel } from "@/renderer/components/thread/threadDraftViewHelpers";
import { ThreadDocksPlacementToggle } from "./ThreadDocksPlacementToggle";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import {
  ThreadDockHeader,
  ThreadDockIconButton,
  ThreadDockList,
  ThreadDockSection,
} from "./ThreadDockUI";
import type { ReactNode } from "react";
import { CrewRolePill } from "@/renderer/components/crew/CrewRolePill";

export function CrewDockSection(props: {
  threadId: string;
  thread: Thread;
  binding: ThreadCrewBinding;
  runIds: readonly string[];
  renderRun: (id: string, taskOnly: boolean) => ReactNode;
  showPlacementToggle: boolean;
}) {
  const { t } = useLingui();
  const statuses = useAgentStatusesStore(
    useShallow((state) => [...state.agentStatuses, ...state.wslAgentStatuses]),
  );
  const crews = useSharedSettings((state) => state.crews);
  const saved = savedCrewFor(props.binding, crews);
  const lead = leadSelectionOf(props.thread.agentKind, props.thread.config);
  const roleForRun = useAppStore(
    useShallow((state) =>
      Object.fromEntries(
        props.runIds.map((id) => {
          const item = getRuntimeItemStoreSelector(props.threadId, id)(state);
          const payload = item
            ? getRuntimeItemPayload<ToolCallPayload>(item, "tool_call")
            : undefined;
          const args =
            payload?.args && typeof payload.args === "object" && !Array.isArray(payload.args)
              ? (payload.args as Record<string, unknown>)
              : undefined;
          return [id, payload?.subAgentType ?? readSubAgentType(args)];
        }),
      ),
    ),
  );
  const roleKey = (label: string | undefined) => label?.trim().toLowerCase();
  const roleGroups = props.binding.roles.map((role) => ({
    role,
    ids: props.runIds.filter((id) => roleKey(roleForRun[id]) === roleKey(role.label)),
  }));
  const matchedIds = new Set(roleGroups.flatMap((group) => group.ids));
  const otherIds = props.runIds.filter((id) => !matchedIds.has(id));
  const completedCount = useAppStore(
    useShallow(
      (state) =>
        props.runIds.filter((id) => {
          const item = getRuntimeItemStoreSelector(props.threadId, id)(state);
          const payload = item
            ? getRuntimeItemPayload<ToolCallPayload>(item, "tool_call")
            : undefined;
          return item?.state === "completed" && payload?.status !== "running";
        }).length,
    ),
  );
  const requestOpenControl = useThreadComposerControlStore((state) => state.requestOpenControl);
  const leadEdited = Boolean(saved && isLeadEdited(lead, saved));
  const runningIds = useAppStore(
    useShallow((state) =>
      props.runIds.filter((id) => {
        const item = getRuntimeItemStoreSelector(props.threadId, id)(state);
        const payload = item
          ? getRuntimeItemPayload<ToolCallPayload>(item, "tool_call")
          : undefined;
        return item?.state !== "completed" || payload?.status === "running";
      }),
    ),
  );
  const canStopRuns = !isRemoteSession();

  return (
    <ThreadDockSection placement="right" collapsed={false}>
      <ThreadDockHeader
        icon={UsersRound}
        title={props.binding.name ?? t`Crew`}
        countLabel={
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            {props.binding.policy === "crew-only" ? (
              <Lock className="size-3" />
            ) : (
              <LockOpen className="size-3" />
            )}
            <span>{props.binding.policy === "crew-only" ? t`Crew only` : t`Crew first`}</span>
            {props.runIds.length > 0 ? (
              <>
                <span aria-hidden="true">·</span>
                <AnimatedFraction value={completedCount} total={props.runIds.length} />
              </>
            ) : null}
          </span>
        }
        actions={
          <>
            {props.showPlacementToggle ? <ThreadDocksPlacementToggle placement="right" /> : null}
            <ThreadDockIconButton
              label={t`Edit crew`}
              tooltip={t`Edit crew`}
              onPress={() => requestOpenControl(props.threadId, "crew")}
            >
              <Pencil className="size-3.5" />
            </ThreadDockIconButton>
          </>
        }
      />
      <ThreadDockList placement="right" collapsed={false} gap="1">
        <CrewMemberInfo
          label={t`Lead`}
          selection={lead}
          statuses={statuses}
          changed={leadEdited}
          fast={lead.fast === true}
          pill={<CrewRolePill isLead leadLabel={t`Lead`} />}
        />
        {roleGroups.map(({ role, ids }) => (
          <div key={role.id}>
            <CrewMemberInfo
              label={role.label}
              selection={role.selection}
              statuses={statuses}
              changed={Boolean(saved && isRoleEdited(role, saved))}
              fast={role.selection.fast === true}
              {...(role.noEdits !== undefined ? { noEdits: role.noEdits } : {})}
              stop={
                canStopRuns && ids.some((id) => runningIds.includes(id))
                  ? () =>
                      runningIds
                        .filter((id) => ids.includes(id))
                        .forEach((id) => {
                          const runId = id.startsWith("sub:") ? id.slice(4) : id;
                          void readBridge().cancelCrossagentRun({
                            threadId: props.threadId,
                            runId,
                          });
                        })
                  : undefined
              }
              stopLabel={t`Stop ${role.label} runs`}
              pill={<CrewRolePill role={role} isLead={false} leadLabel={t`Lead`} />}
            />
            {ids.length > 0 ? (
              <div data-crew-role-runs={role.id} className="ml-[22px] min-w-0">
                {ids.map((id) => props.renderRun(id, true))}
              </div>
            ) : null}
          </div>
        ))}
        {otherIds.length > 0 ? (
          <div>
            <div className="px-2 pb-0.5 pt-2 text-[11px] font-medium text-muted">
              {t`Other agents`}
            </div>
            <div data-crew-role-runs="other" className="ml-[22px] min-w-0">
              {otherIds.map((id) => props.renderRun(id, false))}
            </div>
          </div>
        ) : null}
      </ThreadDockList>
    </ThreadDockSection>
  );
}

function CrewMemberInfo(props: {
  label: string;
  selection: CrewMemberSelection;
  statuses: ReturnType<typeof useAgentStatusesStore.getState>["agentStatuses"];
  changed: boolean;
  fast?: boolean;
  noEdits?: boolean;
  pill?: ReactNode;
  stop?: (() => void) | undefined;
  stopLabel?: string;
}) {
  const { t } = useLingui();
  const status = props.statuses.find((item) => item.kind === props.selection.agentKind);
  const model = crewModelLabelOf(props.statuses, props.selection);
  const provider = status?.label ?? props.selection.agentKind;
  const subProvider = status
    ? distinctSubProviderLabel(
        props.selection.model,
        capabilitiesForPresentation(status.capabilities, "gui"),
        provider,
      )
    : undefined;
  const effort = props.selection.effort;
  const reasoning = effort ? formatEffortLabel(effort) : undefined;

  return (
    <div
      data-crew-member-row={props.label}
      className="group grid min-h-9 grid-cols-[8px_14px_minmax(0,1fr)_auto] items-center gap-x-2 px-2 py-0.5"
    >
      <span className="col-start-1 row-span-2 row-start-1 flex size-2 items-center justify-center">
        {props.changed ? (
          <span
            aria-label={t`Changed for this thread`}
            title={t`Changed for this thread`}
            className="size-1.5 rounded-full bg-accent"
          />
        ) : null}
      </span>
      <ProviderIcon
        kind={props.selection.agentKind}
        {...(status?.icon ? { icon: status.icon } : {})}
        fallbackLabel={provider}
        className="col-start-2 row-span-2 row-start-1 size-3.5"
      />
      <span
        data-crew-member-line="text"
        className="col-start-3 row-start-1 flex min-w-0 items-center gap-1 truncate text-xs leading-5"
      >
        <span className="min-w-0 truncate font-medium">{model}</span>
        {props.fast ? <Zap className="size-3 shrink-0 fill-current" /> : null}
        {props.noEdits ? (
          <PencilOff
            aria-label={t`Told not to edit files. Not enforced.`}
            className="size-3 shrink-0 text-muted"
            role="img"
          />
        ) : null}
      </span>
      <span className="col-start-4 row-span-2 flex items-center justify-end gap-0.5">
        {props.stop ? (
          <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <ThreadDockIconButton
              danger
              compact
              label={props.stopLabel ?? ""}
              tooltip={props.stopLabel ?? ""}
              onPress={props.stop}
            >
              <Square className="size-3" />
            </ThreadDockIconButton>
          </span>
        ) : null}
        {props.pill}
      </span>
      <span
        data-crew-member-line="meta"
        className="col-start-3 row-start-2 truncate text-[11px] leading-tight text-muted"
      >
        {provider}
        {subProvider ? <span> · {subProvider}</span> : null}
        {reasoning ? <span> · {reasoning}</span> : null}
      </span>
    </div>
  );
}
