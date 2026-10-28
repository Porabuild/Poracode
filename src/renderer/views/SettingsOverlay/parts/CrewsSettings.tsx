import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Modal, Separator } from "@heroui/react";
import { LightballTabs } from "@/renderer/components/common/LightballTabs";
import { Copy, Lock, LockOpen, Pencil, PencilOff, Plus, Trash2, Zap } from "lucide-react";
import { Button } from "@/renderer/components/common/Button";
import { ConfirmDialog } from "@/renderer/components/common/ConfirmDialog";
import { Input } from "@/renderer/components/common/Input";
import { OptionMenu } from "@/renderer/components/common/OptionMenu";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { defaultFastEnabled } from "@/renderer/components/providers/modelConfig";
import { useCrewHelperOptions } from "@/renderer/components/crew/crewHelperOptions";
import {
  addRole,
  crewModelLabelOf,
  isLeadEdited,
  isRoleEdited,
  removeRole,
  saveAsNewCrew,
  updateRole,
  type CrewRosterModel,
} from "@/renderer/components/crew/crewComposerModel";
import { CREW_ROLE_TEMPLATE_DESCRIPTORS } from "@/renderer/components/crew/crewRoleTemplates";
import {
  CREW_TEMPLATE_DESCRIPTORS,
  crewRolesFromTemplate,
} from "@/renderer/components/crew/crewTemplates";
import { CrewMemberRow } from "@/renderer/components/crew/CrewMemberRow";
import { CrewRolePill } from "@/renderer/components/crew/CrewRolePill";
import { formatEffortLabel } from "@/renderer/components/thread/threadDraftViewHelpers";
import { ThreadDockIconButton } from "@/renderer/components/thread/ThreadDockUI";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { buildProviderModelMenuProviders } from "@/renderer/components/thread/buildModelPickerControls";
import { capabilitiesForPresentation, modelSelectionFor } from "@/shared/agentSelection";
import { getSettingsInstalledAgents } from "@/shared/agentStatus";
import {
  CREW_BINDING_VERSION,
  crewBindingFromSavedCrew,
  canLeadCrew,
  MAX_CREW_ROLES,
  type CrewMemberSelection,
  type SavedCrew,
  type ThreadCrewBinding,
} from "@/shared/crew";
import { SettingsPage } from "./SettingsForm";

