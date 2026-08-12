import { lazy, Suspense, type Ref, useEffect, useRef, useState } from "react";
import { Button, Dropdown, Input, Label, Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  Check,
  Ellipsis,
  FolderOpen,
  FolderPlus,
  FilePlus,
  GitBranch,
  Laptop,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  X,
} from "lucide-react";
import { cloneFolderNameFromUrl } from "@/shared/createProject";
import { hasClientCapability } from "@/renderer/clientRuntime";
import { useAsyncOperation } from "@/renderer/hooks/useAsyncOperation";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { desktopTitle } from "@/shared/remote/desktopLabel";
import { normalizePairingEndpoint, parsePairingUrlParts } from "@/shared/remote/pairingUrl";
import {
  RemoteServerStatusDot,
  useRemoteServerStatusLabel,
} from "@/renderer/components/common/RemoteServerStatusDot";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { RemoteServerProjectList } from "./RemoteServerProjectList";
import { SettingsPage } from "./SettingsForm";
import { RemoteHostFolderPicker } from "./RemoteHostFolderPicker";
import { RemoteHostUpdateControl } from "./RemoteHostUpdateControl";
import { MobileRemoteServersSettings } from "./MobileRemoteServersSettings";

const SshConnectionForm = lazy(() =>
  import("./SshConnectionForm").then((module) => ({ default: module.SshConnectionForm })),
);

const INPUT_CLASS =
  "w-full !rounded-xl border border-default-200 bg-default-50 px-2.5 py-1.5 text-sm text-foreground shadow-none outline-none transition-colors placeholder:text-muted/50 focus:border-default-400";

/** "http://172.16.21.25:49152/" → "172.16.21.25:49152". */
function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

/** Compact bare input used across the remote-server forms. */
function CompactInput(props: {
  readonly value: string;
  readonly placeholder: string;
  readonly ariaLabel: string;
  readonly onChange: (value: string) => void;
  readonly inputMode?: "url" | "text";
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly onEnter?: () => void;
  readonly onEscape?: () => void;
}) {
  return (
    <Input
      variant="secondary"
      className={INPUT_CLASS}
      value={props.value}
      aria-label={props.ariaLabel}
      placeholder={props.placeholder}
      inputMode={props.inputMode ?? "text"}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      ref={props.inputRef}
      onChange={(event) => props.onChange(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && props.onEnter) {
          event.preventDefault();
          props.onEnter();
        } else if (event.key === "Escape" && props.onEscape) {
          event.preventDefault();
          props.onEscape();
        }
      }}
    />
  );
}

/**
 * Reveal-on-click "add folder" / "clone repo" affordances for one server. Both
 * create the project on the host, so they are locked while it is unreachable.
 */
