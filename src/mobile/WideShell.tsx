import { Button } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Ellipsis, Gauge, Plus, Server } from "lucide-react";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { ConnectionBanner } from "./components";
import { Brand, ConnectionControl } from "./NarrowShell";
import { preselectWorktreeDraft, threadIdFromPath } from "./navHelpers";
import type { RemoteDesktopSession } from "./useRemoteDesktop";
import { ThreadsView } from "./views/ThreadsView";

/** Tablet/desktop chrome: a persistent thread sidebar + the routed detail pane. */
export function WideShell(props: {
  readonly remote: RemoteDesktopSession;
  readonly pathname: string;
  readonly projectFilter: string | null;
  readonly setProjectFilter: (next: string | null) => void;
}) {
  const { remote, pathname, projectFilter, setProjectFilter } = props;
  const navigate = useNavigate();
  const { t } = useLingui();
  const selectedThreadId = threadIdFromPath(pathname);

  return (
    <div className="m-shell m-shell--wide">
      <aside className="m-sidebar">
        <header className="m-sidebar__head">
          <Brand
            subtitle={remote.activeDesktop?.label}
            onPress={() => void navigate({ to: "/threads" })}
          />
          <ConnectionControl remote={remote} onPair={() => void navigate({ to: "/desktops" })} />
        </header>
        <div className="m-sidebar__actions">
          <Button
            className="flex-1 text-white"
            size="sm"
            variant="secondary"
            onPress={() => void navigate({ to: "/new" })}
          >
            <Plus className="size-4" />
            <Trans>New thread</Trans>
          </Button>
          <Button
            aria-label={t`Usage`}
            className="text-foreground"
            size="sm"
            variant="secondary"
            isIconOnly
            onPress={() => void navigate({ to: "/more/usage" })}
          >
            <Gauge className="size-4" />
          </Button>
          <Button
            aria-label={t`More`}
            className="text-foreground"
            size="sm"
            variant="secondary"
            isIconOnly
            onPress={() => void navigate({ to: "/more" })}
          >
            <Ellipsis className="size-4" />
          </Button>
        </div>
        <div className="m-sidebar__scroll">
          <ThreadsView
            projects={remote.projects}
            threads={remote.threads}
            selectedThreadId={selectedThreadId}
            projectFilter={projectFilter}
            loading={!remote.booted}
            onProjectFilterChange={setProjectFilter}
            onOpenThread={(thread) => {
              void remote.openThread(thread);
              void navigate({ to: "/thread/$threadId", params: { threadId: thread.id } });
            }}
            onThreadAction={(thread, action) => {
              void remote.applyThreadAction(thread, action);
            }}
            onDeleteWorktreeGroup={(input) => {
              void remote.deleteWorktreeGroup(input);
            }}
            onNew={() => void navigate({ to: "/new" })}
            onNewThreadInWorktree={(input) => {
              preselectWorktreeDraft(input);
              void navigate({ to: "/new" });
            }}
            onOpenTerminal={(input) =>
              void navigate({
                to: "/terminal/$projectId",
                params: { projectId: input.projectId },
                search: {
                  ...(input.sourceThreadId ? { fromThread: input.sourceThreadId } : {}),
                  ...(input.worktreePath ? { worktree: input.worktreePath } : {}),
                },
              })
            }
            onRunProjectAction={(input) =>
              void navigate({
                to: "/terminal/$projectId",
                params: { projectId: input.projectId },
                search: {
                  action: input.actionId,
                  ...(input.sourceThreadId ? { fromThread: input.sourceThreadId } : {}),
                  ...(input.worktreePath ? { worktree: input.worktreePath } : {}),
                },
              })
            }
          />
        </div>
        <footer className="m-sidebar__foot">
          <button
            type="button"
            className="m-sidebar__desktops"
            data-active={pathname === "/desktops"}
            onClick={() => void navigate({ to: "/desktops" })}
          >
            <Server className="size-4" />
            <span>
              <strong>{remote.activeDesktop?.label ?? t`No connection paired`}</strong>
              <span>
                <Plural
                  value={remote.desktops.length}
                  one="# paired desktop"
                  other="# paired desktops"
                />
              </span>
            </span>
          </button>
        </footer>
      </aside>
      <main className="m-detail">
        <ConnectionBanner
          state={remote.connection}
          message={remote.message}
          onReconnect={remote.reconnect}
          onPair={() => void navigate({ to: "/desktops" })}
        />
        <Outlet />
      </main>
    </div>
  );
}