export function CrewsSettings() {
  const { t } = useLingui();
  const crews = useSharedSettings((state) => state.crews);
  const upsertCrew = useSharedSettings((state) => state.upsertCrew);
  const deleteCrew = useSharedSettings((state) => state.deleteCrew);
  const statuses = useAgentStatusesStore((state) => state.agentStatuses);
  const wslStatuses = useAgentStatusesStore((state) => state.wslAgentStatuses);
  const providerOrder = useSharedSettings((state) => state.providerOrder);
  const helperOptions = useCrewHelperOptions();
  const [editorCrewId, setEditorCrewId] = useState<string | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<SavedCrew | undefined>();
  const installed = getSettingsInstalledAgents(statuses, wslStatuses).sort((left, right) => {
    const leftIndex = providerOrder.indexOf(left.kind);
    const rightIndex = providerOrder.indexOf(right.kind);
    return (
      (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
      (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
    );
  });
  const roleTemplates = CREW_ROLE_TEMPLATE_DESCRIPTORS.map(({ brief, label, ...template }) => ({
    ...template,
    label: t(label),
    ...(brief ? { brief: t(brief) } : {}),
  }));
  const leadProviders = buildProviderModelMenuProviders(installed, {
    presentationMode: "gui",
    filterAgent: (agent) =>
      canLeadCrew(capabilitiesForPresentation(agent.capabilities, "gui"), "gui"),
  });
  const editingCrew = crews.find((crew) => crew.id === editorCrewId);
  const templateOptions = CREW_TEMPLATE_DESCRIPTORS.map((template) => ({
    id: template.id,
    label: t(template.name),
    hint: t(template.description),
  }));

  function defaultLeadSelection(): SavedCrew["lead"] | undefined {
    const provider = leadProviders[0];
    const model = provider?.capabilities.models[0];
    if (!provider || !model) return undefined;
    const selected = modelSelectionFor(provider.capabilities, model.id);
    return {
      agentKind: provider.kind,
      model: model.id,
      ...(selected.reasoning.default ? { effort: selected.reasoning.default } : {}),
      fast: defaultFastEnabled(provider.kind),
    };
  }

  function createFromTemplate(templateId: string) {
    const template = CREW_TEMPLATE_DESCRIPTORS.find((entry) => entry.id === templateId);
    const defaultLead = defaultLeadSelection();
    if (!template || !defaultLead) return;
    const firstHelper = helperOptions.defaultSelectionFor(defaultLead.agentKind);
    if (!firstHelper) return;
    // Read-only roles default to another provider when one is available, so a
    // review or exploration gets a second model's view. The editor opens next
    // so the user assigns the models they want.
    const otherHelper = helperOptions.providers
      .filter((provider) => provider.kind !== firstHelper.agentKind)
      .flatMap((provider) => {
        const model = provider.capabilities.models[0];
        const selection = model ? helperOptions.selectionFor(provider.kind, model.id) : undefined;
        return selection ? [selection] : [];
      })[0];
    const roles = crewRolesFromTemplate(template, roleTemplates, (role) =>
      role.noEdits && otherHelper ? otherHelper : firstHelper,
    );
    if (roles.length === 0) return;
    const binding: ThreadCrewBinding = {
      version: CREW_BINDING_VERSION,
      policy: template.policy,
      roles,
    };
    const saved = saveAsNewCrew(t(template.name), binding, defaultLead);
    upsertCrew(saved);
    setEditorCrewId(saved.id);
  }

  function duplicate(crew: SavedCrew) {
    const suffix = " copy";
    const name = `${crew.name.slice(0, 40 - suffix.length).trimEnd()}${suffix}`;
    const copy = saveAsNewCrew(name, crewBindingFromSavedCrew(crew), crew.lead);
    upsertCrew(copy);
    setEditorCrewId(copy.id);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteCrew(deleteTarget.id);
    setDeleteTarget(undefined);
  }

  return (
    <SettingsPage
      title={t`Crews`}
      description={t`Saved crews: a lead and the helpers it hands work to. Pick one under Poracode in any model picker.`}
      actions={
        <OptionMenu
          value=""
          placeholder={t`New crew`}
          icon={<Plus className="size-4" />}
          options={templateOptions}
          buttonVariant="tertiary"
          isDisabled={
            !defaultLeadSelection() ||
            !helperOptions.defaultSelectionFor(leadProviders[0]?.kind ?? "")
          }
          onChange={(template) => createFromTemplate(template)}
        />
      }
    >
      <div id="crews.list" data-settings-anchor="crews.list">
        {crews.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--hairline-strong)] px-4 py-7 text-center">
            <p className="text-sm text-foreground">{t`No crews yet`}</p>
            <p className="mt-1 text-xs text-muted">
              {t`Create one from a template, then pick it under Poracode in the model picker.`}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
            <ul className="divide-y divide-[var(--hairline)]">
              {crews.map((crew) => (
                <li
                  key={crew.id}
                  id={`crews.${crew.id}`}
                  data-settings-anchor={`crews.${crew.id}`}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded text-left"
                    onClick={() => setEditorCrewId(crew.id)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {crew.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                        {crew.policy === "crew-only" ? (
                          <Lock className="size-3" aria-hidden="true" />
                        ) : (
                          <LockOpen className="size-3" aria-hidden="true" />
                        )}
                        {crew.policy === "crew-only" ? t`Crew only` : t`Crew first`}
                      </span>
                    </span>
                    <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      {[
                        { key: "lead", selection: crew.lead, role: undefined },
                        ...crew.roles.map((role) => ({
                          key: role.id,
                          selection: role.selection,
                          role,
                        })),
                      ].map(({ key, selection, role }) => {
                        const status = installed.find(
                          (entry) => entry.kind === selection.agentKind,
                        );
                        return (
                          <span key={key} className="inline-flex min-w-0 items-center gap-1.5">
                            <ProviderIcon
                              kind={selection.agentKind}
                              {...(status?.icon ? { icon: status.icon } : {})}
                              fallbackLabel={status?.label ?? selection.agentKind}
                              className="size-3.5 shrink-0"
                            />
                            <span className="truncate text-xs text-foreground">
                              {crewModelLabelOf(installed, selection)}
                            </span>
                            {selection.effort ? (
                              <span className="shrink-0 text-xs text-muted">
                                {formatEffortLabel(selection.effort)}
                              </span>
                            ) : null}
                            {selection.fast ? (
                              <Zap
                                className="size-3 shrink-0 fill-current text-muted"
                                aria-hidden="true"
                              />
                            ) : null}
                            {role?.noEdits ? (
                              <PencilOff
                                className="size-3 shrink-0 text-muted"
                                aria-hidden="true"
                              />
                            ) : null}
                            <CrewRolePill
                              role={role}
                              isLead={role === undefined}
                              leadLabel={t`Lead`}
                              wide={false}
                            />
                          </span>
                        );
                      })}
                    </span>
                  </button>
                  <ThreadDockIconButton
                    label={t`Edit ${crew.name}`}
                    onPress={() => setEditorCrewId(crew.id)}
                  >
                    <Pencil className="size-3.5" />
                  </ThreadDockIconButton>
                  <ThreadDockIconButton
                    label={t`Duplicate ${crew.name}`}
                    onPress={() => duplicate(crew)}
                  >
                    <Copy className="size-3.5" />
                  </ThreadDockIconButton>
                  <ThreadDockIconButton
                    danger
                    label={t`Delete ${crew.name}`}
                    onPress={() => setDeleteTarget(crew)}
                  >
                    <Trash2 className="size-3.5" />
                  </ThreadDockIconButton>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {editingCrew ? (
        <CrewEditorModal
          key={editingCrew.id}
          crew={editingCrew}
          helperOptions={helperOptions}
          leadProviders={leadProviders}
          roleTemplates={roleTemplates}
          onUpsert={upsertCrew}
          onClose={() => setEditorCrewId(undefined)}
        />
      ) : null}
      <ConfirmDialog
        isOpen={deleteTarget !== undefined}
        title={deleteTarget ? t`Delete ${deleteTarget.name}?` : t`Delete crew?`}
        body={t`This cannot be undone.`}
        confirmLabel={t`Delete`}
        onClose={() => setDeleteTarget(undefined)}
        onConfirm={confirmDelete}
      />
    </SettingsPage>
  );
}

function CrewEditorModal(props: {
  crew: SavedCrew;
  helperOptions: ReturnType<typeof useCrewHelperOptions>;
  leadProviders: CrewRosterModel["leadProviders"];
  roleTemplates: CrewRosterModel["roleTemplates"];
  onUpsert: (crew: SavedCrew) => void;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const { crew, helperOptions, onUpsert } = props;
  const [editingRoleId, setEditingRoleId] = useState<string | undefined>();
  const binding = crewBindingFromSavedCrew(crew);
  const defaultHelper = helperOptions.defaultSelectionFor(crew.lead.agentKind);
  const model: CrewRosterModel = {
    binding,
    lead: crew.lead,
    savedCrew: crew,
    helperOptions,
    roleTemplates: props.roleTemplates,
    leadProviders: props.leadProviders,
    ...(defaultHelper ? { defaultHelper } : {}),
    summary: "",
    isDraft: true,
    isDisabled: false,
    showFallbacks: true,
    onBindingChange: (next: ThreadCrewBinding) =>
      onUpsert({ ...crew, policy: next.policy, roles: next.roles }),
    onLeadChange: (lead: CrewMemberSelection) => onUpsert({ ...crew, lead }),
    onSaveToCrew: onUpsert,
    onSaveAsNewCrew: onUpsert,
  };

  return (
    <Modal.Backdrop isOpen onOpenChange={(open) => !open && props.onClose()}>
      <Modal.Container placement="center" scroll="inside" size="md">
        <Modal.Dialog className="sm:max-w-xl">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{t`Edit crew`}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="space-y-3 p-4">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] text-muted">{t`Name`}</span>
              <Input
                aria-label={t`Crew name`}
                value={crew.name}
                maxLength={40}
                variant="secondary"
                className="h-8 min-w-0 text-sm font-semibold"
                onChange={(event) => onUpsert({ ...crew, name: event.target.value })}
              />
            </div>
            <div>
              <LightballTabs
                tabs={[
                  { id: "crew-only", label: t`Crew only`, icon: <Lock className="size-3.5" /> },
                  {
                    id: "crew-first",
                    label: t`Crew first`,
                    icon: <LockOpen className="size-3.5" />,
                  },
                ]}
                active={crew.policy}
                onChange={(policy) => onUpsert({ ...crew, policy })}
                ariaLabel={t`Crew policy`}
                className="w-fit"
                shape="rounded"
              />
              <p className="mt-1 text-[11px] text-muted">{t`New crews start as Crew only.`}</p>
            </div>
            <div className="overflow-hidden rounded-xl border border-[var(--hairline)] px-1.5 py-1">
              <CrewMemberRow
                model={model}
                selection={crew.lead}
                isLead
                isEdited={isLeadEdited(crew.lead, crew)}
                isEditing={false}
                compact={false}
                onEditToggle={() => {}}
                onSelectionChange={(lead) => onUpsert({ ...crew, lead })}
                onRoleChange={() => {}}
                onRemoveRole={() => {}}
              />
              <Separator className="my-1 h-px w-full bg-border/70" />
              {crew.roles.map((role) => (
                <CrewMemberRow
                  key={role.id}
                  model={model}
                  role={role}
                  selection={role.selection}
                  isLead={false}
                  isEdited={isRoleEdited(role, crew)}
                  isEditing={editingRoleId === role.id}
                  compact={false}
                  onEditToggle={() =>
                    setEditingRoleId((current) => (current === role.id ? undefined : role.id))
                  }
                  onSelectionChange={(selection) => {
                    const roles = crew.roles.map((entry) =>
                      entry.id === role.id ? { ...entry, selection } : entry,
                    );
                    onUpsert({ ...crew, roles });
                  }}
                  onRoleChange={(patch) => {
                    const next = updateRole(binding, role.id, patch);
                    onUpsert({ ...crew, roles: next.roles });
                  }}
                  onRemoveRole={() =>
                    onUpsert({
                      ...crew,
                      roles: removeRole(binding, role.id).roles,
                    })
                  }
                />
              ))}
              <Button
                size="sm"
                variant="ghost"
                className="mt-0.5 h-7 w-full justify-start gap-1.5 px-1.5 text-xs text-muted hover:text-foreground"
                isDisabled={!model.defaultHelper || crew.roles.length >= MAX_CREW_ROLES}
                onPress={() => {
                  if (!model.defaultHelper) return;
                  const result = addRole(binding, model.roleTemplates, model.defaultHelper);
                  onUpsert({ ...crew, roles: result.binding.roles });
                  if (result.roleId) setEditingRoleId(result.roleId);
                }}
              >
                <Plus className="size-3.5" />
                <Trans>Add role</Trans>
              </Button>
            </div>
            <p className="text-[11px] text-muted">
              <Trans>
                If a role's agent is unavailable, its fallbacks run. Crew first may also use the
                next ranked agent.
              </Trans>
            </p>
            <p className="text-[11px] text-muted">
              <Trans>
                The pencil-off icon marks a role told not to edit files: an instruction in its
                brief, not a permission.
              </Trans>
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button slot="close" variant="ghost" onPress={props.onClose}>
              <Trans>Done</Trans>
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
