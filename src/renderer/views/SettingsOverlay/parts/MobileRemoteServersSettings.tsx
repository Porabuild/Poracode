import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Button, Input, toast } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
  Download,
  Laptop,
  Link2,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  Server,
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

function MobileRemoteServerRow({ server }: { readonly server: RemoteServerRecord }) {
  const { t } = useLingui();
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
        onClick={() => setProjectsOpen(true)}
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

function PairingField(props: {
  readonly label: string;
  readonly value: string;
  readonly placeholder: string;
  readonly inputMode?: "url" | "text";
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
        {props.label}
      </span>
      <Input
        aria-label={props.label}
        className="w-full !rounded-2xl text-xs"
        value={props.value}
        placeholder={props.placeholder}
        inputMode={props.inputMode ?? "text"}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function MobilePairingSheet(props: { readonly onClose: () => void }) {
  const { t } = useLingui();
  const pairServer = useRemoteServersStore((state) => state.pairServer);
  const connectAll = useRemoteServersStore((state) => state.connectAll);
  const [endpoint, setEndpoint] = useState("");
  const [token, setToken] = useState("");
  const scanInputRef = useRef<HTMLInputElement>(null);
  const { busy, error, run } = useAsyncOperation();
  const canPair = !busy && endpoint.trim().length > 0 && token.trim().length > 0;
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
    run(async () => {
      await pairServer({ endpoint, token });
      await connectAll();
      props.onClose();
    });
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
          <PairingField
            label={t`Endpoint`}
            value={endpoint}
            placeholder="https://app-nightly.poracode.com"
            inputMode="url"
            onChange={(value) => updatePairingField(value, setEndpoint)}
          />
          <PairingField
            label={t`Pairing token`}
            value={token}
            placeholder="lc_pair_…"
            onChange={(value) => updatePairingField(value, setToken)}
          />
          <Button
            fullWidth
            variant="tertiary"
            className="!rounded-2xl"
            isDisabled={!canPair}
            onPress={onPair}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
            {busy ? <Trans>Pairing…</Trans> : <Trans>Pair</Trans>}
          </Button>
          {error ? (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </BottomSheet>
  );
}

export function MobileRemoteServersSettings() {
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
      <div>
        <h1 className="text-base font-semibold text-foreground">{t`Connections`}</h1>
        <p className="mt-0.5 text-xs text-muted">
          <Plural value={servers.length} one="# paired connection" other="# paired connections" />
        </p>
      </div>

      {servers.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {servers.map((server) => (
            <MobileRemoteServerRow key={server.desktopId} server={server} />
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

      <Button
        isIconOnly
        aria-label={t`Pair a connection`}
        className="m-home-compose-action fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40"
        variant="ghost"
        onPress={() => {
          if (nativeSsh) setConnectionChoiceOpen(true);
          else setPairingOpen(true);
        }}
      >
        <Plus className="size-5" />
      </Button>

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
