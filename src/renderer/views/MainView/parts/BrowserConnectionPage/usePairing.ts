import { useRef, useState } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useAsyncOperation } from "@/renderer/hooks/useAsyncOperation";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { normalizePairingEndpoint, parsePairingUrlParts } from "@/shared/remote/pairingUrl";
import {
  beginDirectPair,
  commitDirectPair,
  failDirectPair,
  resetSettledPairingIntent,
} from "@/renderer/pairingDirect";
import {
  initialPairingIntentState,
  type PairingIntentState,
} from "@/shared/remote/contract/pairingMachine";
import { decodeQrImageFile } from "@/renderer/utils/qrImage";

/**
 * Pairing transport and scanner state shared by both connection surfaces: parse a
 * pairing URL — typed, pasted, or decoded from a QR code — then register and
 * connect the server. The surfaces differ only in how they lay this out.
 *
 * The candidate decision (complete candidate -> pair attempt -> commit/failure)
 * is driven by the shared pairing state machine
 * (`shared/remote/contract/pairingMachine.ts`): this surface is the spec's
 * direct in-app manual path, so every resolved candidate pairs without a
 * confirmation stop, and each attempt sees a fresh guard context — manual
 * re-pairing of the same server must always stay possible.
 */
export function usePairing() {
  const { t } = useLingui();
  const pairServer = useRemoteServersStore((state) => state.pairServer);
  const connectAll = useRemoteServersStore((state) => state.connectAll);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanRejection, setScanRejection] = useState<string | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const { busy, error, run } = useAsyncOperation();
  const intentState = useRef<PairingIntentState>(initialPairingIntentState());

  const openScanner = () => {
    setScanRejection(null);
    setScanning(true);
  };

  const closeScanner = () => {
    setScanning(false);
    setScanRejection(null);
  };

  const pairWithCredentials = (endpoint: string, token: string) => {
    setValidationError(null);
    // A deliberate new pairing clears a settled intent first; `pairInFlight`
    // refuses a second begin, matching the native coordinators.
    intentState.current = resetSettledPairingIntent(intentState.current, endpoint, token);
    // Direct in-app candidate: the spec routes a complete candidate straight
    // into the pair attempt (no confirmation stop, no duplicate burn).
    const step = beginDirectPair(intentState.current, endpoint, token);
    if (!step.began) {
      setValidationError(t`Enter the pairing URL shown on your desktop.`);
      return;
    }
    intentState.current = step.state;
    run(async () => {
      try {
        await pairServer({ endpoint, token });
        intentState.current = commitDirectPair(intentState.current, endpoint, token);
        await connectAll();
      } catch (cause) {
        intentState.current = failDirectPair(intentState.current, endpoint, token);
        throw cause;
      }
    });
  };

  const pairFromValue = (value: string) => {
    const parsed = parsePairingUrlParts(value);
    if (!parsed) {
      setValidationError(t`Enter the pairing URL shown on your desktop.`);
      return;
    }
    const endpoint = normalizePairingEndpoint(parsed.host ?? parsed.url.toString());
    pairWithCredentials(endpoint, parsed.token);
  };

  const pairFromCredentials = (endpointValue: string, tokenValue: string) => {
    let endpoint: string;
    try {
      endpoint = normalizePairingEndpoint(endpointValue);
    } catch {
      setValidationError(t`Enter the pairing URL shown on your desktop.`);
      return;
    }
    pairWithCredentials(endpoint, tokenValue.trim());
  };

  /**
   * Pairs from a live camera decode, reporting back whether the code was taken.
   * A decode that is not a pairing link leaves the camera running and shows a
   * correction, so an unrelated QR code drifting into frame does not dump the
   * user back to the start.
   */
  const pairFromScan = (value: string): boolean => {
    if (!parsePairingUrlParts(value)) {
      setScanRejection(t`That isn't a Poracode pairing code.`);
      return false;
    }
    closeScanner();
    pairFromValue(value);
    return true;
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
    scanning,
    scanRejection,
    openScanner,
    closeScanner,
    pairFromValue,
    pairFromCredentials,
    pairFromScan,
    onScanFile,
    // The hidden file input's element stays behind this committed-component
    // boundary: surfaces attach it and trigger it through callbacks instead
    // of reading a shared ref during render.
    attachScanInput: (node: HTMLInputElement | null) => {
      scanInputRef.current = node;
    },
    clickScanInput: () => {
      scanInputRef.current?.click();
    },
  };
}

export type Pairing = ReturnType<typeof usePairing>;
