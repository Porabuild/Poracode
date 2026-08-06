import { useEffect, useState } from "react";
import { Input, Tooltip, toast } from "@heroui/react";
import { Box, ChevronDown, Download, Plus, RefreshCw, Search, Store, Trash2 } from "lucide-react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import type { SkillEntry } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import {
  Button,
  ConfirmDialog,
  PixelLoader,
  Select,
  ToggleSwitch,
} from "@/renderer/components/common";
import {
  GLOBAL_MCP_DESTINATION_ID,
  McpProjectDestinationDropdown,
  type McpProjectDestination,
} from "@/renderer/components/mcp/McpProjectDestinationDropdown";
import { newThreadFromText } from "@/renderer/actions/notesActions";
import { ensureHomeScopeProject } from "@/renderer/actions/projectActions";
import { usePanelStore } from "@/renderer/state/panelStore";
import { SkillImportModal } from "./SkillImportModal";
import { SkillMarketplaceModal } from "./SkillMarketplaceModal";
import { SkillViewModal } from "./SkillViewModal";
import { groupSkills } from "./skillGrouping";
import { hostGlobalScopeLabel, resolveSkillTarget, skillTargetRequest } from "./skillTargets";
import { useSkills } from "./useSkills";
import {
  resolveLocalizedPluginSkill,
  useLocalizedPluginCatalog,
  type LocalizedPlugin,
} from "@/renderer/components/plugins/pluginCopy";

type StatusFilter = "all" | "enabled" | "disabled";

