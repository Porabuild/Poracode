import { useState } from "react";
import { Button, Surface, Tooltip } from "@heroui/react";
import { ArchiveRestore, GitFork, Trash2 } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Thread } from "@/shared/contracts";
import { getBasename } from "@/shared/pathUtils";
import { ConfirmationPopover } from "@/renderer/components/common/ConfirmationPopover";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { useAppStore } from "@/renderer/state/appStore";
import { ThreadProviderIcon } from "@/renderer/components/providers/ThreadProviderIcon";
import {
  deleteThreadRecord,
  deleteThreadsAndOwnedWorktrees,
  unarchiveThread,
} from "@/renderer/actions/threadActions";
import { entityHost, type EntityHost } from "@/renderer/state/entityHost";
import { SettingsPage } from "./SettingsForm";
import {
  ArchivedThreadsMachinePicker,
  LOCAL_ARCHIVE_MACHINE_ID,
  useArchivedThreadsMachine,
  type ArchivedThreadsScopeProps,
} from "./ArchivedThreadsMachinePicker";

interface ArchivedThreadGroup {
  key: string;
  date: Date;
  threads: Thread[];
}

interface ClearTarget {
  key: string;
  label: string;
  threads: Thread[];
  owner?: EntityHost;
}

function groupArchivedThreads(threads: readonly Thread[]): ArchivedThreadGroup[] {
  const groups = new Map<string, ArchivedThreadGroup>();
  for (const thread of [...threads].sort((a, b) =>
    (b.archivedAt ?? b.updatedAt).localeCompare(a.archivedAt ?? a.updatedAt),
  )) {
    const date = new Date(thread.archivedAt ?? thread.updatedAt);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const group = groups.get(key);
    if (group) group.threads.push(thread);
    else groups.set(key, { key, date, threads: [thread] });
  }
  return [...groups.values()];
}

