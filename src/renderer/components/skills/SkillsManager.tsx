import { useState } from "react";
import { Button, Dropdown, Label, Separator, toast, Tooltip } from "@heroui/react";
import {
  AlertTriangle,
  ChevronDown,
  FileWarning,
  FolderOpen,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Store,
  Trash2,
  Wand2,
} from "lucide-react";
import type {
  ProjectLocation,
  SkillScope,
  SkillScopeLevel,
  SkillSummary,
} from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { ConfirmDialog, PixelLoader } from "@/renderer/components/common";
import { useSkills } from "./useSkills";
import { SkillEditorModal, type SkillEditorTarget } from "./SkillEditorModal";
import { SkillMarketplaceModal } from "./SkillMarketplaceModal";
import { SkillOptimizerModal } from "./SkillOptimizerModal";

const LEVEL_TITLE: Record<SkillScopeLevel, string> = {
  project: "This project",
  global: "Global (all projects)",
};

const LEVEL_SUBTITLE: Record<SkillScopeLevel, string> = {
  project: "Skills committed alongside the repo — shared with your team.",
  global: "Skills in your home directory — available in every project.",
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function SkillsManager(props: { mode: SkillScopeLevel; projectLocation?: ProjectLocation }) {
  const { projectLocation } = props;
  // Global settings shows only the global level; project settings shows the
  // project level first, with the inherited global skills underneath.
  const visibleLevels: SkillScopeLevel[] =
    props.mode === "project" ? ["project", "global"] : ["global"];

  const { scan, loading, error, reload } = useSkills(projectLocation);
  const operationContext = projectLocation ? { projectLocation } : {};

  const [editorTarget, setEditorTarget] = useState<SkillEditorTarget | null>(null);
  const [marketplaceLevel, setMarketplaceLevel] = useState<SkillScopeLevel | null>(null);
  const [optimizerLevel, setOptimizerLevel] = useState<SkillScopeLevel | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SkillSummary | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState<{
    skill: SkillSummary;
    toScope: SkillScope;
    move: boolean;
  } | null>(null);

  const scopeById = new Map<string, SkillScope>();
  for (const scope of scan?.scopes ?? []) scopeById.set(scope.id, scope);

  const skillsByScope = new Map<string, SkillSummary[]>();
  for (const skill of scan?.skills ?? []) {
    const list = skillsByScope.get(skill.scopeId) ?? [];
    list.push(skill);
    skillsByScope.set(skill.scopeId, list);
  }
  for (const list of skillsByScope.values()) list.sort((a, b) => a.name.localeCompare(b.name));

  const scopeLabel = (scopeId: string): string => {
    const scope = scopeById.get(scopeId);
    if (!scope) return scopeId;
    return `${scope.rootLabel} · ${scope.level === "global" ? "global" : "project"}`;
  };

  async function doTransfer(
    skill: SkillSummary,
    toScope: SkillScope,
    move: boolean,
    overwrite: boolean,
  ) {
    await readBridge().transferSkill({
      ...operationContext,
      fromPath: skill.absolutePath,
      toScopeDir: toScope.absolutePath,
      move,
      overwrite,
    });
    toast.success(`${move ? "Moved" : "Copied"} “${skill.name}” to ${scopeLabel(toScope.id)}.`);
    await reload();
  }

  async function runTransfer(skill: SkillSummary, toScope: SkillScope, move: boolean) {
    try {
      await doTransfer(skill, toScope, move, false);
    } catch (err) {
      // A same-named skill already lives in the destination — offer to overwrite
      // instead of dead-ending (this is how you propagate an edit to a sibling root).
      if (/already exists/i.test(errorMessage(err, ""))) {
        setPendingOverwrite({ skill, toScope, move });
        return;
      }
      toast.danger(errorMessage(err, "Couldn't transfer the skill."));
    }
  }

  async function confirmOverwrite() {
    if (!pendingOverwrite) return;
    const { skill, toScope, move } = pendingOverwrite;
    setPendingOverwrite(null);
    try {
      await doTransfer(skill, toScope, move, true);
    } catch (err) {
      toast.danger(errorMessage(err, "Couldn't transfer the skill."));
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const skill = pendingDelete;
    setPendingDelete(null);
    try {
      await readBridge().deleteSkill({ ...operationContext, absolutePath: skill.absolutePath });
      toast.success(`Deleted “${skill.name}”.`);
      await reload();
    } catch (err) {
      toast.danger(errorMessage(err, "Couldn't delete the skill."));
    }
  }

  return (
    <div className="mx-auto min-h-full max-w-[920px]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Sparkles className="size-4 text-accent" />
            Skills
          </h1>
          <p className="mt-1 text-xs text-muted">
            Manage agent skills across providers and scopes. Each skill is a folder with a{" "}
            <code>SKILL.md</code>.
          </p>
        </div>
        <Button
          size="sm"
          variant="tertiary"
          className="shrink-0 gap-1.5"
          isDisabled={loading}
          onPress={() => void reload()}
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertTriangle className="size-3.5" />
          {error}
        </div>
      ) : null}

      {loading && !scan ? (
        <div className="flex items-center justify-center py-16">
          <PixelLoader size="lg" className="text-muted" />
        </div>
      ) : (
        <div className="space-y-7">
          {visibleLevels.map((level) => {
            const scopes = (scan?.scopes ?? []).filter((scope) => scope.level === level);
            if (scopes.length === 0) return null;
            return (
              <LevelGroup
                key={level}
                level={level}
                scopes={scopes}
                skillsByScope={skillsByScope}
                allScopes={scan?.scopes ?? []}
                onNewSkill={(scope) =>
                  setEditorTarget({
                    mode: "create",
                    scopeDir: scope.absolutePath,
                    scopeLabel: scopeLabel(scope.id),
                  })
                }
                onEdit={(skill) => setEditorTarget({ mode: "edit", skill })}
                onDelete={(skill) => setPendingDelete(skill)}
                onTransfer={runTransfer}
                onOpenMarketplace={() => setMarketplaceLevel(level)}
                onOptimize={() => setOptimizerLevel(level)}
                onReveal={(path) =>
                  void readBridge().revealSkill({ ...operationContext, absolutePath: path })
                }
              />
            );
          })}

          {scan?.unavailable.length ? (
            <div className="rounded-lg border border-default-200 px-3 py-2 text-xs text-muted">
              Some scopes couldn&apos;t be scanned:{" "}
              {scan.unavailable.map((u) => `${scopeLabel(u.scopeId)} (${u.reason})`).join("; ")}
            </div>
          ) : null}
        </div>
      )}

      <SkillEditorModal
        target={editorTarget}
        {...operationContext}
        onClose={() => setEditorTarget(null)}
        onSaved={() => void reload()}
      />
      <SkillMarketplaceModal
        open={marketplaceLevel !== null}
        onClose={() => setMarketplaceLevel(null)}
        onInstalled={() => void reload()}
        {...operationContext}
        targetScopes={(scan?.scopes ?? [])
          .filter((scope) => scope.level === marketplaceLevel)
          .map((scope) => ({
            id: scope.id,
            label: scopeLabel(scope.id),
            absolutePath: scope.absolutePath,
            installedFolders: (skillsByScope.get(scope.id) ?? []).map((s) => s.folderName),
            installedSources: (skillsByScope.get(scope.id) ?? [])
              .map((s) => s.source)
              .filter((s): s is string => Boolean(s)),
          }))}
      />
      <SkillOptimizerModal
        open={optimizerLevel !== null}
        level={optimizerLevel ?? "global"}
        {...(projectLocation ? { projectLocation } : {})}
        scopeLabel={scopeLabel}
        onClose={() => setOptimizerLevel(null)}
        onApplied={() => void reload()}
      />

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title="Delete skill"
        body={
          <span>
            Delete “{pendingDelete?.name}” and its folder? This removes it from{" "}
            <code>{pendingDelete?.absolutePath}</code> and cannot be undone.
          </span>
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => void confirmDelete()}
        onClose={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        isOpen={pendingOverwrite !== null}
        title="Overwrite skill"
        body={
          <span>
            “{pendingOverwrite?.skill.name}” already exists in{" "}
            {pendingOverwrite ? scopeLabel(pendingOverwrite.toScope.id) : ""}. Overwrite that copy
            with this one?
          </span>
        }
        confirmLabel="Overwrite"
        confirmVariant="danger"
        onConfirm={() => void confirmOverwrite()}
        onClose={() => setPendingOverwrite(null)}
      />
    </div>
  );
}

function LevelGroup(props: {
  level: SkillScopeLevel;
  scopes: SkillScope[];
  allScopes: SkillScope[];
  skillsByScope: Map<string, SkillSummary[]>;
  onNewSkill: (scope: SkillScope) => void;
  onEdit: (skill: SkillSummary) => void;
  onDelete: (skill: SkillSummary) => void;
  onTransfer: (skill: SkillSummary, toScope: SkillScope, move: boolean) => void;
  onOpenMarketplace: () => void;
  onOptimize: () => void;
  onReveal: (absolutePath: string) => void;
}) {
  const { level, scopes, allScopes, skillsByScope } = props;

  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3 border-b border-default-200 pb-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{LEVEL_TITLE[level]}</h2>
          <p className="text-xs text-muted">{LEVEL_SUBTITLE[level]}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-muted"
            onPress={props.onOpenMarketplace}
          >
            <Store className="size-3.5" />
            Marketplace
          </Button>
          <Tooltip>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted"
              onPress={props.onOptimize}
            >
              <Wand2 className="size-3.5" />
              Sync providers
            </Button>
            <Tooltip.Content>
              Copy each skill into every provider folder that&apos;s missing or out of date.
            </Tooltip.Content>
          </Tooltip>
        </div>
      </div>

      <div className="space-y-3">
        {scopes.map((scope) => (
          <ScopeCard
            key={scope.id}
            scope={scope}
            skills={skillsByScope.get(scope.id) ?? []}
            transferTargets={allScopes.filter((other) => other.id !== scope.id)}
            onNewSkill={() => props.onNewSkill(scope)}
            onEdit={props.onEdit}
            onDelete={props.onDelete}
            onTransfer={props.onTransfer}
            onReveal={props.onReveal}
          />
        ))}
      </div>
    </section>
  );
}