export function SkillsManager(props: {
  projects: readonly McpProjectDestination[];
  defaultDestinationId?: string;
}) {
  const { t } = useLingui();
  const localizedPlugins = useLocalizedPluginCatalog();
  const [destinationId, setDestinationId] = useState(
    props.defaultDestinationId ?? GLOBAL_MCP_DESTINATION_ID,
  );
  const [discoveredWslDistros, setDiscoveredWslDistros] = useState<string[]>([]);
  const wslDistros = [
    ...new Set([
      ...props.projects.flatMap((project) =>
        project.location.kind === "wsl" ? [project.location.distro] : [],
      ),
      ...discoveredWslDistros,
    ]),
  ];
  const target = resolveSkillTarget(destinationId, props.projects);
  const { scan, loading, error, reload } = useSkills(
    target.project?.location,
    undefined,
    target.wslDistro,
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [importOpen, setImportOpen] = useState(false);
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<SkillEntry>();
  const [viewingSkill, setViewingSkill] = useState<SkillEntry>();

  useEffect(() => {
    if (readBridge().platform !== "win32") return;
    let active = true;
    void readBridge()
      .listWslDistros()
      .then((distros) => {
        if (active) setDiscoveredWslDistros(distros);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const targetSkills = (scan?.skills ?? []).filter((skill) => skill.scope === target.scope);
  const visibleSkills = targetSkills.filter((skill) => {
    if (statusFilter === "enabled" && !skill.enabled) return false;
    if (statusFilter === "disabled" && skill.enabled) return false;
    const { localizedPlugin, localizedSkill } = resolveLocalizedPluginSkill(
      localizedPlugins,
      skill,
    );
    return [
      skill.name,
      skill.description,
      skill.providerLabel,
      skill.scopeLabel,
      skill.absolutePath,
      localizedPlugin?.name,
      localizedSkill?.name,
      localizedSkill?.description,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
  const managed = visibleSkills.filter(
    (skill) => skill.origin === "managed" && skill.availability !== "poracode",
  );
  const providerGroups = groupSkills(
    visibleSkills.filter(
      (skill) => skill.origin !== "managed" || skill.availability === "poracode",
    ),
    (skill) => `${skill.scope}:${skill.providerGroupId ?? skill.providerId}`,
  );
  const hasAnySkills = targetSkills.length > 0;
  const hasVisibleSkills = visibleSkills.length > 0;
  const providerSections = [...providerGroups.entries()]
    .map(([key, skills]) => {
      const first = skills[0]!;
      const roots = new Set(skills.map((skill) => skill.rootPath));
      return {
        key,
        title: first.pluginId
          ? (localizedPlugins.find((entry) => entry.plugin.name === first.pluginId)?.name ??
            first.pluginName ??
            first.providerLabel)
          : (skills.find((skill) => skill.providerGroupLabel)?.providerGroupLabel ??
            first.providerLabel),
        ...(roots.size === 1 ? { subtitle: first.rootPath } : {}),
        skills,
        order: Math.min(...skills.map((skill) => skill.providerGroupOrder ?? 0)),
      };
    })
    .toSorted((left, right) => left.order - right.order || left.title.localeCompare(right.title));
  const sections = [
    ...providerSections.filter((section) => section.order < 0),
    ...(managed.length > 0 ? [{ key: "managed", title: t`Shared`, skills: managed }] : []),
    ...providerSections.filter((section) => section.order >= 0),
  ];
  const externalCount = targetSkills.filter(
    (skill) => skill.origin === "external" && skill.valid && skill.portable !== false,
  ).length;
  const viewingSkillDisplayName = viewingSkill
    ? (resolveLocalizedPluginSkill(localizedPlugins, viewingSkill).localizedSkill?.name ??
      viewingSkill.name)
    : undefined;

  const runMutation = async (skill: SkillEntry, action: () => Promise<void>) => {
    setPending((current) => new Set(current).add(skill.id));
    try {
      await action();
      await reload();
    } catch {
      toast.danger(t`Couldn't update the skill.`);
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(skill.id);
        return next;
      });
    }
  };

  const setEnabled = (skill: SkillEntry, enabled: boolean) =>
    runMutation(skill, () =>
      readBridge().setSkillEnabled({
        absolutePath: skill.absolutePath,
        enabled,
        ...skillTargetRequest(target),
      }),
    );

  const confirmDelete = async () => {
    const skill = pendingDelete;
    if (!skill) return;
    setPendingDelete(undefined);
    await runMutation(skill, () =>
      readBridge().deleteSkill({
        absolutePath: skill.absolutePath,
        ...skillTargetRequest(target),
      }),
    );
  };

  const filterOptions = [
    { id: "all", label: t`All` },
    { id: "enabled", label: t`Enabled` },
    { id: "disabled", label: t`Disabled` },
  ];
  const platform = readBridge().platform;
  const hostGlobalLabel = t(hostGlobalScopeLabel(platform));
  const targetLabel = target.project?.name ?? target.wslDistro ?? hostGlobalLabel;

  const createSkill = async (targetId: string) => {
    const createTarget = resolveSkillTarget(targetId, props.projects);
    const project = createTarget.project ?? (await ensureHomeScopeProject().catch(() => undefined));
    if (!project) {
      toast.warning(t`Add a project before creating a skill.`);
      return;
    }
    const destinationLabel = createTarget.project
      ? t`this project`
      : createTarget.wslDistro
        ? t`the global ${createTarget.wslDistro} WSL scope`
        : platform === "darwin"
          ? t`the macOS user`
          : platform === "linux"
            ? t`the Linux user`
            : t`the Windows user`;
    newThreadFromText(
      project.id,
      t`/skill-creator-poracode Create a new managed skill for ${destinationLabel}.`,
      { bindLeadingSkill: true },
    );
    usePanelStore.getState().closeSettings();
    usePanelStore.getState().closeProjectSettings();
  };

  return (
    <div className="space-y-5" aria-busy={loading}>
      {scan && importOpen ? (
        <SkillImportModal
          isOpen
          onOpenChange={setImportOpen}
          scan={scan}
          projects={props.projects}
          wslDistros={wslDistros}
          sourceTarget={target}
          defaultDestinationId={destinationId}
          onImported={reload}
        />
      ) : null}
      {scan && marketplaceOpen ? (
        <SkillMarketplaceModal
          isOpen
          onOpenChange={setMarketplaceOpen}
          target={target}
          targetLabel={targetLabel}
          scan={scan}
          onInstalled={reload}
        />
      ) : null}
      {viewingSkill ? (
        <SkillViewModal
          skill={viewingSkill}
          displayName={viewingSkillDisplayName ?? viewingSkill.name}
          {...(target.project ? { projectLocation: target.project.location } : {})}
          {...(target.wslDistro ? { wslDistro: target.wslDistro } : {})}
          onClose={() => setViewingSkill(undefined)}
        />
      ) : null}
      <ConfirmDialog
        isOpen={pendingDelete !== undefined}
        title={t`Delete skill`}
        body={
          pendingDelete?.linked ? (
            <Trans>
              Remove the linked skill “{pendingDelete.name}”? Its source folder will not be deleted.
            </Trans>
          ) : pendingDelete?.origin === "external" ? (
            <Trans>
              Delete “{pendingDelete.name}” from {pendingDelete.providerLabel}? This removes its
              source folder and cannot be undone.
            </Trans>
          ) : (
            <Trans>
              Delete “{pendingDelete?.name}” from {pendingDelete?.absolutePath}? This cannot be
              undone.
            </Trans>
          )
        }
        confirmLabel={t`Delete`}
        onConfirm={() => void confirmDelete()}
        onClose={() => setPendingDelete(undefined)}
      />

      <div className="flex items-center justify-between gap-3">
        <McpProjectDestinationDropdown
          ariaLabel={t`Skills location`}
          placement="bottom end"
          projects={props.projects}
          wslDistros={wslDistros}
          globalLabel={hostGlobalLabel}
          value={target.id}
          trigger={
            <Button
              size="sm"
              variant="tertiary"
              aria-label={t`Skills location`}
              className="min-w-48 justify-between"
            >
              <span className="truncate">{targetLabel}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted" />
            </Button>
          }
          onChange={setDestinationId}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="tertiary" onPress={() => setMarketplaceOpen(true)}>
            <Store className="size-4" />
            <Trans>Marketplace</Trans>
          </Button>
          <McpProjectDestinationDropdown
            ariaLabel={t`Add skill destination`}
            placement="bottom end"
            projects={props.projects}
            wslDistros={wslDistros}
            globalLabel={hostGlobalLabel}
            value={target.id}
            trigger={
              <Button size="sm" variant="tertiary" aria-label={t`Add skill`}>
                <Plus className="size-4" />
                <Trans>Add skill</Trans>
                <ChevronDown className="size-3.5 text-muted" />
              </Button>
            }
            onChange={(value) => void createSkill(value)}
          />
          <Tooltip>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                size="sm"
                variant="tertiary"
                aria-label={t`Import external skills`}
                isDisabled={!scan || externalCount === 0}
                onPress={() => setImportOpen(true)}
              >
                <Download className="size-4" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              <Trans>Import external skills</Trans>
            </Tooltip.Content>
          </Tooltip>
          <Tooltip>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                size="sm"
                variant="tertiary"
                aria-label={t`Refresh skills`}
                isDisabled={loading}
                onPress={() => void reload()}
              >
                <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              <Trans>Refresh skills</Trans>
            </Tooltip.Content>
          </Tooltip>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted" />
          <Input
            aria-label={t`Search skills`}
            className="w-full pl-9"
            placeholder={t`Search skills...`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Select
          aria-label={t`Filter skills by status`}
          className="w-36"
          options={filterOptions}
          value={statusFilter}
          onChange={(value) =>
            setStatusFilter(
              value === "enabled" ? "enabled" : value === "disabled" ? "disabled" : "all",
            )
          }
        />
      </div>

      <p className="text-xs text-muted">
        <Trans>
          Changes apply to new chats. Providers that support live skill reload may update sooner.
        </Trans>
      </p>
      <p className="text-xs text-muted">
        <Trans>
          Disabling a skill moves it out of active skill folders and removes Poracode-managed
          provider copies. Its files are preserved so you can enable it again.
        </Trans>
      </p>

      {error ? (
        <div
          className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-3 text-sm text-danger"
          role="alert"
        >
          <p>
            <Trans>Couldn't scan agent skills.</Trans>
          </p>
          <Button className="mt-2" size="sm" variant="tertiary" onPress={() => void reload()}>
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}

      {scan?.issues.length ? (
        <div
          className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning"
          role="status"
        >
          <Trans>
            Some provider folders couldn't be scanned. Successfully loaded skills are still shown.
          </Trans>
          <ul className="mt-1 space-y-0.5 font-mono text-[10px]">
            {scan.issues.map((issue) => (
              <li key={`${issue.providerId}:${issue.path}`}>
                {issue.providerId}: {issue.path}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {loading && !scan ? (
        <div
          className="flex items-center justify-center gap-2 py-10 text-sm text-muted"
          role="status"
        >
          <PixelLoader size="xs" />
          <Trans>Loading skills…</Trans>
        </div>
      ) : null}

      {sections.map((section) => (
        <SkillSection
          key={section.key}
          title={section.title}
          {...("subtitle" in section ? { subtitle: section.subtitle } : {})}
          skills={section.skills}
          localizedPlugins={localizedPlugins}
          pending={pending}
          onEnabledChange={setEnabled}
          onView={setViewingSkill}
          onDelete={setPendingDelete}
        />
      ))}

      {!loading && !hasAnySkills ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--hairline)] px-6 py-10 text-center">
          <Box className="mb-3 size-6 text-muted" />
          <p className="text-sm font-medium text-foreground">
            <Trans>No skills found</Trans>
          </p>
          <p className="mt-1 max-w-md text-xs text-muted">
            <Trans>
              Add a skill to .agents/skills or .poracode/skills, or import one from another
              provider.
            </Trans>
          </p>
        </div>
      ) : null}

      {!loading && hasAnySkills && !hasVisibleSkills ? (
        <div className="rounded-xl border border-dashed border-[var(--hairline)] px-6 py-8 text-center text-sm text-muted">
          <Trans>No skills match your search and filter.</Trans>
        </div>
      ) : null}
    </div>
  );
}

function SkillSection(props: {
  title: string;
  subtitle?: string;
  skills: SkillEntry[];
  localizedPlugins: readonly LocalizedPlugin[];
  pending: ReadonlySet<string>;
  onEnabledChange: (skill: SkillEntry, enabled: boolean) => Promise<void>;
  onView: (skill: SkillEntry) => void;
  onDelete: (skill: SkillEntry) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2 px-1">
        <h3 className="text-xs font-semibold text-foreground">{props.title}</h3>
        <span className="text-xs text-muted">
          <Plural value={props.skills.length} one="# skill" other="# skills" />
        </span>
        {props.subtitle ? (
          <span className="min-w-0 flex-1 truncate text-right text-xs text-muted">
            {props.subtitle}
          </span>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
        {props.skills.map((skill) => (
          <SkillRow
            key={skill.id}
            skill={skill}
            localizedPlugins={props.localizedPlugins}
            pending={props.pending.has(skill.id)}
            onEnabledChange={props.onEnabledChange}
            onView={props.onView}
            onDelete={props.onDelete}
          />
        ))}
      </div>
    </section>
  );
}

function SkillRow(props: {
  skill: SkillEntry;
  localizedPlugins: readonly LocalizedPlugin[];
  pending: boolean;
  onEnabledChange: (skill: SkillEntry, enabled: boolean) => Promise<void>;
  onView: (skill: SkillEntry) => void;
  onDelete: (skill: SkillEntry) => void;
}) {
  const { t } = useLingui();
  const skill = props.skill;
  const { localizedPlugin, localizedSkill: pluginSkillCopy } = resolveLocalizedPluginSkill(
    props.localizedPlugins,
    skill,
  );
  const pluginName = localizedPlugin?.name ?? skill.pluginName;
  const displayName = pluginSkillCopy?.name ?? skill.name;
  const displayDescription = pluginSkillCopy?.description ?? skill.description;
  const providerOwnedLabel =
    skill.origin === "built-in" ? (
      <Trans>Built-in</Trans>
    ) : skill.origin === "plugin" ? (
      <Trans>Plugin</Trans>
    ) : undefined;
  const importLabel =
    !skill.linked && skill.importState === "already-imported"
      ? t`Already imported`
      : skill.importState === "conflict"
        ? t`Import conflict`
        : undefined;
  const invalidReason = skill.invalidReason
    ? {
        "read-error": t`SKILL.md couldn't be read.`,
        "missing-file": t`SKILL.md is missing.`,
        "too-large": t`SKILL.md is too large.`,
        "missing-frontmatter": t`SKILL.md is missing YAML frontmatter.`,
        "missing-name": t`The skill name is missing.`,
        "invalid-name": t`The skill name must use lowercase letters, numbers, and hyphens.`,
        "name-mismatch": t`The skill name must match its folder name.`,
        "missing-description": t`The skill description is missing.`,
        "description-too-long": t`The skill description is too long.`,
      }[skill.invalidReason]
    : undefined;

  return (
    <div className="flex min-h-16 items-center gap-3 border-b border-[var(--hairline)] px-3 py-2 last:border-b-0">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--hairline)] bg-surface-secondary text-muted">
        <Box className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="!h-auto min-w-0 max-w-full justify-start !p-0 text-sm font-medium text-foreground hover:underline"
            aria-label={t`View ${displayName}`}
            onPress={() => props.onView(skill)}
          >
            <span className="truncate">{displayName}</span>
          </Button>
          {providerOwnedLabel ? (
            <span className="shrink-0 rounded bg-surface-secondary px-1.5 py-0.5 text-[10px] text-muted">
              {providerOwnedLabel}
            </span>
          ) : null}
          {skill.availability === "poracode" ? (
            <span className="shrink-0 rounded bg-surface-secondary px-1.5 py-0.5 text-[10px] text-muted">
              <Trans>Poracode only</Trans>
            </span>
          ) : null}
          {skill.linked ? (
            <span className="shrink-0 rounded bg-surface-secondary px-1.5 py-0.5 text-[10px] text-muted">
              <Trans>Linked</Trans>
            </span>
          ) : null}
          {importLabel ? (
            <span className="shrink-0 text-[10px] text-warning">{importLabel}</span>
          ) : null}
          {!skill.mutable && !skill.enabled ? (
            <span className="shrink-0 rounded bg-surface-secondary px-1.5 py-0.5 text-[10px] text-muted">
              <Trans>Disabled</Trans>
            </span>
          ) : null}
        </div>
        <p className="truncate text-xs text-muted">
          {(invalidReason ?? displayDescription) || t`No description`}
        </p>
        <p className="truncate font-mono text-[10px] text-muted/70">{skill.absolutePath}</p>
      </div>
      {skill.mutable ? (
        <>
          <ToggleSwitch
            aria-label={skill.enabled ? t`Disable ${skill.name}` : t`Enable ${skill.name}`}
            isSelected={skill.enabled}
            isDisabled={props.pending || (!skill.valid && !skill.enabled)}
            onChange={(enabled) => void props.onEnabledChange(skill, enabled)}
          />
          <Tooltip>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                size="sm"
                variant="tertiary"
                className="text-danger"
                aria-label={t`Delete ${skill.name}`}
                isDisabled={props.pending}
                onPress={() => props.onDelete(skill)}
              >
                <Trash2 className="size-4" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              <Trans>Delete skill</Trans>
            </Tooltip.Content>
          </Tooltip>
        </>
      ) : (
        <span className="shrink-0 text-xs text-muted">
          {pluginName ? <Trans>Managed by {pluginName}</Trans> : <Trans>Managed by provider</Trans>}
        </span>
      )}
    </div>
  );
}