export function ArchivedThreadsSettings(props: ArchivedThreadsScopeProps) {
  const { i18n, t } = useLingui();
  const compactLayout = useCompactLayout();
  const threads = useAppStore((s) => s.threads);
  const projects = useAppStore((s) => s.projects);
  const {
    options,
    selectedMachine,
    unavailable: selectedMachineUnavailable,
    canOperate,
    remoteSession,
  } = useArchivedThreadsMachine(props.machineId);
  const [clearTarget, setClearTarget] = useState<ClearTarget | null>(null);
  const selectedMachineId = selectedMachine?.id;
  const archivedThreads = threads.filter(
    (thread) =>
      selectedMachineId !== undefined &&
      thread.archived &&
      (selectedMachineId === LOCAL_ARCHIVE_MACHINE_ID
        ? thread.remoteServerId === undefined
        : thread.remoteServerId === selectedMachineId),
  );
  const groups = groupArchivedThreads(archivedThreads);
  const selectedMachineLabel = selectedMachine?.label ?? "";
  const dateFormatter = new Intl.DateTimeFormat(i18n.locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat(i18n.locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  const clearThreads = (target: ClearTarget) => {
    setClearTarget(null);
    if (!canOperate) return;
    if (!remoteSession) {
      deleteThreadsAndOwnedWorktrees(target.threads);
      return;
    }
    // Keep confirmation tied to the original pairing and drop it if the
    // desktop or archived row changed while the popover was open.
    if (!target.owner?.isCurrent() || target.owner.connectionKey !== selectedMachineId) return;
    const current = useAppStore
      .getState()
      .threads.find(
        (row) =>
          row.id === target.threads[0]?.id &&
          row.remoteServerId === selectedMachineId &&
          row.archived,
      );
    if (current) void deleteThreadRecord(current).catch(() => undefined);
  };
  const clearConfirmationBody = clearTarget ? (
    <>
      {t`Permanently delete the selected archive entries from ${clearTarget.label}.`}
      {!remoteSession && clearTarget.threads.some((thread) => thread.worktreePath) ? (
        <span className="mt-1 block">
          <Trans>Associated worktrees with no remaining threads will also be removed.</Trans>
        </span>
      ) : null}
    </>
  ) : null;

  return (
    <SettingsPage
      title={t`Archived Threads`}
      bodyClassName=""
      actions={
        !remoteSession && (
          <ConfirmationPopover
            isOpen={clearTarget?.key === "all"}
            onOpenChange={(isOpen) =>
              setClearTarget(
                isOpen
                  ? { key: "all", label: selectedMachineLabel, threads: archivedThreads }
                  : null,
              )
            }
            title={t`Delete archived threads?`}
            body={clearConfirmationBody}
            placement="bottom end"
            actions={[
              {
                label: t`Delete`,
                variant: "danger",
                onPress: () => clearTarget && clearThreads(clearTarget),
              },
            ]}
            trigger={
              <Button
                size="sm"
                variant="secondary"
                isDisabled={archivedThreads.length === 0 || !canOperate}
              >
                <Trash2 className="size-4" />
                <Trans>Clear all</Trans>
              </Button>
            }
          />
        )
      }
    >
      {compactLayout && options.length > 1 ? (
        <div className="mb-6">
          <ArchivedThreadsMachinePicker {...props} />
        </div>
      ) : null}
      {selectedMachineUnavailable ? (
        <p className="mb-6 text-xs text-warning">
          <Trans>
            The selected machine is unavailable. Reconnect it to manage archived threads.
          </Trans>
        </p>
      ) : null}
      {archivedThreads.length === 0 ? (
        <p className="text-sm text-muted">
          <Trans>No archived threads.</Trans>
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => {
            const dateLabel = dateFormatter.format(group.date);
            return (
              <section key={group.key}>
                <div className="mb-2 flex items-center justify-between gap-3 px-1">
                  <h2 className="text-xs font-semibold text-muted">{dateLabel}</h2>
                  {!remoteSession && (
                    <ConfirmationPopover
                      isOpen={clearTarget?.key === group.key}
                      onOpenChange={(isOpen) =>
                        setClearTarget(
                          isOpen
                            ? { key: group.key, label: dateLabel, threads: group.threads }
                            : null,
                        )
                      }
                      title={t`Delete archived threads?`}
                      body={clearConfirmationBody}
                      actions={[
                        {
                          label: t`Delete`,
                          variant: "danger",
                          onPress: () => clearTarget && clearThreads(clearTarget),
                        },
                      ]}
                      trigger={
                        <Button
                          size="sm"
                          variant="ghost"
                          isDisabled={!canOperate}
                          aria-label={t`Clear archived threads from ${dateLabel}`}
                        >
                          <Trash2 className="size-3.5" />
                          <Trans>Clear day</Trans>
                        </Button>
                      }
                    />
                  )}
                </div>
                <Surface variant="secondary" className="content-surface-group">
                  {group.threads.map((thread) => {
                    const project = projects.find((p) => p.id === thread.projectId);
                    const archivedTime = timeFormatter.format(
                      new Date(thread.archivedAt ?? thread.updatedAt),
                    );
                    const worktreeLabel = thread.worktreePath
                      ? (thread.worktreeBranch ?? getBasename(thread.worktreePath))
                      : undefined;
                    return (
                      <div key={thread.id} className="flex items-center gap-3 px-4 py-3">
                        <ThreadProviderIcon
                          thread={thread}
                          tone="inactive"
                          className="size-4 shrink-0 text-muted"
                        />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <p className="truncate text-sm font-medium text-foreground">
                            {thread.title}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {project ? `${project.name} · ` : ""}
                            {t`Archived at ${archivedTime}`}
                          </p>
                          {worktreeLabel ? (
                            <p className="flex items-center gap-1 truncate text-xs text-muted">
                              <GitFork className="size-3 shrink-0" aria-hidden />
                              <span className="truncate">{t`Worktree: ${worktreeLabel}`}</span>
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Tooltip delay={150}>
                            <Tooltip.Trigger>
                              <Button
                                variant="ghost"
                                size="sm"
                                isIconOnly
                                isDisabled={!canOperate}
                                aria-label={t`Restore thread`}
                                onPress={() => unarchiveThread(thread.id)}
                              >
                                <ArchiveRestore className="size-4" />
                              </Button>
                            </Tooltip.Trigger>
                            <Tooltip.Content>
                              <Trans>Restore thread</Trans>
                            </Tooltip.Content>
                          </Tooltip>
                          <ConfirmationPopover
                            isOpen={clearTarget?.key === `thread:${thread.id}`}
                            onOpenChange={(isOpen) => {
                              const owner =
                                remoteSession && isOpen ? entityHost(thread) : undefined;
                              setClearTarget(
                                isOpen
                                  ? {
                                      key: `thread:${thread.id}`,
                                      label: selectedMachineLabel,
                                      threads: [thread],
                                      ...(owner ? { owner } : {}),
                                    }
                                  : null,
                              );
                            }}
                            title={t`Delete archived thread?`}
                            body={clearConfirmationBody}
                            actions={[
                              {
                                label: t`Delete`,
                                variant: "danger",
                                onPress: () => clearTarget && clearThreads(clearTarget),
                              },
                            ]}
                            trigger={
                              <Button
                                variant="ghost"
                                size="sm"
                                isIconOnly
                                isDisabled={!canOperate}
                                aria-label={t`Delete thread`}
                              >
                                <Trash2 className="size-4 text-danger" />
                              </Button>
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </Surface>
              </section>
            );
          })}
        </div>
      )}
    </SettingsPage>
  );
}
