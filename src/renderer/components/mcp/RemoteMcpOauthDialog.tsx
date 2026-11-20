import { useState } from "react";
import { Modal, Input, Label, TextField } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common/Button";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";
import { openSystemBrowserUrl } from "@/renderer/utils/openSystemBrowserUrl";
import { friendlyError } from "@/shared/messages";

export function RemoteMcpOauthDialog(props: {
  name: string;
  authorizationUrl: string;
  onComplete: (callbackUrl: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const [callback, setCallback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async () => {
    if (busy || !callback.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      await props.onComplete(callback.trim());
      props.onClose();
    } catch (failure) {
      setError(friendlyError(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal.Backdrop isOpen onOpenChange={(open) => !open && !busy && props.onClose()}>
      <Modal.Container placement="center" size="md">
        <Modal.Dialog>
          <Modal.Header>
            <Modal.Heading>
              <Trans>Sign in to {props.name}</Trans>
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="space-y-3">
            <p className="text-sm text-muted">
              <Trans>
                After authorizing, copy the full URL from the browser address bar and paste it here,
                even if the page fails to load.
              </Trans>
            </p>
            {isBrowserClientRuntime() ? (
              <a
                className="text-sm text-accent underline"
                href={props.authorizationUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Trans>Open in browser</Trans>
              </a>
            ) : (
              <Button
                size="sm"
                variant="tertiary"
                onPress={() => {
                  setError(undefined);
                  void openSystemBrowserUrl(props.authorizationUrl).catch(() =>
                    setError(t`Connection failed.`),
                  );
                }}
              >
                <Trans>Open in browser</Trans>
              </Button>
            )}
            <TextField value={callback} onChange={setCallback} isDisabled={busy}>
              <Label>
                <Trans>Callback URL</Trans>
              </Label>
              <Input type="url" maxLength={8192} autoComplete="off" spellCheck={false} />
            </TextField>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="ghost" isDisabled={busy} onPress={props.onClose}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant="primary"
              isPending={busy}
              isDisabled={!callback.trim()}
              onPress={() => void submit()}
            >
              {t`Continue`}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
