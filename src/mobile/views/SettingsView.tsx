import type { ReactNode } from "react";
import { Button, Surface } from "@heroui/react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  ArchiveRestore,
  Archive,
  Bell,
  Bot,
  Gauge,
  GitFork,
  Palette,
  Settings2,
  Sparkles,
  TerminalSquare,
  Trash2,
} from "lucide-react";
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
import { MOBILE_SETTINGS_SECTION_LABELS } from "../settingsSections";
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
          <Trans>No archived threads.</Trans>
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

interface SectionDef {
  readonly id: string;
  readonly label: MessageDescriptor;
  readonly hint: MessageDescriptor;
  readonly icon: ReactNode;
  readonly render: (handlers: SettingsThreadHandlers) => ReactNode;
}

interface SectionGroup {
  readonly title: MessageDescriptor;
  readonly hint: MessageDescriptor;
  readonly sections: readonly SectionDef[];
}

/**
 * Split by where a setting lives. "This device" keys persist in this
 * browser's storage and shape the PWA itself (the desktop has its own copies).
 * "Desktop" sections edit the paired desktop — AI helper choices sync over
 * the remote API and thread management round-trips through thread commands.
 * Sections that cannot function remotely (search indexing, remote-access
 * server, agent installs/auth, app updates) are omitted entirely.
 */
const SECTION_GROUPS: readonly SectionGroup[] = [
  {
    title: msg`This device`,
    hint: msg`Stored on this phone; the desktop keeps its own values.`,
    sections: [
      {
        id: "general",
        label: MOBILE_SETTINGS_SECTION_LABELS.general,
        hint: msg`Thread defaults and home scope`,
        icon: <Settings2 className="size-4" />,
        render: () => <GeneralSettings />,
      },
      {
        id: "appearance",
        label: MOBILE_SETTINGS_SECTION_LABELS.appearance,
        hint: msg`Theme and chat font size`,
        icon: <Palette className="size-4" />,
        render: () => <AppearanceSettings />,
      },
      {
        id: "notifications",
        label: MOBILE_SETTINGS_SECTION_LABELS.notifications,
        hint: msg`Alerts when threads need you`,
        icon: <Bell className="size-4" />,
        render: () => <NotificationSettings />,
      },
      {
        id: "terminal",
        label: MOBILE_SETTINGS_SECTION_LABELS.terminal,
        hint: msg`Fonts and scrolling`,
        icon: <TerminalSquare className="size-4" />,
        render: () => <TerminalSettings />,
      },
      {
        id: "git",
        label: MOBILE_SETTINGS_SECTION_LABELS.git,
        hint: msg`Review presentation`,
        icon: <GitFork className="size-4" />,
        render: () => <GitSettings />,
      },
      {
        id: "usage",
        label: MOBILE_SETTINGS_SECTION_LABELS.usage,
        hint: msg`Tracking and display`,
        icon: <Gauge className="size-4" />,
        render: () => <UsageSettings />,
      },
    ],
  },
  {
    title: msg`Desktop`,
    hint: msg`Edits the paired desktop and syncs back to it.`,
    sections: [
      {
        id: "ai",
        label: MOBILE_SETTINGS_SECTION_LABELS.ai,
        hint: msg`Title, commit, and conflict models`,
        icon: <Sparkles className="size-4" />,
        render: () => <AISettings />,
      },
      {
        id: "models",
        label: MOBILE_SETTINGS_SECTION_LABELS.models,
        hint: msg`Enabled agents, model visibility and order`,
        icon: <Bot className="size-4" />,
        render: () => <AgentsGeneralSettings />,
      },
      {
        id: "archived",
        label: MOBILE_SETTINGS_SECTION_LABELS.archived,
        hint: msg`Restore or delete`,
        icon: <Archive className="size-4" />,
        render: (handlers) => <RemoteArchivedThreads {...handlers} />,
      },
    ],
  },
];

const ALL_SECTIONS: readonly SectionDef[] = SECTION_GROUPS.flatMap((group) => group.sections);

/** PWA settings: a remote-safe section list, with each section opening as
 * its own page behind a back button. */
export function SettingsView(
  props: SettingsThreadHandlers & {
    /** Open section; the app header renders the back affordance and title. */
    readonly sectionId: string | null;
    readonly onSectionChange: (sectionId: string | null) => void;
  },
) {
  const { t } = useLingui();
  const section = props.sectionId ? ALL_SECTIONS.find((s) => s.id === props.sectionId) : undefined;

  if (section) {
    return (
      <div className="m-settings">
        <div className="m-settings__body">{section.render(props)}</div>
      </div>
    );
  }

  return (
    <div className="m-page">
      {SECTION_GROUPS.map((group) => (
        <div key={group.title.id} className="m-settings-group">
          <div className="m-settings-group__head">
            <strong>{t(group.title)}</strong>
            <span>{t(group.hint)}</span>
          </div>
          <div className="m-more-list">
            {group.sections.map((entry) => (
              <MoreRow
                key={entry.id}
                icon={entry.icon}
                label={t(entry.label)}
                hint={t(entry.hint)}
                onPress={() => props.onSectionChange(entry.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
