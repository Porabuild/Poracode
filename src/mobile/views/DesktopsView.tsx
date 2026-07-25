import { useEffect, useRef, useState } from "react";
import { Button, Input, Label, Tabs, TextArea, TextField, toast } from "@heroui/react";
import type { SshBridgeAuthentication } from "@poracode/ssh-bridge";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
  Check,
  Download,
  ExternalLink,
  KeyRound,
  Laptop,
  Loader2,
  Pencil,
  QrCode,
  Server,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useLongPress } from "@/renderer/hooks/useLongPress";
import { formatShortDateTime } from "@/renderer/utils/formatTime";
import { InlineRenameInput } from "@/renderer/views/MainView/parts/Sidebar/parts/InlineRenameInput";
import { Fab, EmptyState, FullScreenDrawer, SheetMenu, useSheet } from "../components";
import { QrScanner } from "../QrScanner";
import { parsePairingUrl } from "../pairing";
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
  /**
   * Present only after this https page failed to reach a cleartext LAN endpoint:
   * leaves for the copy of the app the desktop serves itself, carrying the same
   * pairing credential.
   */
  readonly onOpenDesktopServedApp?: () => void;
  readonly onSwitch: (desktop: StoredDesktop) => void;
  /** Save a local nickname for the desktop. */
  readonly onRename: (desktop: StoredDesktop, label: string) => void;
  readonly onForget: (desktop: StoredDesktop) => void;
  readonly onProbeSsh: (
    target: string,
    port: number,
  ) => Promise<{ readonly fingerprint: string; readonly algorithm: string }>;
  readonly onPairSsh: (input: MobileSshPairRequest) => Promise<void>;
}

export interface MobileSshPairRequest {
  readonly target: string;
  readonly port: number;
  readonly fingerprint: string;
  readonly authentication: SshBridgeAuthentication;
}

/** "Poracode on host" → "host"; the brand prefix is noise inside the app.
 *  Legacy "Lightcode on …" labels (paired pre-rebrand) are stripped too. */
function desktopTitle(label: string): string {
  const stripped = label.replace(/^(?:Poracode|Lightcode)\s+on\s+/i, "");
  return stripped || label;
}

