import { useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Check, Download, Laptop, Loader2, Pencil, QrCode, Smartphone, Trash2 } from "lucide-react";
import { useLongPress } from "@/renderer/hooks/useLongPress";
import { formatShortDateTime } from "@/renderer/utils/formatTime";
import { InlineRenameInput } from "@/renderer/views/MainView/parts/Sidebar/parts/InlineRenameInput";
import { Fab, EmptyState, FullScreenDrawer, SheetMenu, useSheet } from "../components";
import { QrScanner } from "../QrScanner";
import { isNativeApp, isStandaloneDisplay, promptInstall, useCanInstall } from "../pwaInstall";
import type { StoredDesktop } from "../storage";

/** "Add to Home Screen" button — only shown when the browser offers install. */
function InstallAppButton() {
  const { t } = useLingui();
  const canInstall = useCanInstall();
  if (!canInstall || isStandaloneDisplay() || isNativeApp()) return null;
  return (
    <Button
      className="m-form__submit text-foreground"
      size="sm"
      variant="secondary"
      onPress={() => void promptInstall()}
    >
      <Download className="size-4" />
      {t`Add to Home Screen`}
    </Button>
  );
}

export interface DesktopsViewProps {
  readonly desktops: readonly StoredDesktop[];
  readonly activeDesktopId: string | null;
  readonly manualEndpoint: string;
  readonly manualToken: string;
  readonly canPair: boolean;
  readonly showPairingHint: boolean;
  /** A pairing handshake is in flight; disable inputs and show progress. */
  readonly pairing?: boolean;
  readonly onEndpointChange: (value: string) => void;
  readonly onTokenChange: (value: string) => void;
  readonly onPair: () => void;
  /** Raw text decoded from a scanned QR; the route parses + pairs. */
  readonly onScan: (value: string) => void;
  readonly onSwitch: (desktop: StoredDesktop) => void;
  /** Save a local nickname for the desktop. */
  readonly onRename: (desktop: StoredDesktop, label: string) => void;
  readonly onForget: (desktop: StoredDesktop) => void;
}

/** "Poracode on host" → "host"; the brand prefix is noise inside the app.
 *  Legacy "Lightcode on …" labels (paired pre-rebrand) are stripped too. */
function desktopTitle(label: string): string {
  const stripped = label.replace(/^(?:Poracode|Lightcode)\s+on\s+/i, "");
  return stripped || label;
}

/** "http://172.16.21.25:38987/" → "172.16.21.25:38987". */
function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

/** The flat tappable card from ThreadRow: tap switches, long-press opens the
 * actions sheet (no visible menu button). Renaming swaps the card for an inline
 * input, mirroring the thread title row. */
function DesktopRowButton(props: {
  readonly title: string;
  readonly desktop: StoredDesktop;
  readonly isActive: boolean;
  readonly onSwitch: () => void;
  readonly onMenu: () => void;
}) {
  const { desktop, title } = props;
  const { t } = useLingui();
  const longPressHandlers = useLongPress(props.onMenu);
  return (
    <button type="button" className="m-thread-row" onClick={props.onSwitch} {...longPressHandlers}>
      <Laptop className="size-4 shrink-0 text-muted" />
      <span className="m-thread-row__body">
        <span className="m-thread-row__title">{title}</span>
        <span className="m-thread-row__meta">
          <span className="m-thread-row__meta-item">{endpointHost(desktop.endpoint)}</span>
          <span className="m-thread-row__meta-item">
            {desktop.lastConnectedAt
              ? t`Live ${formatShortDateTime(desktop.lastConnectedAt)}`
              : t`Cached only`}
          </span>
        </span>
      </span>
      {props.isActive ? (
        <span className="m-thread-row__side">
          <Check className="size-4 shrink-0 text-accent" aria-label={t`Active`} />
        </span>
      ) : null}
    </button>
  );
}

