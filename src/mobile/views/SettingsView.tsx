import type { ReactNode } from "react";
import { Button, Surface } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArchiveRestore, Trash2 } from "lucide-react";
import type { Project, Thread } from "@/shared/contracts";
import { AISettings } from "@/renderer/views/SettingsOverlay/parts/AISettings";
import { AppearanceSettings } from "@/renderer/views/SettingsOverlay/parts/AppearanceSettings";
import { AgentsGeneralSettings } from "@/renderer/views/SettingsOverlay/parts/AgentsGeneralSettings";
import { GeneralSettings } from "@/renderer/views/SettingsOverlay/parts/GeneralSettings";
import { GitSettings } from "@/renderer/views/SettingsOverlay/parts/GitSettings";
import { NotificationSettings } from "@/renderer/views/SettingsOverlay/parts/NotificationSettings";
import { SettingsPage } from "@/renderer/views/SettingsOverlay/parts/SettingsForm";
import { TerminalSettings } from "@/renderer/views/SettingsOverlay/parts/TerminalSettings";
import { ThreadProviderIcon } from "@/renderer/components/providers/ThreadProviderIcon";
import { UsageSettings } from "@/renderer/views/SettingsOverlay/parts/UsageSettings";
import { MoreRow } from "../components";
import { DESKTOP_SETTINGS_SECTIONS, type MobileSettingsSectionId } from "../settingsSections";
import type { ThreadAction } from "../useRemoteDesktop";

export interface SettingsThreadHandlers {
  readonly threads: readonly Thread[];
  readonly projects: readonly Project[];
  readonly onThreadAction: (thread: Thread, action: ThreadAction) => void;
}

/**
 * Archived-thread management for remote sessions. The desktop section writes
 * through the renderer store directly; here restore/delete must round-trip
 * through the remote thread-command API so the desktop actually applies them.
 */
function RemoteArchivedThreads(props: SettingsThreadHandlers) {
  const { t } = useLingui();
  const archivedThreads = props.threads.filter((thread) => thread.archived);

  return (
    <SettingsPage title={t`Archived Threads`} bodyClassName="">
      {archivedThreads.length === 0 ? (
        <p className="text-sm text-muted">
          <Trans>
            Archived threads are managed from the desktop app. Restoring or deleting them from this
            device isn&apos;t available yet.
          </Trans>
        </p>
      ) : (
        <Surface variant="secondary" className="divide-y divide-[var(--hairline)] rounded-xl">
          {archivedThreads.map((thread) => {
            const project = props.projects.find((p) => p.id === thread.projectId);
            return (
              <div key={thread.id} className="flex items-center gap-3 px-4 py-3">
                <ThreadProviderIcon
                  thread={thread}
                  tone="inactive"
                  className="size-4 shrink-0 text-muted"
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate text-sm font-medium text-foreground">{thread.title}</p>
                  {project && <p className="truncate text-xs text-muted">{project.name}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="tertiary"
                    size="sm"
                    isIconOnly
                    aria-label={t`Restore thread`}
                    onPress={() => props.onThreadAction(thread, { kind: "unarchive" })}
                  >
                    <ArchiveRestore className="size-4" />
                  </Button>
                  <Button
                    variant="tertiary"
                    size="sm"
                    isIconOnly
                    aria-label={t`Delete thread`}
                    onPress={() => props.onThreadAction(thread, { kind: "delete" })}
                  >
                    <Trash2 className="size-4 text-danger" />
                  </Button>
                </div>
              </div>
            );
          })}
        </Surface>
      )}
    </SettingsPage>
  );
}

/** Section pages for every remote-safe section id (the section metadata —
 * labels, hints, icons, device/desktop grouping — lives in settingsSections.ts
 * so the eager More tab can list sections without pulling these parts in). */
const SECTION_RENDERERS: Record<
  MobileSettingsSectionId,
  (handlers: SettingsThreadHandlers) => ReactNode
> = {
  general: () => <GeneralSettings />,
  appearance: () => <AppearanceSettings />,
  notifications: () => <NotificationSettings />,
  terminal: () => <TerminalSettings />,
  git: () => <GitSettings />,
  usage: () => <UsageSettings />,
  ai: () => <AISettings />,
  models: () => <AgentsGeneralSettings />,
  archived: (handlers) => <RemoteArchivedThreads {...handlers} />,
};

/** PWA settings behind the More tab. With no section id this is the Desktop
 * Settings subscreen (device sections are flattened into the More tab itself);
 * with one, that section renders as its own page behind a back button. */
export function SettingsView(
  props: SettingsThreadHandlers & {
    /** Open section; the app header renders the back affordance and title. */
    readonly sectionId: string | null;
    readonly onSectionChange: (sectionId: string | null) => void;
  },
) {
  const { t } = useLingui();
  const renderSection = props.sectionId
    ? SECTION_RENDERERS[props.sectionId as MobileSettingsSectionId]
    : undefined;

  if (renderSection) {
    return (
      <div className="m-settings">
        <div className="m-settings__body">{renderSection(props)}</div>
      </div>
    );
  }

  return (
    <div className="m-page">
      <div className="m-settings-group">
        <div className="m-settings-group__head">
          <span>
            <Trans>Edits the paired desktop and syncs back to it.</Trans>
          </span>
        </div>
        <div className="m-more-list">
          {DESKTOP_SETTINGS_SECTIONS.map((section) => (
            <MoreRow
              key={section.id}
              icon={<section.icon className="size-4" />}
              label={t(section.label)}
              hint={t(section.hint)}
              onPress={() => props.onSectionChange(section.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