/** "http://172.16.21.25:49152/" → "172.16.21.25:49152". */
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
  const ssh = desktop.transport?.kind === "ssh";
  return (
    <button type="button" className="m-thread-row" onClick={props.onSwitch} {...longPressHandlers}>
      {ssh ? (
        <Server className="size-4 shrink-0 text-muted" />
      ) : (
        <Laptop className="size-4 shrink-0 text-muted" />
      )}
      <span className="m-thread-row__body">
        <span className="m-thread-row__title">{title}</span>
        <span className="m-thread-row__meta">
          <span className="m-thread-row__meta-item">
            {ssh ? desktop.transport.connection.target : endpointHost(desktop.endpoint)}
          </span>
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

function SshPairingForm(props: {
  readonly onProbe: DesktopsViewProps["onProbeSsh"];
  readonly onPair: DesktopsViewProps["onPairSsh"];
}) {
  const { t } = useLingui();
  const [target, setTarget] = useState("");
  const [port, setPort] = useState("22");
  const [authKind, setAuthKind] = useState<"password" | "private-key">("password");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [checking, setChecking] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [pending, setPending] = useState<MobileSshPairRequest & { readonly algorithm: string }>();

  function authentication(): SshBridgeAuthentication | null {
    if (authKind === "password") {
      return password ? { kind: "password", password } : null;
    }
    return privateKey
      ? {
          kind: "private-key",
          privateKey,
          ...(passphrase ? { passphrase } : {}),
        }
      : null;
  }

  async function probe() {
    const parsedPort = Number(port);
    const credential = authentication();
    if (!target.trim() || !Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535) {
      toast.danger(t`Enter a valid SSH target and port.`);
      return;
    }
    if (!credential) {
      toast.danger(
        authKind === "password" ? t`Enter the SSH password.` : t`Paste the SSH private key.`,
      );
      return;
    }
    setChecking(true);
    try {
      const hostKey = await props.onProbe(target.trim(), parsedPort);
      setPending({
        target: target.trim(),
        port: parsedPort,
        authentication: credential,
        fingerprint: hostKey.fingerprint,
        algorithm: hostKey.algorithm,
      });
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : t`Unable to probe the SSH host.`);
    } finally {
      setChecking(false);
    }
  }

  async function trustAndConnect() {
    if (!pending) return;
    setConnecting(true);
    try {
      const { algorithm: _algorithm, ...request } = pending;
      await props.onPair(request);
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : t`Unable to connect over SSH.`);
      setConnecting(false);
    }
  }

  if (pending) {
    return (
      <div className="m-form">
        <div className="m-card">
          <ShieldCheck className="size-5 text-accent" />
          <div>
            <strong>
              <Trans>Verify SSH host key</Trans>
            </strong>
            <p className="m-card__hint">
              <Trans>Compare this fingerprint with the one shown by your server.</Trans>
            </p>
            <code className="break-all text-xs">{pending.fingerprint}</code>
            <p className="m-card__hint">{pending.algorithm}</p>
          </div>
        </div>
        <Button
          className="m-form__submit text-foreground"
          size="sm"
          variant="tertiary"
          isDisabled={connecting}
          onPress={() => setPending(undefined)}
        >
          <Trans>Cancel</Trans>
        </Button>
        <Button
          className="m-form__submit text-foreground"
          size="sm"
          isPending={connecting}
          onPress={() => void trustAndConnect()}
        >
          {connecting ? <Loader2 className="size-4 m-spin" /> : <ShieldCheck className="size-4" />}
          {connecting ? t`Connecting…` : t`Trust and connect`}
        </Button>
      </div>
    );
  }

  return (
    <div className="m-form">
      <p className="m-card__hint">
        <Trans>
          Poracode will install or reuse its server on the SSH host and keep credentials in this
          device's secure storage.
        </Trans>
      </p>
      <TextField fullWidth value={target} onChange={setTarget}>
        <Label>
          <Trans>SSH target</Trans>
        </Label>
        <Input
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t`user@example.com`}
        />
      </TextField>
      <TextField fullWidth value={port} onChange={setPort}>
        <Label>
          <Trans>Port</Trans>
        </Label>
        <Input inputMode="numeric" placeholder={t`22`} />
      </TextField>
      <Tabs
        variant="secondary"
        selectedKey={authKind}
        onSelectionChange={(key) => setAuthKind(key === "private-key" ? "private-key" : "password")}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label={t`SSH authentication`}>
            <Tabs.Tab id="password">
              <Trans>Password</Trans>
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="private-key">
              <Trans>Private key</Trans>
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="password">
          <TextField fullWidth value={password} onChange={setPassword}>
            <Label>
              <Trans>Password</Trans>
            </Label>
            <Input type="password" autoComplete="off" />
          </TextField>
        </Tabs.Panel>
        <Tabs.Panel id="private-key">
          <div className="m-form">
            <TextField fullWidth value={privateKey} onChange={setPrivateKey}>
              <Label>
                <Trans>OpenSSH private key</Trans>
              </Label>
              <TextArea rows={7} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
            </TextField>
            <TextField fullWidth value={passphrase} onChange={setPassphrase}>
              <Label>
                <Trans>Passphrase (optional)</Trans>
              </Label>
              <Input type="password" autoComplete="off" />
            </TextField>
          </div>
        </Tabs.Panel>
      </Tabs>
      <Button
        className="m-form__submit text-foreground"
        size="sm"
        variant="tertiary"
        isPending={checking}
        onPress={() => void probe()}
      >
        {checking ? <Loader2 className="size-4 m-spin" /> : <KeyRound className="size-4" />}
        {checking ? t`Checking host…` : t`Verify host key`}
      </Button>
    </div>
  );
}

function DesktopRowTrigger(props: {
  readonly open: () => void;
  readonly title: string;
  readonly desktop: StoredDesktop;
  readonly isActive: boolean;
  readonly onSwitch: () => void;
}) {
  return (
    <DesktopRowButton
      title={props.title}
      desktop={props.desktop}
      isActive={props.isActive}
      onSwitch={props.onSwitch}
      onMenu={props.open}
    />
  );
}