function DesktopRow(props: {
  readonly desktop: StoredDesktop;
  readonly isActive: boolean;
  readonly onSwitch: () => void;
  readonly onRename: (label: string) => void;
  readonly onForget: () => void;
}) {
  const { desktop } = props;
  const { t } = useLingui();
  const [renaming, setRenaming] = useState(false);
  const title = desktopTitle(desktop.label);
  if (renaming) {
    return (
      <div className="m-thread-row">
        <Laptop className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <InlineRenameInput
            initialValue={title}
            ariaLabel={t`Rename connection`}
            onCommit={(value) => {
              props.onRename(value);
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        </span>
      </div>
    );
  }
  return (
    <SheetMenu
      label={title}
      closeLabel={t`Close connection actions`}
      items={[
        { id: "rename", label: t`Rename`, icon: <Pencil className="size-4 text-muted" /> },
        {
          id: "forget",
          label: t`Remove connection`,
          icon: <Trash2 className="size-4" />,
          tone: "danger",
        },
      ]}
      onSelect={(id) => {
        if (id === "rename") setRenaming(true);
        if (id === "forget") props.onForget();
      }}
      trigger={({ open }) => (
        <DesktopRowButton
          title={title}
          desktop={desktop}
          isActive={props.isActive}
          onSwitch={props.onSwitch}
          onMenu={open}
        />
      )}
    />
  );
}

export function DesktopsView(props: DesktopsViewProps) {
  const { t } = useLingui();
  const [scanning, setScanning] = useState(false);
  const { pairing, onScan, showPairingHint } = props;
  // The pairing form now lives in a full-screen drawer opened from the FAB.
  const pairDrawer = useSheet<true>();
  const { open: openPairDrawer } = pairDrawer;
  // A deep-link launch pre-fills the fields and flags the hint — surface the
  // form immediately (once) so the handoff doesn't dead-end on the list.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (showPairingHint && !autoOpened.current) {
      autoOpened.current = true;
      openPairDrawer(true);
    }
  }, [showPairingHint, openPairDrawer]);
  return (
    <section className="m-page m-desktops m-page--fab">
      {scanning ? (
        <QrScanner
          onResult={(value) => {
            setScanning(false);
            onScan(value);
          }}
          onCancel={() => setScanning(false)}
        />
      ) : null}
      <div className="m-page-head">
        <div>
          <h1>
            <Trans>Connections</Trans>
          </h1>
          <p>
            <Plural
              value={props.desktops.length}
              one="# paired connection"
              other="# paired connections"
            />
          </p>
        </div>
      </div>

      {props.desktops.length > 0 ? (
        <div className="m-desktop-list">
          {props.desktops.map((desktop) => (
            <DesktopRow
              key={desktop.desktopId}
              desktop={desktop}
              isActive={desktop.desktopId === props.activeDesktopId}
              onSwitch={() => props.onSwitch(desktop)}
              onRename={(label) => props.onRename(desktop, label)}
              onForget={() => props.onForget(desktop)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Laptop className="size-5" />}
          title={<Trans>No connections yet</Trans>}
          hint={<Trans>Tap + to pair with Poracode on your desktop.</Trans>}
        />
      )}

      <Fab label={t`Pair a connection`} onPress={() => pairDrawer.open(true)} />

      {pairDrawer.target ? (
        <FullScreenDrawer
          title={t`Pair a connection`}
          label={t`Pair a connection`}
          closeLabel={t`Close pairing`}
          closing={pairDrawer.closing}
          onClose={pairDrawer.close}
        >
          <p className="m-card__hint">
            <Trans>
              Open Settings → Remote Access in Poracode on your desktop, then scan the QR code from
              here — or enter the endpoint and pairing token manually.
            </Trans>
          </p>
          {showPairingHint ? (
            <p className="m-card__hint m-card__hint--accent">
              <Trans>Pairing link detected.</Trans>
            </p>
          ) : null}
          <Button
            className="m-form__submit text-foreground"
            size="sm"
            variant="tertiary"
            isDisabled={pairing ?? false}
            onPress={() => setScanning(true)}
          >
            <QrCode className="size-4" />
            <Trans>Scan QR code</Trans>
          </Button>
          <InstallAppButton />
          <div className="m-form">
            <label className="m-field">
              <span className="m-field__label">
                <Trans>Endpoint</Trans>
              </span>
              <input
                value={props.manualEndpoint}
                aria-label={t`Endpoint`}
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="http://192.168.1.20:38987/"
                onChange={(event) => props.onEndpointChange(event.currentTarget.value)}
              />
            </label>
            <label className="m-field">
              <span className="m-field__label">
                <Trans>Pairing token</Trans>
              </span>
              <input
                value={props.manualToken}
                aria-label={t`Pairing token`}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="lc_pair_…"
                onChange={(event) => props.onTokenChange(event.currentTarget.value)}
              />
            </label>
            <Button
              className="m-form__submit text-foreground"
              size="sm"
              variant="tertiary"
              isDisabled={pairing || !props.canPair}
              onPress={props.onPair}
            >
              {pairing ? <Loader2 className="size-4 m-spin" /> : <Smartphone className="size-4" />}
              {pairing ? t`Pairing…` : t`Pair`}
            </Button>
          </div>
        </FullScreenDrawer>
      ) : null}
    </section>
  );
}
