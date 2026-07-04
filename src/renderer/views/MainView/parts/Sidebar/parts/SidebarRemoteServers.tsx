import { Trans, useLingui } from "@lingui/react/macro";
import { Laptop, Server, Square, X } from "lucide-react";
import { isThreadTurnActive, type Thread } from "@/shared/contracts";
import {
  remoteServerStatusDotClass,
  useRemoteServersStore,
} from "@/renderer/state/remoteServersStore";
import { usePanelStore } from "@/renderer/state/panelStore";

/**
 * Read-only sidebar section listing the projects (and their threads) of every
 * connected remote server (desktop-as-client; see docs/REMOTE_ARCHITECTURE.md,
 * Phase 4). The server list + snapshots come from `useRemoteServersStore`;
 * connections are (re)established on app start. Project rows open the Remote
 * Servers settings panel; thread rows expose interrupt/close so a running agent
 * on the remote can be operated from here. Live chat for remote threads is the
 * remaining integration (it reuses the local thread views via a routed bridge).
 */
function statusDotTone(status: Thread["status"]): string {
  if (status === "error") return "bg-danger";
  if (isThreadTurnActive(status)) return "bg-warning";
  return "bg-default-400";
}

export function SidebarRemoteServers() {
  const { t } = useLingui();
  const servers = useRemoteServersStore((s) => s.servers);
  const runtime = useRemoteServersStore((s) => s.runtime);
  const openSettingsSection = usePanelStore((s) => s.openSettingsSection);
  const interruptThread = useRemoteServersStore((s) => s.interruptThread);
  const closeThread = useRemoteServersStore((s) => s.closeThread);
  const openRemoteThread = useRemoteServersStore((s) => s.openRemoteThread);

  if (servers.length === 0) return null;

  return (
    <section className="mt-3 flex flex-col gap-0.5 px-2">
      <button
        type="button"
        className="flex items-center gap-1.5 px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-foreground"
        onClick={() => openSettingsSection("remoteServers")}
        title={t`Manage remote servers`}
      >
        <Server className="size-3" />
        <Trans>Remote servers</Trans>
      </button>

      {servers.map((server) => {
        const state = runtime[server.desktopId];
        const projects = state?.projects ?? [];
        // Group threads by project once (O(threads)) instead of re-scanning the
        // thread list for every project (O(projects × threads)).
        const threadsByProjectId = new Map<string, Thread[]>();
        for (const thread of state?.threads ?? []) {
          if (thread.archived) continue;
          const list = threadsByProjectId.get(thread.projectId);
          if (list) list.push(thread);
          else threadsByProjectId.set(thread.projectId, [thread]);
        }
        return (
          <div key={server.desktopId} className="flex flex-col">
            <div className="flex items-center gap-1.5 px-1 py-0.5 text-xs text-muted">
              <span
                className={`size-1.5 shrink-0 rounded-full ${remoteServerStatusDotClass(state?.status)}`}
              />
              <Laptop className="size-3 shrink-0" />
              <span className="truncate">{server.label}</span>
            </div>

            {projects.length === 0 ? (
              <span className="px-2 py-1 pl-6 text-xs text-muted/70">
                <Trans>No projects</Trans>
              </span>
            ) : (
              projects.map((project) => {
                const projectThreads = threadsByProjectId.get(project.id) ?? [];
                return (
                  <div key={project.id} className="flex flex-col">
                    <button
                      type="button"
                      className="flex items-center rounded-md px-2 py-1 pl-6 text-left text-sm text-foreground hover:bg-default-100"
                      onClick={() => openSettingsSection("remoteServers")}
                      title={project.name}
                    >
                      <span className="truncate">{project.name}</span>
                    </button>
                    {projectThreads.map((thread) => (
                      <div
                        key={thread.id}
                        className="group flex items-center gap-1.5 rounded-md py-0.5 pr-1 pl-9 text-xs text-muted hover:bg-default-100"
                      >
                        <span
                          className={`size-1.5 shrink-0 rounded-full ${statusDotTone(thread.status)}`}
                        />
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left hover:text-foreground"
                          title={t`Open ${thread.title}`}
                          onClick={() => void openRemoteThread(server.desktopId, thread.id)}
                        >
                          {thread.title}
                        </button>
                        {isThreadTurnActive(thread.status) ? (
                          <button
                            type="button"
                            className="hidden shrink-0 rounded p-0.5 text-muted hover:text-foreground group-hover:block"
                            aria-label={t`Interrupt`}
                            onClick={() => void interruptThread(server.desktopId, thread.id)}
                          >
                            <Square className="size-3" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="hidden shrink-0 rounded p-0.5 text-muted hover:text-danger group-hover:block"
                          aria-label={t`Close thread`}
                          onClick={() => void closeThread(server.desktopId, thread.id)}
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        );
      })}
    </section>
  );
}
