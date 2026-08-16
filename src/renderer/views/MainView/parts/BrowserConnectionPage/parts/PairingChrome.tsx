import type { KeyboardEvent, ReactNode } from "react";
import { Button, Drawer, Input } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  ChevronDown,
  ClipboardPaste,
  Download,
  Link2,
  Loader2,
  MoreHorizontal,
  QrCode,
  SlidersHorizontal,
} from "lucide-react";
import { isIosInstallBrowser, useCanInstall, promptInstall } from "@/renderer/pwa/install";
import type { Pairing } from "../usePairing";
import { QrScanner } from "./QrScanner";

/**
 * The live scanner plus its standard wiring, so each surface only has to say what
 * "enter it by hand instead" means for its own layout. Renders nothing until the
 * scanner is open.
 */
export function PairingScannerOverlay(props: {
  readonly pairing: Pairing;
  readonly onEnterManually: () => void;
}) {
  const { pairing } = props;
  if (!pairing.scanning) return null;
  return (
    <QrScanner
      rejection={pairing.scanRejection}
      onResult={pairing.pairFromScan}
      onCancel={pairing.closeScanner}
      onPickPhoto={() => {
        pairing.closeScanner();
        pairing.scanInputRef.current?.click();
      }}
      onEnterManually={() => {
        pairing.closeScanner();
        props.onEnterManually();
      }}
    />
  );
}

/**
 * The primary pairing route. A card rather than a button: on the first screen a
 * new user sees, the one thing we want them to do should read as the surface's
 * subject, not as one control among several.
 */
export function ScanCard(props: {
  readonly pairing: Pairing;
  /** Phones get a full-width thumb target; a mouse-sized card suits desktop. */
  readonly compact?: boolean;
  readonly className?: string;
}) {
  const { t } = useLingui();
  const { pairing } = props;
  return (
    <button
      type="button"
      aria-label={t`Scan the desktop pairing code with the camera`}
      disabled={pairing.busy}
      onClick={pairing.openScanner}
      className={`poracode-pair-card group flex w-full touch-manipulation items-center gap-4 text-left disabled:opacity-70 ${
        props.compact ? "px-5 py-4" : "px-5 py-5"
      } ${props.className ?? ""}`}
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-accent">
        <QrCode className="size-6" strokeWidth={1.5} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[0.9375rem] font-semibold text-foreground">
          {pairing.busy ? <Trans>Pairing…</Trans> : <Trans>Scan pairing code</Trans>}
        </span>
        <span className="text-xs leading-5 text-muted">
          <Trans>Open Settings → Remote Access on your desktop to show the code.</Trans>
        </span>
      </span>
      <ChevronDown className="size-4 shrink-0 -rotate-90 text-muted" />
    </button>
  );
}

/**
 * Everything that is not scanning, in a bottom drawer. Scanning is what almost
 * everyone will use, so pasting a link is demoted rather than presented as an
 * equal choice — but it stays one tap away in the phone's thumb zone.
 *
 * Controlled because the surface opens it on the user's behalf when a device
 * cannot scan or the scanner falls back to manual entry.
 */
