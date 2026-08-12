import { Button, Input } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Download, Loader2 } from "lucide-react";
import { isIosInstallBrowser, useCanInstall, promptInstall } from "@/renderer/pwa/install";
import type { Pairing } from "../usePairing";

/** Where the desktop shows its pairing code — repeated on both surfaces. */
export function DesktopHint() {
  return (
    <p className="mt-8 text-center text-xs leading-5 text-muted">
      <Trans>
        Open Settings → Remote Access in Poracode on your desktop, then scan the QR code from here —
        or enter the endpoint and pairing token manually.
      </Trans>
    </p>
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

/** Hidden picker the scan surfaces trigger; on phones it opens the camera. */
export function ScanFileInput({ pairing }: { readonly pairing: Pairing }) {
  const { t } = useLingui();
  return (
    <input
      ref={pairing.scanInputRef}
      className="sr-only"
      type="file"
      accept="image/*"
      capture="environment"
      aria-label={t`QR Code`}
      onChange={(event) => void pairing.onScanFile(event.currentTarget.files?.[0])}
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
  readonly label: React.ReactNode;
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
