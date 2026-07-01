import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  ChevronRight,
  Folder,
  FolderPlus,
  GitBranch,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import type { Project } from "@/shared/contracts";
import { cloneFolderNameFromUrl } from "@/shared/createProject";
import { useAsyncOperation } from "@/renderer/hooks/useAsyncOperation";
import {
  remoteServerStatusDotClass,
  useRemoteServersStore,
  type RemoteServerRecord,
  type RemoteServerStatus,
} from "@/renderer/state/remoteServersStore";
import { SettingsPage } from "./SettingsForm";

const INPUT_CLASS =
  "w-full rounded-lg border border-default-200 bg-default-50 px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted/50 focus:border-default-400";

/** "http://172.16.21.25:38987/" → "172.16.21.25:38987". */
function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

function useStatusLabel(status: RemoteServerStatus): string {
  const { t } = useLingui();
  if (status === "online") return t`Online`;
  if (status === "connecting") return t`Connecting…`;
  if (status === "error") return t`Connection error`;
  return t`Offline`;
}

function projectPath(project: Project): string {
  return "path" in project.location ? project.location.path : project.location.uncPath;
}

/** Compact bare input used across the remote-server forms. */
function CompactInput(props: {
  readonly value: string;
  readonly placeholder: string;
  readonly ariaLabel: string;
  readonly onChange: (value: string) => void;
  readonly inputMode?: "url" | "text";
  readonly onEnter?: () => void;
}) {
  return (
    <input
      className={INPUT_CLASS}
      value={props.value}
      aria-label={props.ariaLabel}
      placeholder={props.placeholder}
      inputMode={props.inputMode ?? "text"}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      onChange={(event) => props.onChange(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && props.onEnter) {
          event.preventDefault();
          props.onEnter();
        }
      }}
    />
  );
}

