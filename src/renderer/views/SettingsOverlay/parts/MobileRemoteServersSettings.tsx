import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Button, Input, toast } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
  ClipboardPaste,
  Download,
  FolderOpen,
  Laptop,
  Link2,
  Loader2,
  MonitorCog,
  Pencil,
  Plus,
  QrCode,
  Server,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useAsyncOperation } from "@/renderer/hooks/useAsyncOperation";
import { useLongPress } from "@/renderer/hooks/useLongPress";
import { useCanInstall, promptInstall } from "@/renderer/pwa/install";
import { hasClientCapability } from "@/renderer/clientRuntime";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { desktopTitle } from "@/shared/remote/desktopLabel";
import { normalizePairingEndpoint, parsePairingUrlParts } from "@/shared/remote/pairingUrl";
import { decodeQrImageFile } from "@/renderer/utils/qrImage";
import { BottomSheet } from "@/renderer/components/common/BottomSheet";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { MobileCircleButton } from "@/renderer/components/mobileComposer/MobileCircleButton";
import {
  RemoteServerStatusDot,
  useRemoteServerStatusLabel,
} from "@/renderer/components/common/RemoteServerStatusDot";
import { InlineRenameInput } from "@/renderer/views/MainView/parts/Sidebar/parts/InlineRenameInput";
import { MobileRemoteProjectsSheet } from "./MobileRemoteProjectsSheet";

const SshConnectionForm = lazy(() =>
  import("./SshConnectionForm").then((module) => ({ default: module.SshConnectionForm })),
);

function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