function ManageProjects({
  desktopId,
  isOnline,
}: {
  readonly desktopId: string;
  readonly isOnline: boolean;
}) {
  const { t } = useLingui();
  const runProjectCommand = useRemoteServersStore((s) => s.runProjectCommand);
  const { busy, error, run } = useAsyncOperation();
  const [mode, setMode] = useState<"none" | "folder" | "create" | "clone">("none");
  const [folderPath, setFolderPath] = useState("");
  const [createParent, setCreateParent] = useState("");
  const [createName, setCreateName] = useState("");
  const [cloneParent, setCloneParent] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [pickerTarget, setPickerTarget] = useState<"folder" | "create" | "clone" | null>(null);
  const cloneName = cloneFolderNameFromUrl(cloneUrl);

  const reset = () => {
    setMode("none");
    setFolderPath("");
    setCreateParent("");
    setCreateName("");
    setCloneParent("");
    setCloneUrl("");
  };

  const addFolder = () =>
    run(async () => {
      await runProjectCommand(desktopId, { kind: "add-existing", path: folderPath.trim() });
      reset();
    });
  const create = () =>
    run(async () => {
      await runProjectCommand(desktopId, {
        kind: "create",
        parentPath: createParent.trim(),
        name: createName.trim(),
      });
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
      <div className="flex flex-wrap items-center gap-1 border-t border-[var(--hairline)] pt-3">
        <Button variant="ghost" size="sm" isDisabled={!isOnline} onPress={() => setMode("folder")}>
          <FolderPlus className="size-3.5" />
          <Trans>Add folder</Trans>
        </Button>
        <Button variant="ghost" size="sm" isDisabled={!isOnline} onPress={() => setMode("create")}>
          <FilePlus className="size-3.5" />
          <Trans>Start from scratch</Trans>
        </Button>
        <Button variant="ghost" size="sm" isDisabled={!isOnline} onPress={() => setMode("clone")}>
          <GitBranch className="size-3.5" />
          <Trans>Clone repo</Trans>
        </Button>
        {isOnline ? null : (
          <span className="w-full px-1 pt-1 text-xs text-muted/70">
            <Trans>Reconnect the server to add projects.</Trans>
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--hairline)] pt-3">
      {mode === "folder" ? (
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            fullWidth
            className={`${INPUT_CLASS} h-auto min-w-0 justify-start gap-2 text-left font-normal`}
            aria-label={t`Folder path on the server`}
            onPress={() => setPickerTarget("folder")}
          >
            <FolderOpen className="size-4 shrink-0 text-muted" />
            <span className={`min-w-0 flex-1 truncate ${folderPath ? "" : "text-muted/50"}`}>
              {folderPath || t`Choose a folder…`}
            </span>
          </Button>
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
      ) : mode === "create" ? (
        <>
          <Button
            variant="ghost"
            fullWidth
            className={`${INPUT_CLASS} h-auto min-w-0 justify-start gap-2 text-left font-normal`}
            aria-label={t`Parent folder`}
            onPress={() => setPickerTarget("create")}
          >
            <FolderOpen className="size-4 shrink-0 text-muted" />
            <span className={`min-w-0 flex-1 truncate ${createParent ? "" : "text-muted/50"}`}>
              {createParent || t`Choose a folder…`}
            </span>
          </Button>
          <div className="flex items-center gap-1.5">
            <CompactInput
              value={createName}
              ariaLabel={t`Project name`}
              placeholder={t`Project name`}
              onChange={setCreateName}
              onEnter={create}
            />
            <Button
              variant="tertiary"
              size="sm"
              isDisabled={busy || !createParent.trim() || !createName.trim()}
              onPress={create}
            >
              <Trans>Create</Trans>
            </Button>
            <Button variant="ghost" size="sm" isIconOnly aria-label={t`Cancel`} onPress={reset}>
              <X className="size-4" />
            </Button>
          </div>
        </>
      ) : (
        <>
          <Button
            variant="ghost"
            fullWidth
            className={`${INPUT_CLASS} h-auto min-w-0 justify-start gap-2 text-left font-normal`}
            aria-label={t`Parent folder`}
            onPress={() => setPickerTarget("clone")}
          >
            <FolderOpen className="size-4 shrink-0 text-muted" />
            <span className={`min-w-0 flex-1 truncate ${cloneParent ? "" : "text-muted/50"}`}>
              {cloneParent || t`Choose a folder…`}
            </span>
          </Button>
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
      {pickerTarget ? (
        <RemoteHostFolderPicker
          desktopId={desktopId}
          title={t`Choose a folder`}
          initialPath={
            pickerTarget === "folder"
              ? folderPath
              : pickerTarget === "create"
                ? createParent
                : cloneParent
          }
          onClose={() => setPickerTarget(null)}
          onSelect={
            pickerTarget === "folder"
              ? setFolderPath
              : pickerTarget === "create"
                ? setCreateParent
                : setCloneParent
          }
        />
      ) : null}
    </div>
  );
}

function RemoteServerRow({ server }: { readonly server: RemoteServerRecord }) {
  const { t } = useLingui();
  const runtime = useRemoteServersStore((s) => s.runtime[server.desktopId]);
  const reconnectServer = useRemoteServersStore((s) => s.reconnectServer);
  const renameServer = useRemoteServersStore((s) => s.renameServer);
  const removeServer = useRemoteServersStore((s) => s.removeServer);
  const { busy, run } = useAsyncOperation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const isRenaming = nameDraft !== null;

  useEffect(() => {
    if (!isRenaming) return;
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [isRenaming]);

  const status = runtime?.status ?? "offline";
  const statusLabel = useRemoteServerStatusLabel(status);
  const canManage = server.scopes.includes("projects:manage");
  const projects = runtime?.projects ?? [];
  const saveName = () => {
    const name = nameDraft?.trim();
    if (!name) return;
    renameServer(server.desktopId, name);
    setNameDraft(null);
  };

  const title = desktopTitle(server.label);

  return (
    <div className="rounded-xl">
      <SidebarButton
        icon={
          server.transport?.kind === "ssh" ? (
            <Server className="size-4 shrink-0" />
          ) : (
            <Laptop className="size-4 shrink-0" />
          )
        }
        label={
          <span className="flex min-w-0 items-center gap-2">
            <RemoteServerStatusDot status={status} />
            <span className="truncate text-foreground">{title}</span>
            {status !== "online" ? (
              <span aria-hidden="true" className="shrink-0 text-xs text-muted">
                {statusLabel}
              </span>
            ) : null}
            {server.remoteLabel && server.remoteLabel !== server.label ? (
              <span aria-hidden="true" className="truncate text-xs text-muted/70">
                {desktopTitle(server.remoteLabel)}
              </span>
            ) : null}
            <span aria-hidden="true" className="truncate text-xs text-muted/70">
              {server.transport?.kind === "ssh"
                ? server.transport.connection.target
                : endpointHost(server.endpoint)}
            </span>
          </span>
        }
        liveText
        onPress={() => setDetailsOpen(true)}
        suffix={
          <Dropdown>
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              className="size-6 min-w-0 text-muted"
              aria-label={t`Actions`}
              onClick={(event) => event.stopPropagation()}
            >
              <Ellipsis className="size-3.5" />
            </Button>
            <Dropdown.Popover placement="bottom end">
              <Dropdown.Menu
                aria-label={t`Actions`}
                disabledKeys={busy ? ["refresh"] : []}
                onAction={(key) => {
                  if (key === "rename") setNameDraft(title);
                  else if (key === "refresh") void run(() => reconnectServer(server.desktopId));
                  else if (key === "remove") removeServer(server.desktopId);
                }}
              >
                <Dropdown.Item id="rename" textValue={t`Rename`}>
                  <Pencil className="size-4" />
                  <Label>{t`Rename`}</Label>
                </Dropdown.Item>
                <Dropdown.Item id="refresh" textValue={t`Refresh`}>
                  <RefreshCw
                    className={`size-4 ${status === "connecting" ? "animate-spin" : ""}`}
                  />
                  <Label>{t`Refresh`}</Label>
                </Dropdown.Item>
                <Dropdown.Item id="remove" textValue={t`Remove`} variant="danger">
                  <Trash2 className="size-4" />
                  <Label>{t`Remove`}</Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        }
      />

      {nameDraft !== null ? (
        <div className="flex items-center gap-1.5 px-2 pb-1.5 pl-8">
          <CompactInput
            value={nameDraft}
            ariaLabel={t`Name`}
            placeholder={title}
            inputRef={nameInputRef}
            onChange={setNameDraft}
            onEnter={saveName}
            onEscape={() => setNameDraft(null)}
          />
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            className="!rounded-xl"
            aria-label={t`Save`}
            isDisabled={!nameDraft.trim()}
            onPress={saveName}
          >
            <Check className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            className="!rounded-xl"
            aria-label={t`Cancel`}
            onPress={() => setNameDraft(null)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : null}

      <Modal.Backdrop isOpen={detailsOpen} onOpenChange={setDetailsOpen}>
        <Modal.Container size="lg" scroll="inside">
          <Modal.Dialog className="overflow-hidden p-0 sm:max-w-[640px]">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-[var(--hairline)] px-6 py-5">
              <div className="flex min-w-0 items-center gap-3 pr-8">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-default-50 text-muted">
                  {server.transport?.kind === "ssh" ? (
                    <Server className="size-4.5" />
                  ) : (
                    <Laptop className="size-4.5" />
                  )}
                </div>
                <div className="min-w-0">
                  <Modal.Heading className="truncate text-base">{title}</Modal.Heading>
                  <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted">
                    <RemoteServerStatusDot status={status} />
                    <span className="shrink-0">{statusLabel}</span>
                    <span aria-hidden="true" className="text-muted/40">
                      ·
                    </span>
                    <span className="truncate font-mono text-[11px]">
                      {server.transport?.kind === "ssh"
                        ? server.transport.connection.target
                        : endpointHost(server.endpoint)}
                    </span>
                  </div>
                </div>
              </div>
            </Modal.Header>
            <Modal.Body className="!m-0 space-y-5 !px-6 !py-5">
              {runtime?.status === "error" && runtime.message ? (
                <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
                  {runtime.message}
                </p>
              ) : null}
              {server.hostMode !== "helper" && canManage ? (
                <RemoteHostUpdateControl server={server} isOnline={status === "online"} />
              ) : null}
              <section>
                <h3 className="mb-2 text-xs font-semibold text-foreground/80">
                  <Trans>Projects</Trans>
                </h3>
                <RemoteServerProjectList desktopId={server.desktopId} projects={projects} />
              </section>
              {canManage ? (
                <ManageProjects desktopId={server.desktopId} isOnline={status === "online"} />
              ) : (
                <p className="pt-0.5 text-xs text-muted/70">
                  <Trans>View-only — this connection can't manage projects.</Trans>
                </p>
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}

export function RemoteServersSettings() {
  const compactLayout = useCompactLayout();
  return compactLayout ? <MobileRemoteServersSettings /> : <DesktopRemoteServersSettings />;
}

function DesktopRemoteServersSettings() {
  const { t } = useLingui();
  const servers = useRemoteServersStore((s) => s.servers);
  const pairServer = useRemoteServersStore((s) => s.pairServer);
  const connectAll = useRemoteServersStore((s) => s.connectAll);

  // Reconnect persisted servers when the panel opens so their projects are live.
  useEffect(() => {
    void connectAll();
  }, [connectAll]);

  const [adding, setAdding] = useState<"direct" | "ssh" | null>(null);
  const [pairingUrl, setPairingUrl] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const { busy: pairing, error, run } = useAsyncOperation();
  const nativeSsh = hasClientCapability("nativeSsh");

  const canConnect = !pairing && pairingUrl.trim().length > 0;
  const onPair = () => {
    if (!canConnect) return;
    const parsed = parsePairingUrlParts(pairingUrl);
    if (!parsed) {
      setValidationError(t`Enter the pairing URL shown on your desktop.`);
      return;
    }
    setValidationError(null);
    run(async () => {
      await pairServer({
        endpoint: normalizePairingEndpoint(parsed.host ?? parsed.url.toString()),
        token: parsed.token,
      });
      await connectAll();
      setPairingUrl("");
      setAdding(null);
    });
  };

  return (
    <SettingsPage
      title={t`Remote Environments`}
      description={t`Connect directly, through a relay, or over SSH. Every transport uses the same Poracode remote protocol, projects, threads, and agent runtimes.`}
      bodyClassName="space-y-3"
    >
      {servers.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          {servers.map((server) => (
            <RemoteServerRow key={server.desktopId} server={server} />
          ))}
        </div>
      ) : null}

      {adding === "direct" ? (
        <div className="flex flex-col gap-2">
          <CompactInput
            value={pairingUrl}
            ariaLabel={t`Pairing URL`}
            placeholder={t`Paste pairing URL…`}
            inputMode="url"
            onChange={(value) => {
              setPairingUrl(value);
              setValidationError(null);
            }}
            onEnter={onPair}
          />
          <div className="flex items-center gap-2">
            <Button variant="tertiary" size="sm" isDisabled={!canConnect} onPress={onPair}>
              {pairing ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
              {pairing ? <Trans>Connecting…</Trans> : <Trans>Connect</Trans>}
            </Button>
            <Button variant="ghost" size="sm" isDisabled={pairing} onPress={() => setAdding(null)}>
              <Trans>Cancel</Trans>
            </Button>
            {validationError || error ? (
              <span role="alert" className="min-w-0 truncate text-xs text-danger">
                {validationError ?? error}
              </span>
            ) : null}
          </div>
        </div>
      ) : adding === "ssh" ? (
        <Suspense fallback={<Loader2 className="size-4 animate-spin" aria-label={t`Loading`} />}>
          <SshConnectionForm onConnected={() => setAdding(null)} onCancel={() => setAdding(null)} />
        </Suspense>
      ) : (
        <div className="flex gap-2">
          <Button variant="tertiary" size="sm" onPress={() => setAdding("direct")}>
            <Link2 className="size-4" />
            <Trans>Pair with Poracode</Trans>
          </Button>
          {nativeSsh ? (
            <Button variant="tertiary" size="sm" onPress={() => setAdding("ssh")}>
              <Plus className="size-4" />
              <Trans>Connect over SSH</Trans>
            </Button>
          ) : null}
        </div>
      )}

      {servers.length === 0 && adding === null ? (
        <p className="text-xs text-muted">
          <Trans>No remote environments connected yet.</Trans>
        </p>
      ) : null}
    </SettingsPage>
  );
}