/**
 * Builds the `SheetMenu` `trigger` render-prop for a `DesktopRow`. Defined at
 * module scope (rather than as an inline arrow in `DesktopRow`'s render body)
 * so the callback isn't redefined as an anonymous nested function on every
 * render — `SheetMenu` calls this directly (not as a JSX component), so the
 * row's live values are threaded through as explicit arguments.
 */
function createDesktopRowTrigger(extra: {
  readonly title: string;
  readonly desktop: StoredDesktop;
  readonly isActive: boolean;
  readonly onSwitch: () => void;
}) {
  return function renderDesktopRowTrigger(api: { readonly open: () => void }) {
    return <DesktopRowTrigger open={api.open} {...extra} />;
  };
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
      trigger={createDesktopRowTrigger({
        title,
        desktop,
        isActive: props.isActive,
        onSwitch: props.onSwitch,
      })}
    />
  );
}

export function DesktopsView(props: DesktopsViewProps) {
  const { t } = useLingui();
  const nativeApp = isNativeApp();
  const [scanning, setScanning] = useState(false);
  const [pairingMethod, setPairingMethod] = useState("pairing-link");
  const { pairing, onScan, showPairingHint } = props;
  // The pairing form lives in a drawer opened from the FAB.
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

  function updatePairingField(value: string, updateField: (next: string) => void) {
    const parsed = parsePairingUrl(value);
    if (!parsed?.credential) {
      updateField(value);
      return;
    }
    props.onEndpointChange(parsed.endpoint);
    props.onTokenChange(parsed.credential);
  }

  const pairingLinkForm = (
    <div className="m-form">
      <p className="m-card__hint">
        <Trans>
          Open Settings → Remote Access in Poracode on your desktop, then scan the QR code from here
          — or enter the endpoint and pairing token manually.
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
          placeholder="http://192.168.1.20:49152/"
          onChange={(event) =>
            updatePairingField(event.currentTarget.value, props.onEndpointChange)
          }
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
          onChange={(event) => updatePairingField(event.currentTarget.value, props.onTokenChange)}
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
      {props.onOpenDesktopServedApp ? (
        <>
          <p className="m-card__hint">
            <Trans>
              This HTTPS page couldn't reach the desktop on plain HTTP. Allow local network access
              for this site and pair again, or continue on the desktop's own address.
            </Trans>
          </p>
          <Button
            className="m-form__submit text-foreground"
            size="sm"
            variant="tertiary"
            isDisabled={pairing ?? false}
            onPress={props.onOpenDesktopServedApp}
          >
            <ExternalLink className="size-4" />
            <Trans>Continue on the desktop address</Trans>
          </Button>
        </>
      ) : null}
    </div>
  );
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
          hint={<Trans>Use + to pair directly or connect to a remote machine over SSH.</Trans>}
        />
      )}

      <Fab label={t`Pair a connection`} onPress={() => pairDrawer.open(true)} />

      {pairDrawer.target ? (
        <FullScreenDrawer
          title={t`Pair a connection`}
          label={t`Pair a connection`}
          fitContent={!nativeApp}
          closeLabel={t`Close pairing`}
          closing={pairDrawer.closing}
          onClose={pairDrawer.close}
        >
          {nativeApp ? (
            <Tabs
              selectedKey={pairingMethod}
              variant="secondary"
              onSelectionChange={(key) => setPairingMethod(String(key))}
            >
              <Tabs.ListContainer>
                <Tabs.List aria-label={t`Connection method`}>
                  <Tabs.Tab id="pairing-link">
                    <Trans>Pairing link</Trans>
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab id="ssh">
                    <Trans>SSH</Trans>
                    <Tabs.Indicator />
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>
              <Tabs.Panel id="pairing-link">{pairingLinkForm}</Tabs.Panel>
              <Tabs.Panel id="ssh">
                <SshPairingForm onProbe={props.onProbeSsh} onPair={props.onPairSsh} />
              </Tabs.Panel>
            </Tabs>
          ) : (
            pairingLinkForm
          )}
        </FullScreenDrawer>
      ) : null}
    </section>
  );
}