function ScopeCard(props: {
  scope: SkillScope;
  skills: SkillSummary[];
  transferTargets: SkillScope[];
  onNewSkill: () => void;
  onEdit: (skill: SkillSummary) => void;
  onDelete: (skill: SkillSummary) => void;
  onTransfer: (skill: SkillSummary, toScope: SkillScope, move: boolean) => void;
  onReveal: (absolutePath: string) => void;
}) {
  const { scope, skills, transferTargets } = props;

  return (
    <div className="overflow-hidden rounded-xl border border-default-200">
      <div className="flex items-center justify-between gap-3 bg-content2/40 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{scope.rootLabel}</span>
            <code className="truncate rounded bg-content2 px-1.5 py-0.5 text-[10px] text-muted">
              {scope.dirName}
            </code>
            {!scope.exists ? (
              <span className="rounded bg-content2 px-1.5 py-0.5 text-[10px] text-muted/70">
                not created
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted">Read by {scope.consumerLabel}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {scope.exists ? (
            <Tooltip>
              <Button
                size="sm"
                variant="tertiary"
                aria-label="Open folder"
                onPress={() => props.onReveal(scope.absolutePath)}
              >
                <FolderOpen className="size-3.5" />
              </Button>
              <Tooltip.Content>Reveal in file manager</Tooltip.Content>
            </Tooltip>
          ) : null}
          <Button size="sm" variant="tertiary" className="gap-1.5" onPress={props.onNewSkill}>
            <Plus className="size-3.5" />
            New
          </Button>
        </div>
      </div>

      {skills.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-muted">No skills here yet.</p>
      ) : (
        <ul className="divide-y divide-default-100">
          {skills.map((skill) => (
            <li key={skill.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{skill.name}</span>
                  {!skill.hasSkillFile ? (
                    <Tooltip>
                      <span className="flex items-center text-warning">
                        <FileWarning className="size-3.5" />
                      </span>
                      <Tooltip.Content>No SKILL.md in this folder</Tooltip.Content>
                    </Tooltip>
                  ) : null}
                  <span className="shrink-0 text-[10px] text-muted/60">
                    {skill.fileCount} file{skill.fileCount === 1 ? "" : "s"}
                  </span>
                </div>
                {skill.description ? (
                  <p className="line-clamp-1 text-xs text-muted">{skill.description}</p>
                ) : (
                  <p className="text-xs text-muted/50">No description</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Tooltip>
                  <Button
                    size="sm"
                    variant="tertiary"
                    aria-label="Edit skill"
                    onPress={() => props.onEdit(skill)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Tooltip.Content>Edit</Tooltip.Content>
                </Tooltip>

                {transferTargets.length > 0 ? (
                  <Dropdown>
                    <Button
                      size="sm"
                      variant="tertiary"
                      aria-label="Move or copy"
                      className="gap-1"
                    >
                      <ChevronDown className="size-3.5" />
                    </Button>
                    <Dropdown.Popover className="min-w-[220px]">
                      <Dropdown.Menu
                        aria-label="Move or copy skill"
                        onAction={(key) => {
                          const value = String(key);
                          const [action, scopeId] = value.split("::");
                          const target = transferTargets.find((t) => t.id === scopeId);
                          if (target) props.onTransfer(skill, target, action === "move");
                        }}
                      >
                        <Dropdown.Section>
                          {transferTargets.map((target) => (
                            <Dropdown.Item
                              key={`copy::${target.id}`}
                              id={`copy::${target.id}`}
                              textValue={`Copy to ${target.rootLabel} ${target.level}`}
                            >
                              <Label>
                                Copy to {target.rootLabel} · {target.level}
                              </Label>
                            </Dropdown.Item>
                          ))}
                        </Dropdown.Section>
                        <Separator />
                        <Dropdown.Section>
                          {transferTargets.map((target) => (
                            <Dropdown.Item
                              key={`move::${target.id}`}
                              id={`move::${target.id}`}
                              textValue={`Move to ${target.rootLabel} ${target.level}`}
                            >
                              <Label>
                                Move to {target.rootLabel} · {target.level}
                              </Label>
                            </Dropdown.Item>
                          ))}
                        </Dropdown.Section>
                      </Dropdown.Menu>
                    </Dropdown.Popover>
                  </Dropdown>
                ) : null}

                <Tooltip>
                  <Button
                    size="sm"
                    variant="tertiary"
                    aria-label="Delete skill"
                    className="text-danger"
                    onPress={() => props.onDelete(skill)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                  <Tooltip.Content>Delete</Tooltip.Content>
                </Tooltip>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
