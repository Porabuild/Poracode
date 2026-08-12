import { useRef, useState } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useAsyncOperation } from "@/renderer/hooks/useAsyncOperation";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { normalizePairingEndpoint, parsePairingUrlParts } from "@/shared/remote/pairingUrl";
import { decodeQrImageFile } from "@/renderer/utils/qrImage";

/**
 * Pairing transport shared by both connection surfaces: parse a pairing URL —
 * typed, pasted, or decoded from a QR image — then register and connect the
 * server. The surfaces differ only in how they collect that URL.
 */
export function usePairing() {
  const { t } = useLingui();
  const pairServer = useRemoteServersStore((state) => state.pairServer);
  const connectAll = useRemoteServersStore((state) => state.connectAll);
  const [validationError, setValidationError] = useState<string | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const { busy, error, run } = useAsyncOperation();

  const pairFromValue = (value: string) => {
    const parsed = parsePairingUrlParts(value);
    if (!parsed) {
      setValidationError(t`Enter the pairing URL shown on your desktop.`);
      return;
    }
    setValidationError(null);
    const endpoint = normalizePairingEndpoint(parsed.host ?? parsed.url.toString());
    run(async () => {
      await pairServer({ endpoint, token: parsed.token });
      await connectAll();
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
      pairFromValue(value);
    } catch {
      toast.danger(t`Unable to read the pairing QR code.`);
    } finally {
      if (scanInputRef.current) scanInputRef.current.value = "";
    }
  };

  return {
    busy,
    error,
    validationError,
    setValidationError,
    pairFromValue,
    onScanFile,
    scanInputRef,
  };
}

export type Pairing = ReturnType<typeof usePairing>;