/** Reveal-on-click "add folder" / "clone repo" affordances for one server. */
function ManageProjects({ desktopId }: { readonly desktopId: string }) {
  const { t } = useLingui();
  const runProjectCommand = useRemoteServersStore((s) => s.runProjectCommand);
  const { busy, error, run } = useAsyncOperation();
  const [mode, setMode] = useState<"none" | "folder" | "clone">("none");
  const [folderPath, setFolderPath] = useState("");
  const [cloneParent, setCloneParent] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const cloneName = cloneFolderNameFromUrl(cloneUrl);

  const reset = () => {
    setMode("none");
    setFolderPath("");
    setCloneParent("");
    setCloneUrl("");
  };

  const addFolder = () =>
    run(async () => {
      await runProjectCommand(desktopId, { kind: "add-existing", path: folderPath.trim() });
      reset();
    });
  const clone = () =>
    run(async () => {
      await runProjectCommand(desktopId, {
        kind: "clone",
        parentPath: cloneParent.trim(),
        name: cloneName,
        source: { kind: "url", url: cloneUrl.trim() },
      });
      reset();
    });

  if (mode === "none") {
    return (
      <div className="flex gap-1 pl-5 pt-0.5">
        <Button variant="ghost" size="sm" onPress={() => setMode("folder")}>
          <FolderPlus className="size-3.5" />
          <Trans>Add folder</Trans>
        </Button>
        <Button variant="ghost" size="sm" onPress={() => setMode("clone")}>
          <GitBranch className="size-3.5" />
          <Trans>Clone repo</Trans>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 pl-5 pt-1">
      {mode === "folder" ? (
        <div className="flex items-center gap-1.5">
          <CompactInput
            value={folderPath}
            ariaLabel={t`Folder path on the server`}
            placeholder={t`/absolute/path/to/project`}
            onChange={setFolderPath}
            onEnter={addFolder}
          />
          <Button
            variant="tertiary"
            size="sm"
            isDisabled={busy || !folderPath.trim()}
            onPress={addFolder}
          >
            <Trans>Add</Trans>
          </Button>
          <Button variant="ghost" size="sm" isIconOnly aria-label={t`Cancel`} onPress={reset}>
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <>
          <CompactInput
            value={cloneParent}
            ariaLabel={t`Parent folder`}
            placeholder={t`Parent folder, e.g. /home/me/projects`}
            onChange={setCloneParent}
          />
          <div className="flex items-center gap-1.5">
            <CompactInput
              value={cloneUrl}
              ariaLabel={t`Repository URL`}
              placeholder="https://github.com/owner/repo.git"
              inputMode="url"
              onChange={setCloneUrl}
              onEnter={clone}
            />
            <Button
              variant="tertiary"
              size="sm"
              isDisabled={busy || !cloneParent.trim() || !cloneName}
              onPress={clone}
            >
              <Trans>Clone</Trans>
            </Button>
            <Button variant="ghost" size="sm" isIconOnly aria-label={t`Cancel`} onPress={reset}>
              <X className="size-4" />
            </Button>
          </div>
        </>
      )}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function RemoteServerRow({ server }: { readonly server: RemoteServerRecord }) {
  const { t } = useLingui();
  const runtime = useRemoteServersStore((s) => s.runtime[server.desktopId]);
  const refreshServer = useRemoteServersStore((s) => s.refreshServer);
  const removeServer = useRemoteServersStore((s) => s.removeServer);
  const runProjectCommand = useRemoteServersStore((s) => s.runProjectCommand);
  const { busy, run } = useAsyncOperation();
  const [expanded, setExpanded] = useState(false);

  const status = runtime?.status ?? "offline";
  const statusLabel = useStatusLabel(status);
  const canManage = server.scopes.includes("projects:manage");
  const projects = runtime?.projects ?? [];

  return (
    <div className="border-b border-[var(--hairline)] last:border-b-0">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-default-100/60"
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronRight
            className={`size-3.5 shrink-0 text-muted transition-transform ${expanded ? "rotate-90" : ""}`}
          />
          <span
            className={`size-1.5 shrink-0 rounded-full ${remoteServerStatusDotClass(status)}`}
            title={statusLabel}
          />
          <span className="truncate text-sm text-foreground">{server.label}</span>
          {status !== "online" ? (
            <span className="shrink-0 text-xs text-muted">{statusLabel}</span>
          ) : null}
          <span className="truncate text-xs text-muted/70">{endpointHost(server.endpoint)}</span>
        </button>
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          aria-label={t`Refresh`}
          isDisabled={busy}
          onPress={() => run(() => refreshServer(server.desktopId))}
        >
          <RefreshCw className={`size-3.5 ${status === "connecting" ? "animate-spin" : ""}`} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          aria-label={t`Disconnect server`}
          onPress={() => removeServer(server.desktopId)}
        >
          <Trash2 className="size-3.5 text-danger" />
        </Button>
      </div>

      {expanded ? (
        <div className="space-y-0.5 pb-2 pl-3 pr-2">
          {runtime?.status === "error" && runtime.message ? (
            <p className="pl-5 text-xs text-danger">{runtime.message}</p>
          ) : null}
          {projects.length === 0 ? (
            <p className="pl-5 text-xs text-muted">
              <Trans>No projects on this server.</Trans>
            </p>
          ) : (
            projects.map((project) => (
              <div
                key={project.id}
                className="group flex items-center gap-2 rounded-md py-0.5 pl-5"
              >
                <Folder className="size-3.5 shrink-0 text-muted" />
                <span className="truncate text-sm text-foreground">{project.name}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted/70">
                  {projectPath(project)}
                </span>
                {canManage ? (
                  <button
                    type="button"
                    className="hidden shrink-0 rounded p-0.5 text-muted hover:text-danger group-hover:block"
                    aria-label={t`Remove project`}
                    onClick={() =>
                      run(() =>
                        runProjectCommand(server.desktopId, {
                          kind: "remove",
                          projectId: project.id,
                        }),
                      )
                    }
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
            ))
          )}
          {canManage ? (
            <ManageProjects desktopId={server.desktopId} />
          ) : (
            <p className="pl-5 pt-0.5 text-xs text-muted/70">
              <Trans>View-only — this connection can't manage projects.</Trans>
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function RemoteServersSettings() {
  const { t } = useLingui();
  const servers = useRemoteServersStore((s) => s.servers);
  const pairServer = useRemoteServersStore((s) => s.pairServer);
  const connectAll = useRemoteServersStore((s) => s.connectAll);

  // Reconnect persisted servers when the panel opens so their projects are live.
  useEffect(() => {
    void connectAll();
  }, [connectAll]);

  const [adding, setAdding] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [token, setToken] = useState("");
  const { busy: pairing, error, run } = useAsyncOperation();

  const canConnect = !pairing && endpoint.trim().length > 0 && token.trim().length > 0;
  const onPair = () => {
    if (!canConnect) return;
    run(async () => {
      await pairServer({ endpoint, token });
      await connectAll();
      setEndpoint("");
      setToken("");
      setAdding(false);
    });
  };

  return (
    <SettingsPage
      title={t`Remote Servers`}
      description={t`Connect to another Lightcode desktop or a headless server to browse and manage its projects from here. Get its endpoint and pairing token from Settings → Remote Access on that machine.`}
      bodyClassName="space-y-3"
    >
      {servers.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
          {servers.map((server) => (
            <RemoteServerRow key={server.desktopId} server={server} />
          ))}
        </div>
      ) : null}

      {adding ? (
        <div className="flex flex-col gap-2 rounded-xl border border-[var(--hairline)] p-3">
          <CompactInput
            value={endpoint}
            ariaLabel={t`Endpoint`}
            placeholder={t`Endpoint, e.g. http://192.168.1.20:38987/`}
            inputMode="url"
            onChange={setEndpoint}
            onEnter={onPair}
          />
          <CompactInput
            value={token}
            ariaLabel={t`Pairing token`}
            placeholder="lc_pair_…"
            onChange={setToken}
            onEnter={onPair}
          />
          <div className="flex items-center gap-2">
            <Button variant="tertiary" size="sm" isDisabled={!canConnect} onPress={onPair}>
              {pairing ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
              {pairing ? <Trans>Connecting…</Trans> : <Trans>Connect</Trans>}
            </Button>
            <Button variant="ghost" size="sm" isDisabled={pairing} onPress={() => setAdding(false)}>
              <Trans>Cancel</Trans>
            </Button>
            {error ? <span className="min-w-0 truncate text-xs text-danger">{error}</span> : null}
          </div>
        </div>
      ) : (
        <Button variant="tertiary" size="sm" onPress={() => setAdding(true)}>
          <Plus className="size-4" />
          <Trans>Connect a server</Trans>
        </Button>
      )}

      {servers.length === 0 && !adding ? (
        <p className="text-xs text-muted">
          <Trans>No servers connected yet.</Trans>
        </p>
      ) : null}
    </SettingsPage>
  );
}