export function OtherWaysDrawer(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly pairing: Pairing;
  readonly pairingUrl: string;
  readonly onPairingUrlChange: (value: string) => void;
  readonly endpoint: string;
  readonly onEndpointChange: (value: string) => void;
  readonly token: string;
  readonly onTokenChange: (value: string) => void;
  readonly className?: string;
}) {
  const { t } = useLingui();
  const canPairFromLink = props.pairingUrl.trim().length > 0;
  const canPairManually = props.endpoint.trim().length > 0 && props.token.trim().length > 0;
  const canSubmit = !props.pairing.busy && (canPairFromLink || canPairManually);
  const canReadClipboard =
    typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function";
  const clearError = () => props.pairing.setValidationError(null);
  const pastePairingLink = async () => {
    if (!canReadClipboard) return;
    try {
      const value = await navigator.clipboard.readText();
      if (value.length === 0) return;
      props.onPairingUrlChange(value);
      clearError();
    } catch {
      // Clipboard permission remains browser-owned; the field still supports
      // the platform paste menu when programmatic reading is unavailable.
    }
  };
  const submit = () => {
    if (!canSubmit) return;
    if (canPairFromLink) {
      props.pairing.pairFromValue(props.pairingUrl);
      return;
    }
    props.pairing.pairFromCredentials(props.endpoint, props.token);
  };
  const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") submit();
  };

  return (
    <div className={`flex w-full flex-col ${props.className ?? ""}`}>
      <button
        type="button"
        aria-expanded={props.open}
        onClick={() => props.onOpenChange(true)}
        className="flex h-12 w-full touch-manipulation items-center justify-center gap-2 rounded-2xl text-sm text-muted transition-colors hover:bg-default hover:text-foreground"
      >
        <MoreHorizontal className="size-4" />
        <Trans>Other ways to connect</Trans>
        <ChevronDown className="size-4 -rotate-90" />
      </button>

      <Drawer.Backdrop
        isOpen={props.open}
        onOpenChange={props.onOpenChange}
        variant="blur"
        className="poracode-pairing-drawer-viewport"
      >
        <Drawer.Content placement="bottom" className="poracode-pairing-drawer-viewport">
          <Drawer.Dialog className="poracode-pairing-drawer-dialog max-h-[min(80lvh,42rem)] rounded-t-[1.75rem] bg-surface !p-0">
            <Drawer.Handle className="pb-3 pt-2" />
            <Drawer.Header className="px-6 pb-4">
              <Drawer.Heading>
                <Trans>Other ways to connect</Trans>
              </Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body className="px-6 pb-5">
              <div className="flex w-full flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor="poracode-pairing-link"
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
                      isDisabled={props.pairing.busy || !canReadClipboard}
                      onPress={() => void pastePairingLink()}
                    >
                      <ClipboardPaste className="size-3.5" />
                    </Button>
                  </div>
                  <Input
                    id="poracode-pairing-link"
                    aria-label={t`Pairing URL`}
                    className="h-12 w-full text-base"
                    value={props.pairingUrl}
                    placeholder={t`Paste pairing URL…`}
                    inputMode="url"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    disabled={props.pairing.busy}
                    onChange={(event) => {
                      props.onPairingUrlChange(event.currentTarget.value);
                      clearError();
                    }}
                    onKeyDown={submitOnEnter}
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
                    value={props.endpoint}
                    placeholder={t`Server base URL`}
                    inputMode="url"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    disabled={props.pairing.busy}
                    onChange={(event) => {
                      props.onEndpointChange(event.currentTarget.value);
                      clearError();
                    }}
                    onKeyDown={submitOnEnter}
                  />
                  <Input
                    aria-label={t`One-time pairing token`}
                    className="h-12 w-full text-base"
                    type="password"
                    value={props.token}
                    placeholder={t`One-time pairing token`}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    disabled={props.pairing.busy}
                    onChange={(event) => {
                      props.onTokenChange(event.currentTarget.value);
                      clearError();
                    }}
                    onKeyDown={submitOnEnter}
                  />
                </div>

                <PairingErrors pairing={props.pairing} />
              </div>
            </Drawer.Body>
            <Drawer.Footer className="poracode-pairing-drawer-footer border-t border-border px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <Button
                fullWidth
                variant="primary"
                className="h-12 justify-center"
                isDisabled={!canSubmit}
                onPress={submit}
              >
                {props.pairing.busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {props.pairing.busy ? <Trans>Pairing…</Trans> : <Trans>Connect</Trans>}
              </Button>
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </div>
  );
}

export function PairingErrors({ pairing }: { readonly pairing: Pairing }) {
  return (
    <>
      {pairing.validationError ? (
        <p role="alert" className="mt-3 text-center text-xs text-danger">
          {pairing.validationError}
        </p>
      ) : null}
      {pairing.error ? (
        <p role="alert" className="mt-3 text-center text-xs text-danger">
          {pairing.error}
        </p>
      ) : null}
    </>
  );
}

