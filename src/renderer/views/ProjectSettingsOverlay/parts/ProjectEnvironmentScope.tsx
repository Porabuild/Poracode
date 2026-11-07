import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { AlertTriangle, Link2 } from "lucide-react";
import type { Project } from "@/shared/contracts";
import { openProjectSettings } from "@/renderer/actions/panelActions";
import {
  type ProjectEnvironmentMachine,
  useProjectEnvironmentMachines,
} from "@/renderer/components/common/ProjectEnvironment";
import { FloatingScopeBar } from "@/renderer/components/machineScope/FloatingScopeBar";
import { MachineScopeHeading } from "@/renderer/components/machineScope/MachineScopeHeading";
import { MachineSelect } from "@/renderer/components/machineScope/MachineSelect";
import { useProjectGroupStore } from "@/renderer/state/projectGroups/projectGroupStore";
import {
  linkGroupMembers,
  syncedMembers,
  unconfirmedMembers,
} from "@/renderer/state/projectGroups/projectGroups";
import { useProjectGroup } from "@/renderer/state/projectGroups/useProjectGroups";
import type { ProjectSettingsSection } from "./types";

/**
 * Space the floating machine picker needs below a section's last row. Sections
 * read it from the overlay through the `--project-settings-bottom-space` CSS
 * variable (see {@link PROJECT_SETTINGS_SCROLL_CLASS}).
 */
export const PROJECT_SETTINGS_SCOPE_BAR_SPACE = "5rem";

/** Scroll container shared by project settings sections. */
export const PROJECT_SETTINGS_SCROLL_CLASS =
  "h-full min-h-0 overflow-y-auto px-6 pt-4 pb-[var(--project-settings-bottom-space,2rem)]";

/**
 * Environment scope for project settings: the machine picker used by Settings
 * and Usage. It floats over the page on desktop and sits in the page flow on
 * compact layouts, where bottom actions own the screen edge. Choosing another
 * environment reopens settings for that environment's project row on the same
 * section. Renders nothing for a project on a single environment.
 */
export function ProjectEnvironmentScopeBar(props: {
  projectId: string;
  section: ProjectSettingsSection;
  placement: "floating" | "inline";
}) {
  const environments = useProjectEnvironmentMachines(props.projectId);
  const current = environments.find((entry) => entry.project.id === props.projectId);
  if (!current) return null;
  const select = (
    <MachineSelect
      machines={environments.map((entry) => entry.machine)}
      value={current.machine.id}
      onChange={(machine) => {
        const target = environments.find((entry) => entry.machine.id === machine.id);
        if (target && target.project.id !== props.projectId) {
          openProjectSettings(target.project.id, props.section);
        }
      }}
    />
  );
  if (props.placement === "inline") {
    return <div className="flex shrink-0 justify-center px-4 pt-3">{select}</div>;
  }
  return <FloatingScopeBar>{select}</FloatingScopeBar>;
}

/**
 * Group heading for project settings rows, in the Settings idiom: "All
 * machines" above shared settings, "On <machine>" above settings that belong
 * to this environment. Silent on a single environment.
 *
 * The shared heading also names environments that are grouped with this one
 * only because their names match. Shared settings are not written to them
 * until the user links them, so a same-named but unrelated project is never
 * changed by accident.
 */
export function ProjectScopeHeading(props: {
  projectId: string;
  scope: "environment" | "shared";
  className?: string;
}) {
  const environments = useProjectEnvironmentMachines(props.projectId);
  const group = useProjectGroup(props.projectId);
  const current = environments.find((entry) => entry.project.id === props.projectId);
  if (!current) return null;
  const unlinked =
    props.scope === "shared" && group
      ? labelsOf(environments, unconfirmedMembers(group, props.projectId))
      : [];
  const unlinkedNames = unlinked.join(", ");
  return (
    <div className={props.className}>
      <MachineScopeHeading
        scope={props.scope === "shared" ? "all" : "machine"}
        machineLabel={current.machine.label}
      />
      {unlinked.length > 0 && group ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-1 text-xs text-muted">
          <span>
            <Trans>Not shared with {unlinkedNames} yet: only the project name matches.</Trans>
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 min-h-6 gap-1 px-2 py-0 text-xs"
            onPress={() => {
              const store = useProjectGroupStore.getState();
              store.setOverrides(linkGroupMembers(store, group));
            }}
          >
            <Link2 className="size-3.5" />
            <Trans>Link as the same project</Trans>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Cross-environment awareness for a shared setting: names linked environments
 * whose value differs (edited elsewhere, or saved while that machine was
 * offline) and offers to write this environment's value to them. Same
 * treatment as the Agents page's "Needs attention on …" hint. The action is
 * unavailable while every differing machine is offline, since the write would
 * be skipped again.
 */
export function SharedValueDiff(props: {
  projectId: string;
  /** The setting's visible name, so each apply action has a distinct accessible name. */
  setting: string;
  read: (project: Project) => unknown;
  onApplyEverywhere: () => void;
}) {
  const { t } = useLingui();
  const environments = useProjectEnvironmentMachines(props.projectId);
  const group = useProjectGroup(props.projectId);
  const current = environments.find((entry) => entry.project.id === props.projectId);
  if (!current || !group) return null;
  const linked = new Set(syncedMembers(group, props.projectId).map((member) => member.id));
  const value = stableJson(props.read(current.project));
  const differing = environments.filter(
    (entry) =>
      entry !== current &&
      linked.has(entry.project.id) &&
      stableJson(props.read(entry.project)) !== value,
  );
  if (differing.length === 0) return null;
  // Same rule as the write: a connecting machine would be skipped too.
  const reachable = differing.some((entry) => entry.machine.status === "online");
  const setting = props.setting;
  const names = differing.map((entry) => entry.machine.label).join(", ");
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1.5">
      <p className="flex min-w-0 items-center gap-1.5 text-xs text-warning">
        <AlertTriangle className="size-3.5 shrink-0" />
        <span>
          <Trans>Differs on {names}</Trans>
        </span>
      </p>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 min-h-6 px-2 py-0 text-xs"
        isDisabled={!reachable}
        aria-label={t`Use this value everywhere for ${setting}`}
        onPress={props.onApplyEverywhere}
      >
        <Trans>Use this value everywhere</Trans>
      </Button>
      {reachable ? null : (
        <span className="text-xs text-muted">
          <Trans>Available when {names} is back online.</Trans>
        </span>
      )}
    </div>
  );
}

function labelsOf(
  environments: readonly ProjectEnvironmentMachine[],
  members: readonly Project[],
): string[] {
  const ids = new Set(members.map((member) => member.id));
  return environments
    .filter((entry) => ids.has(entry.project.id))
    .map((entry) => entry.machine.label);
}

/** JSON with sorted keys, so equal objects compare equal regardless of key order. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value ?? null, (_key, entry: unknown) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry as Record<string, unknown>).toSorted(([a], [b]) =>
            a.localeCompare(b),
          ),
        )
      : entry,
  );
}
