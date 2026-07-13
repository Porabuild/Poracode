import { useEffect, useId, useState } from "react";
import { Checkbox, Modal, toast } from "@heroui/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import type {
  SkillAvailability,
  SkillEntry,
  SkillImportMode,
  SkillScanResult,
} from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { Button, Select } from "@/renderer/components/common";
import {
  GLOBAL_MCP_DESTINATION_ID,
  McpProjectDestinationDropdown,
  type McpProjectDestination,
} from "@/renderer/components/mcp/McpProjectDestinationDropdown";
import { groupSkills } from "./skillGrouping";
import {
  hostGlobalScopeLabel,
  resolveSkillTarget,
  skillTargetRequest,
  type SkillTarget,
} from "./skillTargets";
import { useSkills } from "./useSkills";

interface SkillImportModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  scan: SkillScanResult;
  projects: readonly McpProjectDestination[];
  wslDistros: readonly string[];
  sourceTarget: SkillTarget;
  defaultDestinationId: string;
  onImported: () => Promise<void>;
}

function groupKey(skill: SkillEntry): string {
  return `${skill.scope}:${skill.providerId}`;
}

export function SkillImportModal(props: SkillImportModalProps) {
  const { t } = useLingui();
  const groupsId = useId();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [destinationId, setDestinationId] = useState(props.defaultDestinationId);
  const [availability, setAvailability] = useState<SkillAvailability>("shared");
  const [mode, setMode] = useState<SkillImportMode>("copy");
  const [replaceConflicts, setReplaceConflicts] = useState(false);
  const [importing, setImporting] = useState(false);

  const destinationTarget = resolveSkillTarget(destinationId, props.projects);
  const destinationSkills = useSkills(
    destinationTarget.project?.location,
    undefined,
    destinationTarget.wslDistro,
  );
  const destinationScan =
    destinationTarget.id === props.sourceTarget.id ? props.scan : destinationSkills.scan;
  const candidates = props.scan.skills.filter(
    (skill) =>
      skill.scope === props.sourceTarget.scope &&
      skill.origin === "external" &&
      skill.valid &&
      skill.portable !== false,
  );
  const destinationManagedFolders = new Set(
    (destinationScan?.skills ?? [])
      .filter(
        (skill) =>
          skill.origin === "managed" &&
          skill.scope === destinationTarget.scope &&
          (skill.availability ?? "shared") === availability,
      )
      .map((skill) => skill.folderName.toLowerCase()),
  );
  const importStateFor = (skill: SkillEntry) => {
    if (!destinationManagedFolders.has(skill.folderName.toLowerCase())) return "available";
    return availability === "shared" &&
      destinationTarget.id === props.sourceTarget.id &&
      skill.scope === destinationTarget.scope &&
      skill.importState === "already-imported"
      ? "already-imported"
      : "conflict";
  };
  const groups = groupSkills(candidates, groupKey);
  const selectedSkills = candidates.filter((skill) => selected.has(skill.id));
  const hasSelectedConflict = selectedSkills.some((skill) => importStateFor(skill) === "conflict");
  const canImport =
    destinationScan !== null &&
    selectedSkills.length > 0 &&
    (!hasSelectedConflict || replaceConflicts) &&
    !importing;
  const selectable = candidates.filter(
    (skill) =>
      importStateFor(skill) === "available" ||
      (importStateFor(skill) === "conflict" && replaceConflicts),
  );
  const allSelected = selectable.length > 0 && selectable.every((skill) => selected.has(skill.id));
  const someSelected = !allSelected && selectable.some((skill) => selected.has(skill.id));

  useEffect(() => {
    if (props.isOpen) return;
    setSelected(new Set());
    setExpanded(new Set());
    setDestinationId(props.defaultDestinationId);
    setAvailability("shared");
    setMode("copy");
    setReplaceConflicts(false);
  }, [props.defaultDestinationId, props.isOpen]);

  const updateSelected = (skill: SkillEntry, next: boolean) => {
    setSelected((current) => {
      const updated = new Set(current);
      if (next) updated.add(skill.id);
      else updated.delete(skill.id);
      return updated;
    });
  };

  const toggleAll = (next: boolean) => {
    setSelected(next ? new Set(selectable.map((skill) => skill.id)) : new Set());
  };

  const toggleGroup = (key: string) => {
    setExpanded((current) => {
      const updated = new Set(current);
      if (updated.has(key)) updated.delete(key);
      else updated.add(key);
      return updated;
    });
  };

  const importSelected = async () => {
    if (!canImport) return;
    setImporting(true);
    try {
      await readBridge().importSkills({
        skills: selectedSkills.map((skill) => ({
          sourcePath: skill.absolutePath,
          ...skillTargetRequest(destinationTarget),
          ...(props.sourceTarget.project
            ? { sourceProjectLocation: props.sourceTarget.project.location }
            : {}),
          ...(props.sourceTarget.wslDistro
            ? { sourceWslDistro: props.sourceTarget.wslDistro }
            : {}),
          destinationScope: destinationTarget.scope,
          availability,
          mode,
          replace: replaceConflicts,
        })),
      });
      toast.success(
        selectedSkills.length === 1
          ? t`Imported 1 skill.`
          : t`Imported ${selectedSkills.length} skills.`,
      );
      props.onOpenChange(false);
      await props.onImported();
    } catch {
      toast.danger(t`Couldn't import the selected skills.`);
    } finally {
      setImporting(false);
    }
  };

  const hostGlobalLabel = t(hostGlobalScopeLabel(readBridge().platform));
  const destinationLabel =
    destinationTarget.project?.name ?? destinationTarget.wslDistro ?? hostGlobalLabel;
  const canLink =
    props.sourceTarget.id === GLOBAL_MCP_DESTINATION_ID &&
    destinationTarget.id === GLOBAL_MCP_DESTINATION_ID &&
    props.scan.canLinkToGlobal;
  const modeOptions = [
    { id: "copy", label: t`Copy (recommended)` },
    ...(canLink ? [{ id: "link", label: t`Link to source` }] : []),
  ];
  const availabilityOptions = [
    { id: "shared", label: t`All agent apps` },
    { id: "poracode", label: t`Poracode only` },
  ];

  return (
    <Modal.Backdrop isOpen={props.isOpen} onOpenChange={props.onOpenChange}>
      <Modal.Container placement="center" scroll="inside" size="lg">
        <Modal.Dialog className="sm:max-w-[672px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>
              <Trans>Import external agent skills</Trans>
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex h-[min(32rem,65vh)] min-h-80 flex-col gap-3 p-4">
            <div className="flex items-end gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <span className="text-xs text-muted">
                  <Trans>Destination</Trans>
                </span>
                <McpProjectDestinationDropdown
                  ariaLabel={t`Import destination`}
                  placement="bottom end"
                  projects={props.projects}
                  wslDistros={props.wslDistros}
                  globalLabel={hostGlobalLabel}
                  value={destinationTarget.id}
                  trigger={
                    <Button
                      variant="ghost"
                      aria-label={t`Import destination`}
                      className="select__trigger w-full justify-between"
                    >
                      <span className="truncate">{destinationLabel}</span>
                      <ChevronDown className="size-3.5 shrink-0 text-muted" />
                    </Button>
                  }
                  onChange={(value) => {
                    setDestinationId(value);
                    setSelected(new Set());
                    setReplaceConflicts(false);
                    setMode("copy");
                  }}
                />
              </div>
              <Select
                aria-label={t`Skill availability`}
                className="flex-1"
                label={t`Availability`}
                options={availabilityOptions}
                value={availability}
                onChange={(value) => {
                  setAvailability(value === "poracode" ? "poracode" : "shared");
                  setSelected(new Set());
                  setReplaceConflicts(false);
                }}
              />
              <Select
                aria-label={t`Import method`}
                className="flex-1"
                label={t`Import method`}
                options={modeOptions}
                value={mode}
                onChange={(value) => setMode(value === "link" ? "link" : "copy")}
              />
            </div>
            <p className="text-xs text-muted">
              {mode === "link" ? (
                <Trans>
                  The skill stays synchronized with its source and stops working if the source
                  moves.
                </Trans>
              ) : (
                <Trans>
                  The skill is copied into the destination and can be changed independently.
                </Trans>
              )}
            </p>

            {candidates.length > 0 ? (
              <div className="flex items-center justify-between px-1">
                <Checkbox
                  aria-label={t`Select all skills`}
                  isSelected={allSelected}
                  isIndeterminate={someSelected}
                  isDisabled={selectable.length === 0}
                  onChange={toggleAll}
                >
                  <Checkbox.Content>
                    <Checkbox.Control className="border border-[var(--hairline-strong)] bg-surface-secondary shadow-none">
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <Trans>Select all</Trans>
                  </Checkbox.Content>
                </Checkbox>
                <span className="text-xs text-muted" aria-live="polite">
                  <Trans>
                    {selectedSkills.length}/{selectable.length} selected
                  </Trans>
                </span>
              </div>
            ) : null}

            <div
              id={groupsId}
              className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--hairline)]"
            >
              {candidates.length === 0 ? (
                <div className="flex h-full min-h-40 items-center justify-center px-4 text-center text-xs text-muted">
                  <Trans>No external skills were found in this scope.</Trans>
                </div>
              ) : (
                [...groups.entries()].map(([key, skills]) => {
                  const first = skills[0]!;
                  const isExpanded = expanded.has(key);
                  const scopeLabel = first.scopeLabel === "Global" ? t`Global` : first.scopeLabel;
                  const childListId = `${groupsId}-${key.replace(/[^a-z0-9_-]/giu, "-")}`;
                  return (
                    <div key={key} className="border-b border-[var(--hairline)] last:border-b-0">
                      <div className="flex min-h-11 items-center gap-2 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-baseline gap-2">
                            <span className="shrink-0 text-sm font-medium text-foreground">
                              {first.providerLabel}
                            </span>
                            <span className="shrink-0 rounded bg-surface-secondary px-1.5 py-0.5 text-[10px] text-muted">
                              {scopeLabel}
                            </span>
                            <span className="truncate font-mono text-xs text-muted">
                              {first.rootPath}
                            </span>
                            <span className="shrink-0 text-xs text-muted">
                              <Plural value={skills.length} one="# skill" other="# skills" />
                            </span>
                          </div>
                        </div>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          aria-label={
                            isExpanded
                              ? t`Hide skills from ${first.providerLabel}`
                              : t`Show skills from ${first.providerLabel}`
                          }
                          aria-expanded={isExpanded}
                          aria-controls={childListId}
                          onPress={() => toggleGroup(key)}
                        >
                          <ChevronRight
                            className={`size-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          />
                        </Button>
                      </div>
                      {isExpanded ? (
                        <div id={childListId} className="border-t border-[var(--hairline)] py-1">
                          {skills.map((skill) => {
                            const importState = importStateFor(skill);
                            const unavailable =
                              importState === "already-imported" ||
                              (importState === "conflict" && !replaceConflicts);
                            const stateLabel =
                              importState === "already-imported"
                                ? t`Already imported`
                                : importState === "conflict"
                                  ? t`Conflicts with a managed skill`
                                  : undefined;
                            return (
                              <Checkbox
                                key={skill.id}
                                aria-label={
                                  stateLabel
                                    ? t`${skill.name}: ${stateLabel}`
                                    : t`Select ${skill.name} from ${skill.providerLabel}`
                                }
                                className="block px-11 py-1.5"
                                isSelected={!unavailable && selected.has(skill.id)}
                                isDisabled={unavailable}
                                onChange={(next) => updateSelected(skill, next)}
                              >
                                <Checkbox.Content className="w-full min-w-0">
                                  <Checkbox.Control className="border border-[var(--hairline-strong)] bg-surface-secondary shadow-none">
                                    <Checkbox.Indicator />
                                  </Checkbox.Control>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm text-foreground">
                                      {skill.name}
                                    </span>
                                    {skill.description ? (
                                      <span className="block truncate text-xs text-muted">
                                        {skill.description}
                                      </span>
                                    ) : null}
                                  </span>
                                  {stateLabel ? (
                                    <span className="shrink-0 text-xs text-muted">
                                      {stateLabel}
                                    </span>
                                  ) : null}
                                </Checkbox.Content>
                              </Checkbox>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
            {candidates.some((skill) => importStateFor(skill) === "conflict") ? (
              <Checkbox isSelected={replaceConflicts} onChange={setReplaceConflicts}>
                <Checkbox.Content>
                  <Checkbox.Control className="border border-[var(--hairline-strong)] bg-surface-secondary shadow-none">
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Trans>Allow replacing conflicting managed skills</Trans>
                </Checkbox.Content>
              </Checkbox>
            ) : null}
          </Modal.Body>
          <Modal.Footer className="justify-between">
            <span className="text-xs text-muted" aria-live="polite">
              <Trans>
                Found{" "}
                <Plural
                  value={selectable.length}
                  one="# importable skill"
                  other="# importable skills"
                />
              </Trans>
            </span>
            <Button
              isPending={importing}
              isDisabled={!canImport}
              onPress={() => void importSelected()}
            >
              <Trans>Import selected</Trans>
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