/** Hidden photo picker used when live camera scanning is unavailable or unwanted. */
export function ScanFileInput({ pairing }: { readonly pairing: Pairing }) {
  const { t } = useLingui();
  return (
    <input
      ref={pairing.scanInputRef}
      className="sr-only"
      type="file"
      accept="image/*"
      aria-label={t`QR Code`}
      onChange={(event) => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        // Permit retrying the same photo after a failed decode.
        input.value = "";
        void pairing.onScanFile(file);
      }}
    />
  );
}

/**
 * Install recommendation. Running installed beats running in a browser tab
 * (own window, faster launch, works offline), so it is a recommendation rather
 * than a stashed-away option — and iOS Safari, which never fires
 * `beforeinstallprompt`, gets the manual recipe instead of nothing.
 */
export function InstallRecommendation(props: {
  readonly busy: boolean;
  readonly label: ReactNode;
  /** Keep the install action below the pairing action in the visual hierarchy. */
  readonly variant?: "tertiary" | "secondary";
  /** Mouse-sized button instead of the phone's full-width thumb target. */
  readonly compact?: boolean;
}) {
  const canInstallApp = useCanInstall();
  const iosInstall = isIosInstallBrowser();

  if (canInstallApp) {
    return (
      <div className="mt-6 flex flex-col items-center gap-2">
        <Button
          fullWidth={!props.compact}
          variant={props.variant ?? "tertiary"}
          className={`touch-manipulation justify-center gap-2 ${props.compact ? "h-10 px-4" : "h-12"}`}
          isDisabled={props.busy}
          onPress={() => void promptInstall()}
        >
          <Download className="size-4" />
          {props.label}
        </Button>
        <p className="text-center text-xs leading-5 text-muted">
          <Trans>Install Poracode for faster access and offline launch.</Trans>
        </p>
      </div>
    );
  }

  if (!iosInstall) return null;

  return (
    <div className="mt-6 flex flex-col gap-1">
      <p className="text-center text-xs font-medium leading-5 text-foreground">
        <Trans>Install Poracode for faster access and offline launch.</Trans>
      </p>
      <p className="text-center text-xs leading-5 text-muted">
        <Trans>In Safari, tap Share, then Add to Home Screen.</Trans>
      </p>
    </div>
  );
}

/**
 * Pairing URL field plus its Connect button, submitting on Enter.
 *
 * `inline` puts the button beside the field at its natural width — a
 * full-width block button reads as oversized next to a mouse-sized field.
 * `stacked` keeps the full-width thumb target phones need.
 */
export function PairingUrlForm(props: {
  readonly pairing: Pairing;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly layout?: "stacked" | "inline";
  readonly className?: string;
}) {
  const { t } = useLingui();
  const { pairing } = props;
  const inline = props.layout === "inline";
  const submit = () => {
    if (props.value.trim().length > 0) pairing.pairFromValue(props.value);
  };

  return (
    <div
      className={`flex ${inline ? "items-center gap-2" : "flex-col gap-3"} ${props.className ?? ""}`}
    >
      <Input
        aria-label={t`Pairing URL`}
        className={`text-base ${inline ? "h-11 min-w-0 flex-1" : "h-12 w-full"}`}
        value={props.value}
        placeholder={t`Paste pairing URL…`}
        inputMode="url"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        disabled={pairing.busy}
        onChange={(event) => {
          props.onValueChange(event.currentTarget.value);
          pairing.setValidationError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();
        }}
      />
      <Button
        fullWidth={!inline}
        variant="tertiary"
        className={`touch-manipulation justify-center gap-2 ${inline ? "h-11 shrink-0 px-5" : "h-12"}`}
        isDisabled={pairing.busy || props.value.trim().length === 0}
        onPress={submit}
      >
        {pairing.busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {pairing.busy ? <Trans>Pairing…</Trans> : <Trans>Connect</Trans>}
      </Button>
    </div>
  );
}