function MobileRemoteServerRow(props: {
  readonly server: RemoteServerRecord;
  readonly onOpenDesktopSettings?: ((desktopId: string) => void) | undefined;
}) {
  const { t } = useLingui();
  const { server } = props;
  const runtime = useRemoteServersStore((state) => state.runtime[server.desktopId]);
  const lastKnownProjects = useRemoteServersStore(
    (state) => state.lastKnownProjects[server.desktopId],
  );
  const renameServer = useRemoteServersStore((state) => state.renameServer);
  const removeServer = useRemoteServersStore((state) => state.removeServer);
  const [menuOpen, setMenuOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const status = runtime?.status ?? "offline";
  const statusLabel = useRemoteServerStatusLabel(status);
  const title = desktopTitle(server.label);
  const endpoint =
    server.transport?.kind === "ssh"
      ? server.transport.connection.target
      : endpointHost(server.endpoint);
  const isLive = status === "online" || status === "connecting";
  const projects = runtime?.projects ?? lastKnownProjects ?? [];
  const openMenu = () => setMenuOpen(true);
  const longPressHandlers = useLongPress(openMenu);

  if (renaming) {
    return (
      <div className="m-thread-row" data-live={isLive || undefined}>
        {server.transport?.kind === "ssh" ? (
          <Server className="size-4 shrink-0 text-muted" />
        ) : (
          <Laptop className="size-4 shrink-0 text-muted" />
        )}
        <span className="m-thread-row__body">
          <InlineRenameInput
            initialValue={title}
            ariaLabel={t`Rename connection`}
            onCommit={(value) => {
              renameServer(server.desktopId, value);
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        </span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="m-thread-row"
        data-live={isLive || undefined}
        aria-label={title}
        onClick={openMenu}
        {...longPressHandlers}
      >
        {server.transport?.kind === "ssh" ? (
          <Server className="size-4 shrink-0 text-muted" />
        ) : (
          <Laptop className="size-4 shrink-0 text-muted" />
        )}
        <span className="m-thread-row__body">
          <span className="m-thread-row__title">{title}</span>
          <span className="m-thread-row__meta">
            <span className="m-thread-row__meta-item">
              <RemoteServerStatusDot status={status} />
              <span className="m-thread-row__meta-text">{endpoint}</span>
            </span>
            <span className="m-thread-row__meta-item shrink-0">{statusLabel}</span>
          </span>
        </span>
      </button>

      {menuOpen ? (
        <BottomSheet
          label={title}
          closeLabel={t`Close connection actions`}
          onClose={() => setMenuOpen(false)}
        >
          <div className="m-sheet-head">
            <span className="min-w-0 truncate">{title}</span>
          </div>
          <div className="m-sheet-list">
            <SidebarButton
              icon={<FolderOpen className="size-4" />}
              label={t`Projects`}
              onPress={() => {
                setMenuOpen(false);
                setProjectsOpen(true);
              }}
            />
            {props.onOpenDesktopSettings ? (
              <SidebarButton
                icon={<MonitorCog className="size-4" />}
                label={t`Desktop Settings`}
                isDisabled={status !== "online"}
                onPress={() => {
                  setMenuOpen(false);
                  props.onOpenDesktopSettings?.(server.desktopId);
                }}
              />
            ) : null}
            <SidebarButton
              icon={<Pencil className="size-4" />}
              label={t`Rename`}
              onPress={() => {
                setMenuOpen(false);
                setRenaming(true);
              }}
            />
            <SidebarButton
              icon={<Trash2 className="size-4 text-danger" />}
              label={<span className="text-danger">{t`Remove connection`}</span>}
              onPress={() => {
                setMenuOpen(false);
                removeServer(server.desktopId);
              }}
            />
          </div>
        </BottomSheet>
      ) : null}
      {projectsOpen ? (
        <MobileRemoteProjectsSheet
          server={server}
          projects={projects}
          isOnline={status === "online"}
          onClose={() => setProjectsOpen(false)}
        />
      ) : null}
    </>
  );
}

function MobilePairingSheet(props: { readonly onClose: () => void }) {
  const { t } = useLingui();
  const pairServer = useRemoteServersStore((state) => state.pairServer);
  const connectAll = useRemoteServersStore((state) => state.connectAll);
  const [pairingUrl, setPairingUrl] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [token, setToken] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const { busy, error, run } = useAsyncOperation();
  const canPairFromLink = pairingUrl.trim().length > 0;
  const canPairManually = endpoint.trim().length > 0 && token.trim().length > 0;
  const canPair = !busy && (canPairFromLink || canPairManually);
  const canReadClipboard =
    typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function";
  const canInstallApp = useCanInstall();

  const updatePairingField = (value: string, update: (next: string) => void) => {
    const parsed = parsePairingUrlParts(value);
    if (!parsed) {
      update(value);
      return;
    }
    if (parsed.host) {
      setEndpoint(normalizePairingEndpoint(parsed.host));
    } else {
      setEndpoint(normalizePairingEndpoint(parsed.url.toString()));
    }
    setToken(parsed.token);
  };

  const onPair = () => {
    if (!canPair) return;

    let pairingEndpoint: string;
    let pairingToken: string;
    if (canPairFromLink) {
      const parsed = parsePairingUrlParts(pairingUrl);
      if (!parsed) {
        setValidationError(t`Enter the pairing URL shown on your desktop.`);
        return;
      }
      pairingEndpoint = normalizePairingEndpoint(parsed.host ?? parsed.url.toString());
      pairingToken = parsed.token;
    } else {
      try {
        pairingEndpoint = normalizePairingEndpoint(endpoint);
      } catch {
        setValidationError(t`Enter the pairing URL shown on your desktop.`);
        return;
      }
      pairingToken = token.trim();
    }

    setValidationError(null);
    run(async () => {
      await pairServer({ endpoint: pairingEndpoint, token: pairingToken });
      await connectAll();
      props.onClose();
    });
  };

  const pastePairingLink = async () => {
    if (!canReadClipboard) return;
    try {
      const value = await navigator.clipboard.readText();
      if (value.length === 0) return;
      setPairingUrl(value);
      setValidationError(null);
    } catch {
      // Clipboard permission remains browser-owned; the field still supports
      // the platform paste menu when programmatic reading is unavailable.
    }
  };

  const onScanFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const value = await decodeQrImageFile(file);
      const parsed = value ? parsePairingUrlParts(value) : null;
      if (!value || !parsed) {
        toast.danger(t`No Poracode pairing QR code found.`);
        return;
      }
      updatePairingField(value, setEndpoint);
    } catch {
      toast.danger(t`Unable to read the pairing QR code.`);
    } finally {
      if (scanInputRef.current) scanInputRef.current.value = "";
    }
  };

  return (
    <BottomSheet label={t`Pair a connection`} onClose={props.onClose}>
      <div className="m-sheet-head">
        <span>{t`Pair a connection`}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-0.5 pb-1">
        <div className="space-y-3">
          <p className="text-xs leading-5 text-muted">
            <Trans>
              Open Settings → Remote Access in Poracode on your desktop, then scan the QR code from
              here — or enter the endpoint and pairing token manually.
            </Trans>
          </p>
          <input
            ref={scanInputRef}
            className="sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            aria-label={t`Scan QR code`}
            onChange={(event) => void onScanFile(event.currentTarget.files?.[0])}
          />
          <Button
            fullWidth
            variant="secondary"
            className="!rounded-2xl"
            onPress={() => scanInputRef.current?.click()}
            isDisabled={busy}
          >
            <QrCode className="size-4" />
            <Trans>Scan QR code</Trans>
          </Button>
          {canInstallApp ? (
            <Button
              fullWidth
              variant="secondary"
              className="!rounded-2xl"
              onPress={() => void promptInstall()}
              isDisabled={busy}
            >
              <Download className="size-4" />
              <Trans>Add to Home Screen</Trans>
            </Button>
          ) : null}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="mobile-poracode-pairing-link"
                className="flex items-center gap-2 text-xs font-medium text-foreground"
              >
                <Link2 className="size-4 text-muted" />
                <Trans>Pairing link</Trans>
              </label>
              <Button
                isIconOnly
                aria-label={t`Paste`}
                size="sm"
                variant="ghost"
                className="size-7 min-h-7 min-w-7 p-0"
                isDisabled={busy || !canReadClipboard}
                onPress={() => void pastePairingLink()}
              >
                <ClipboardPaste className="size-3.5" />
              </Button>
            </div>
            <Input
              id="mobile-poracode-pairing-link"
              aria-label={t`Pairing URL`}
              className="h-12 w-full text-base"
              value={pairingUrl}
              placeholder={t`Paste pairing URL…`}
              inputMode="url"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              disabled={busy}
              onChange={(event) => {
                setPairingUrl(event.currentTarget.value);
                setValidationError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") onPair();
              }}
            />
          </div>

          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" />
            <Trans>or</Trans>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-2 text-xs font-medium text-foreground">
              <SlidersHorizontal className="size-4 text-muted" />
              <Trans>Manual connection</Trans>
            </span>
            <Input
              aria-label={t`Server base URL`}
              className="h-12 w-full text-base"
              value={endpoint}
              placeholder={t`Server base URL`}
              inputMode="url"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              disabled={busy}
              onChange={(event) => {
                updatePairingField(event.currentTarget.value, setEndpoint);
                setValidationError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") onPair();
              }}
            />
            <Input
              aria-label={t`One-time pairing token`}
              className="h-12 w-full text-base"
              type="password"
              value={token}
              placeholder={t`One-time pairing token`}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              disabled={busy}
              onChange={(event) => {
                updatePairingField(event.currentTarget.value, setToken);
                setValidationError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") onPair();
              }}
            />
          </div>
          <Button
            fullWidth
            variant="primary"
            className="poracode-mobile-pair-connect h-12 justify-center !rounded-2xl"
            isDisabled={!canPair}
            onPress={onPair}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ? <Trans>Pairing…</Trans> : <Trans>Connect</Trans>}
          </Button>
          {validationError || error ? (
            <p role="alert" className="text-xs text-danger">
              {validationError ?? error}
            </p>
          ) : null}
        </div>
      </div>
    </BottomSheet>
  );
}

export function MobileRemoteServersSettings(props: {
  readonly onOpenDesktopSettings?: ((desktopId: string) => void) | undefined;
}) {
  const { t } = useLingui();
  const servers = useRemoteServersStore((state) => state.servers);
  const connectAll = useRemoteServersStore((state) => state.connectAll);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [connectionChoiceOpen, setConnectionChoiceOpen] = useState(false);
  const [sshOpen, setSshOpen] = useState(false);
  const nativeSsh = hasClientCapability("nativeSsh");

  // Keep the mobile connection list live when returning from the pairing sheet.
  useEffect(() => {
    void connectAll();
  }, [connectAll]);

  return (
    <div className="m-page--fab flex min-h-full flex-col gap-3">
      {servers.length > 0 ? (
        <p className="px-1 text-xs text-muted">
          <Plural value={servers.length} one="# paired connection" other="# paired connections" />
        </p>
      ) : null}

      {servers.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {servers.map((server) => (
            <MobileRemoteServerRow
              key={server.desktopId}
              server={server}
              onOpenDesktopSettings={props.onOpenDesktopSettings}
            />
          ))}
        </div>
      ) : (
        <div className="m-empty flex flex-1 flex-col items-center justify-center gap-2 px-5 pb-12 text-center">
          <span className="m-empty__icon">
            <Laptop className="size-5" />
          </span>
          <strong className="text-sm font-semibold text-foreground">{t`No connections yet`}</strong>
          <p className="max-w-xs text-xs leading-5 text-muted">
            <Trans>Use + to pair directly or connect to a remote machine over SSH.</Trans>
          </p>
        </div>
      )}

      <MobileCircleButton
        aria-label={t`Pair a connection`}
        className="m-page-edge-action fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40"
        onPress={() => {
          if (nativeSsh) setConnectionChoiceOpen(true);
          else setPairingOpen(true);
        }}
      >
        <Plus className="size-5" />
      </MobileCircleButton>

      {connectionChoiceOpen ? (
        <BottomSheet label={t`Connections`} onClose={() => setConnectionChoiceOpen(false)}>
          <div className="m-sheet-head">
            <span>{t`Connections`}</span>
          </div>
          <div className="m-sheet-list">
            <SidebarButton
              icon={<Link2 className="size-4" />}
              label={t`Pair with Poracode`}
              onPress={() => {
                setConnectionChoiceOpen(false);
                setPairingOpen(true);
              }}
            />
            <SidebarButton
              icon={<Server className="size-4" />}
              label={t`Connect over SSH`}
              onPress={() => {
                setConnectionChoiceOpen(false);
                setSshOpen(true);
              }}
            />
          </div>
        </BottomSheet>
      ) : null}
      {pairingOpen ? <MobilePairingSheet onClose={() => setPairingOpen(false)} /> : null}
      {sshOpen ? (
        <BottomSheet label={t`Connect over SSH`} onClose={() => setSshOpen(false)}>
          <div className="m-sheet-head">
            <span>{t`Connect over SSH`}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-0.5 pb-1">
            <Suspense
              fallback={
                <div className="flex min-h-40 items-center justify-center">
                  <Loader2 className="size-4 animate-spin" aria-label={t`Loading`} />
                </div>
              }
            >
              <SshConnectionForm
                onConnected={() => setSshOpen(false)}
                onCancel={() => setSshOpen(false)}
              />
            </Suspense>
          </div>
        </BottomSheet>
      ) : null}
    </div>
  );
}
