import { useEffect, useState } from "react";
import { Button, Checkbox, Modal, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Cookie, KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { readBridge } from "@/renderer/bridge";
import { Select, ToggleSwitch } from "@/renderer/components/common";
import { useBrowserImportStore } from "@/renderer/state/browserImportStore";
import type { BrowserImportSourceInfo } from "@/shared/ipc";

export function BrowserImportModal() {
  const { t } = useLingui();
  const open = useBrowserImportStore((state) => state.open);
  const setOpen = useBrowserImportStore((state) => state.setOpen);
  const [sources, setSources] = useState<BrowserImportSourceInfo[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [passwords, setPasswords] = useState(true);
  const [cookies, setCookies] = useState(true);
  const [acknowledgeProtectedData, setAcknowledgeProtectedData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSources([]);
    setSourceId("");
    setLoading(true);
    setAcknowledgeProtectedData(false);
    readBridge()
      .browserListImportSources()
      .then((items) => {
        if (cancelled) return;
        setSources(items);
        const first = items[0];
        setSourceId(first?.id ?? "");
        setPasswords(first?.supportsPasswords === true);
        setCookies(first?.supportsCookies === true);
      })
      .catch(() => {
        if (!cancelled) toast.danger(t`Unable to find browser data to import.`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  const selectedSource = sources.find((source) => source.id === sourceId);
  const needsProtectedDataAcknowledgement =
    selectedSource?.hasAppBoundData === true && (passwords || cookies);
  const canImport =
    !!selectedSource &&
    ((passwords && selectedSource.supportsPasswords) ||
      (cookies && selectedSource.supportsCookies)) &&
    (!needsProtectedDataAcknowledgement || acknowledgeProtectedData);
  const sourceOptions = sources.map((source) => ({
    id: source.id,
    label: `${source.browserLabel} — ${source.profileLabel}`,
  }));

  function selectSource(id: string) {
    const source = sources.find((item) => item.id === id);
    setSourceId(id);
    setPasswords(source?.supportsPasswords === true);
    setCookies(source?.supportsCookies === true);
    setAcknowledgeProtectedData(false);
  }

  async function importData() {
    if (!selectedSource || !canImport) return;
    setImporting(true);
    try {
      const result = await readBridge().browserImportData({
        sourceId: selectedSource.id,
        passwords: passwords && selectedSource.supportsPasswords,
        cookies: cookies && selectedSource.supportsCookies,
        acknowledgeProtectedData,
      });
      if (result.passwordsImported + result.cookiesImported === 0) {
        toast.danger(t`Unable to import browser data.`);
        return;
      }
      toast.success(
        t`Imported passwords: ${result.passwordsImported}. Imported cookies: ${result.cookiesImported}.`,
      );
      const skipped =
        result.passwordsSkipped + result.cookiesSkipped + result.protectedItemsSkipped;
      if (skipped > 0 || result.errors.length > 0) {
        toast.warning(
          t`Some browser data was skipped. Protected items skipped: ${result.protectedItemsSkipped}.`,
        );
      }
      setOpen(false);
    } catch {
      toast.danger(t`Unable to import browser data.`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal.Backdrop
      isOpen={open}
      variant="opaque"
      className="z-[1100] bg-black/60"
      onOpenChange={(nextOpen) => !nextOpen && !importing && setOpen(false)}
    >
      <Modal.Container placement="center" size="sm">
        <Modal.Dialog className="sm:max-w-[480px]">
          <Modal.CloseTrigger isDisabled={importing} />
          <Modal.Header>
            <Modal.Heading>
              <Trans>Import from your browser</Trans>
            </Modal.Heading>
            <p className="mt-0.5 text-xs text-muted">
              <Trans>Choose data to bring over to the built-in browser.</Trans>
            </p>
          </Modal.Header>
          <Modal.Body className="gap-3 p-4">
            {loading ? (
              <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted">
                <Loader2 className="size-4 animate-spin" />
                <Trans>Looking for browser profiles…</Trans>
              </div>
            ) : sources.length === 0 ? (
              <div className="rounded-lg border border-border bg-surface-secondary p-4 text-sm text-muted">
                <Trans>No supported browser profiles were found on this device.</Trans>
              </div>
            ) : (
              <>
                <Select
                  aria-label={t`Import source`}
                  label={t`From`}
                  options={sourceOptions}
                  value={sourceId}
                  onChange={selectSource}
                />

                <div className="overflow-hidden rounded-xl border border-border bg-surface">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <KeyRound className="size-4 shrink-0 text-muted" />
                    <span className="flex-1 text-sm font-medium">
                      <Trans>Passwords</Trans>
                    </span>
                    <ToggleSwitch
                      aria-label={t`Import passwords`}
                      isSelected={passwords}
                      isDisabled={!selectedSource?.supportsPasswords}
                      onChange={setPasswords}
                    />
                  </div>
                  <div className="flex items-center gap-3 border-t border-border px-3 py-2.5">
                    <Cookie className="size-4 shrink-0 text-muted" />
                    <span className="flex-1 text-sm font-medium">
                      <Trans>Cookies</Trans>
                    </span>
                    <ToggleSwitch
                      aria-label={t`Import cookies`}
                      isSelected={cookies}
                      isDisabled={!selectedSource?.supportsCookies}
                      onChange={setCookies}
                    />
                  </div>
                </div>

                {needsProtectedDataAcknowledgement ? (
                  <div className="rounded-xl border border-warning/35 bg-warning/10 p-3">
                    <div className="flex items-start gap-2.5">
                      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                      <div>
                        <p className="text-xs font-semibold text-foreground">
                          <Trans>Protected browser data</Trans>
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted">
                          <Trans>
                            Some Chromium browsers protect cookies and passwords with App-Bound
                            Encryption. Poracode does not bypass that protection. Data the operating
                            system does not make available will be skipped.
                          </Trans>
                        </p>
                      </div>
                    </div>
                    <Checkbox
                      className="mt-3"
                      variant="secondary"
                      isSelected={acknowledgeProtectedData}
                      onChange={setAcknowledgeProtectedData}
                    >
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        <span className="text-xs">
                          <Trans>I understand that protected browser data may be skipped.</Trans>
                        </span>
                      </Checkbox.Content>
                    </Checkbox>
                  </div>
                ) : null}
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="tertiary" isDisabled={importing} onPress={() => setOpen(false)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant="primary"
              isPending={importing}
              isDisabled={loading || !canImport}
              onPress={() => void importData()}
            >
              <Trans>Import</Trans>
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
