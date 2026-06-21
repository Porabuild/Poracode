import { useState } from "react";
import { Button } from "@heroui/react";
import {
  Check,
  Download,
  Ellipsis,
  Laptop,
  Link2,
  Loader2,
  Pencil,
  QrCode,
  Smartphone,
  Trash2,
} from "lucide-react";
import { formatShortDateTime } from "@/renderer/utils/formatTime";
import { InlineRenameInput } from "@/renderer/views/MainView/parts/Sidebar/parts/InlineRenameInput";
import { SheetMenu } from "../components";
import { QrScanner } from "../QrScanner";
import { isNativeApp, isStandaloneDisplay, promptInstall, useCanInstall } from "../pwaInstall";
import type { StoredDesktop } from "../storage";

/** "Add to Home Screen" button — only shown when the browser offers install. */
function InstallAppButton() {
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
      Add to Home Screen
    </Button>
  );
}

export interface DesktopsViewProps {
  readonly desktops: readonly StoredDesktop[];
  readonly activeDesktopId: string | null;
  readonly manualEndpoint: string;
  readonly manualToken: string;
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

/** "Lightcode on host" → "host"; the brand prefix is noise inside the app. */
function desktopTitle(label: string): string {
  const stripped = label.replace(/^Lightcode\s+on\s+/i, "");
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

/** Same card recipe as the thread rows; the switch target and the actions menu
 * are sibling buttons so the card stays one flat tap surface. Renaming swaps the
 * switch button for an inline input, mirroring the thread title row. */
function DesktopRow(props: {
  readonly desktop: StoredDesktop;
  readonly isActive: boolean;
  readonly onSwitch: () => void;
  readonly onRename: (label: string) => void;
  readonly onForget: () => void;
}) {
  const { desktop } = props;
  const [renaming, setRenaming] = useState(false);
  const title = desktopTitle(desktop.label);
  return (
    <div className="m-thread-row m-desktop-row" data-active={props.isActive || undefined}>
      {renaming ? (
        <div className="m-desktop-row__main">
          <Laptop className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <InlineRenameInput
              initialValue={title}
              ariaLabel="Rename desktop"
              onCommit={(value) => {
                props.onRename(value);
                setRenaming(false);
              }}
              onCancel={() => setRenaming(false)}
            />
          </span>
        </div>
      ) : (
        <button type="button" className="m-desktop-row__main" onClick={props.onSwitch}>
          <Laptop className="size-4 shrink-0" />
          <span className="m-thread-row__body">
            <span className="m-thread-row__title">{title}</span>
            <span className="m-thread-row__meta">
              <span className="m-thread-row__meta-item">{endpointHost(desktop.endpoint)}</span>
              <span className="m-thread-row__meta-item">
                {desktop.lastConnectedAt
                  ? `Live ${formatShortDateTime(desktop.lastConnectedAt)}`
                  : "Cached only"}
              </span>
            </span>
          </span>
          {props.isActive ? (
            <Check className="m-desktop-row__check size-4 shrink-0" aria-label="Active" />
          ) : null}
        </button>
      )}
      <SheetMenu
        label={title}
        closeLabel="Close desktop actions"
        items={[
          { id: "rename", label: "Rename", icon: <Pencil className="size-4 text-muted" /> },
          {
            id: "forget",
            label: "Remove desktop",
            icon: <Trash2 className="size-4" />,
            tone: "danger",
          },
        ]}
        onSelect={(id) => {
          if (id === "rename") setRenaming(true);
          if (id === "forget") props.onForget();
        }}
        trigger={({ open }) => (
          <Button
            isIconOnly
            aria-label={`Actions for ${title}`}
            size="sm"
            variant="tertiary"
            onPress={open}
          >
            <Ellipsis className="size-4" />
          </Button>
        )}
      />
    </div>
  );
}

export function DesktopsView(props: DesktopsViewProps) {
  const [scanning, setScanning] = useState(false);
  const { pairing, onScan } = props;
  return (
    <section className="m-page m-desktops">
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
          <h1>Desktops</h1>
          <p>
            {props.desktops.length} paired desktop{props.desktops.length === 1 ? "" : "s"}
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
      ) : null}

      <div className="m-card">
        <h2 className="m-card__title">
          <Link2 className="size-4" />
          Pair a desktop
        </h2>
        <p className="m-card__hint">
          Open Settings → Remote Access in Lightcode on your desktop, then scan the QR code from
          here — or enter the endpoint and pairing token manually.
        </p>
        {props.showPairingHint ? (
          <p className="m-card__hint m-card__hint--accent">Pairing link detected.</p>
        ) : null}
        <Button
          className="m-form__submit text-foreground mb-2.5"
          size="sm"
          variant="tertiary"
          isDisabled={pairing ?? false}
          onPress={() => setScanning(true)}
        >
          <QrCode className="size-4" />
          Scan QR code
        </Button>
        <InstallAppButton />
        <div className="m-form">
          <label className="m-field">
            <span className="m-field__label">Endpoint</span>
            <input
              value={props.manualEndpoint}
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="http://192.168.1.20:38987/"
              onChange={(event) => props.onEndpointChange(event.currentTarget.value)}
            />
          </label>
          <label className="m-field">
            <span className="m-field__label">Pairing token</span>
            <input
              value={props.manualToken}
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
            isDisabled={pairing || !props.manualEndpoint || !props.manualToken}
            onPress={props.onPair}
          >
            {pairing ? <Loader2 className="size-4 m-spin" /> : <Smartphone className="size-4" />}
            {pairing ? "Pairing…" : "Pair"}
          </Button>
        </div>
      </div>
    </section>
  );
}
