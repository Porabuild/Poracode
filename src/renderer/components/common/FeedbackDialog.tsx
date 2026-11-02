import { useEffect, useState } from "react";
import { Input, Label, Modal, TextField } from "@heroui/react";
import { Bug, CircleAlert, ExternalLink, Globe, Lightbulb, Search, Send } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { put } from "@vercel/blob/client";
import { deliverFeedback, FeedbackDeliveryError } from "@/shared/feedbackClient";
import { readBridge } from "@/renderer/bridge";
import {
  useFeedbackDraftStore,
  updateFeedbackDraft,
  resetFeedbackDraft,
} from "@/renderer/state/feedbackDraftStore";
import { Button } from "./Button";
import { LightballTabs } from "./LightballTabs";
import { PixelLoader } from "./PixelLoader";
import { TextArea } from "./TextArea";
import { FeedbackAttachments } from "./FeedbackAttachments";

const SERVICE = "https://poracode.com";

export function FeedbackDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const bridge = readBridge();
  const { kind, title, details, files, delivery } = useFeedbackDraftStore((state) => state.draft);
  const setKind = (value: "bug" | "idea") => updateFeedbackDraft({ kind: value });
  const setTitle = (value: string) => updateFeedbackDraft({ title: value });
  const setDetails = (value: string) => updateFeedbackDraft({ details: value });
  const setFiles = (value: File[]) => updateFeedbackDraft({ files: value });
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const hasDelivery = Boolean(delivery);
  const environment = `Poracode ${bridge.appVersion}; ${bridge.platform}`;
  useEffect(() => {
    let disposed = false;
    void fetch(`${SERVICE}/api/feedback`, {
      credentials: "omit",
      signal: AbortSignal.timeout(10000),
    })
      .then((response) => response.json())
      .then((config) => {
        if (disposed) return;
        setEnabled(Boolean(config.enabled));
        if (!config.enabled)
          setMessage(t`Feedback is temporarily unavailable. Please try again later.`);
      })
      .catch(() => {
        if (!disposed) setMessage(t`Feedback could not load. Please try again later.`);
      });
    return () => {
      disposed = true;
    };
  }, [t]);
  const locked = busy || hasDelivery;
  function add(selected: File[]) {
    if (locked) return;
    const next = [...files, ...selected];
    if (
      next.length > 5 ||
      next.some(
        (file) =>
          file.size < 1 ||
          file.size > 10_000_000 ||
          !/\.(png|jpe?g|webp|gif|mp4|webm)$/i.test(file.name),
      )
    ) {
      setMessage(t`Choose up to 5 supported files, 10 MB each.`);
      return;
    }
    setFiles(next);
    if (enabled) setMessage("");
  }
  async function send() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await deliverFeedback({
        base: SERVICE,
        draft: { kind, title, details, diagnostics: environment },
        files,
        delivery,
        onDelivery: (value) => {
          updateFeedbackDraft({ delivery: value });
        },
        onProgress: (progress) =>
          setMessage(
            progress === "prepare"
              ? t`Preparing your report…`
              : progress === "complete"
                ? t`Finishing your report on GitHub…`
                : t`Uploading attachment ${progress.upload}…`,
          ),
        upload: (grant, file) =>
          put(grant.path, file, { access: "private", token: grant.token, contentType: grant.type }),
      });
      if ("pending" in result) {
        setMessage(t`Still processing. Send again to check the same report.`);
        return;
      }
      setUrl(result.url);
      setFiles([]);
      setTitle("");
      setDetails("");
      resetFeedbackDraft();
    } catch (error) {
      if (error instanceof FeedbackDeliveryError && error.code === "expired")
        updateFeedbackDraft({ delivery: null });
      setMessage(
        error instanceof FeedbackDeliveryError
          ? error.code === "expired"
            ? t`This submission has expired. Your draft is kept.`
            : t`The report could not be confirmed yet. Please retry.`
          : error instanceof Error
            ? error.message
            : t`Feedback could not be sent. Your draft is kept.`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!busy || open) {
          if (!open && !delivery) resetFeedbackDraft();
          onOpenChange(open);
        }
      }}
      isDismissable={!busy}
      isKeyboardDismissDisabled={busy}
    >
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[480px]">
          <Modal.CloseTrigger isDisabled={busy} />
          <Modal.Header>
            <Modal.Heading>
              {url ? <Trans>Feedback sent</Trans> : <Trans>Send feedback</Trans>}
            </Modal.Heading>
            <p className="mt-1 text-xs text-muted">
              {url ? (
                <Trans>Your report and attachments are now on GitHub.</Trans>
              ) : (
                <Trans>Report a bug or suggest an idea.</Trans>
              )}
            </p>
          </Modal.Header>
          {url ? (
            <Modal.Footer>
              <Button slot="close" variant="ghost" className="text-muted">
                <Trans>Close</Trans>
              </Button>
              <Button variant="tertiary" onPress={() => void bridge.openExternal(url)}>
                <ExternalLink className="size-3.5" />
                <Trans>View GitHub issue</Trans>
              </Button>
            </Modal.Footer>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <Modal.Body className="mt-4 flex flex-col gap-4">
                <LightballTabs
                  ariaLabel={t`Type`}
                  className="self-start"
                  active={kind}
                  onChange={setKind}
                  tabs={[
                    {
                      id: "bug",
                      label: t`Bug`,
                      icon: <Bug className="size-3.5" />,
                      disabled: locked,
                    },
                    {
                      id: "idea",
                      label: t`Idea`,
                      icon: <Lightbulb className="size-3.5" />,
                      disabled: locked,
                    },
                  ]}
                />
                <TextField
                  isRequired
                  value={title}
                  onChange={setTitle}
                  isDisabled={locked}
                  minLength={5}
                  maxLength={160}
                >
                  <Label>
                    <Trans>Title</Trans>
                  </Label>
                  <Input />
                </TextField>
                <TextField
                  isRequired
                  value={details}
                  onChange={setDetails}
                  isDisabled={locked}
                  minLength={20}
                  maxLength={5000}
                >
                  <Label>
                    {kind === "bug" ? (
                      <Trans>What happened?</Trans>
                    ) : (
                      <Trans>What would you like to see?</Trans>
                    )}
                  </Label>
                  <TextArea
                    rows={4}
                    className="min-h-24 resize-y"
                    onPaste={(event) => {
                      const pasted = Array.from(event.clipboardData.files);
                      if (pasted.length) {
                        event.preventDefault();
                        add(pasted);
                      }
                    }}
                  />
                </TextField>
                <FeedbackAttachments
                  files={files}
                  locked={locked}
                  onAdd={add}
                  onRemove={(index) => setFiles(files.filter((_, i) => i !== index))}
                />
                <p className="flex items-start gap-2 text-xs text-muted">
                  <Globe className="mt-px size-3.5 shrink-0" aria-hidden />
                  <Trans>
                    Valid feedback is posted publicly on GitHub with your app version and platform.
                  </Trans>
                </p>
                <p
                  role="status"
                  className={`flex items-start gap-2 text-xs empty:hidden ${enabled ? "text-muted" : "text-warning"}`}
                >
                  {message && !busy ? (
                    <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                  ) : null}
                  {message}
                </p>
              </Modal.Body>
              <Modal.Footer className="flex-wrap">
                <Button
                  variant="ghost"
                  className="mr-auto text-muted max-[400px]:basis-full max-[400px]:justify-start"
                  onPress={() =>
                    void bridge.openExternal("https://github.com/Porabuild/Poracode/issues")
                  }
                >
                  <Search className="size-3.5" />
                  <Trans>Existing issues</Trans>
                </Button>
                <Button slot="close" variant="ghost" isDisabled={busy} className="text-muted">
                  <Trans>Cancel</Trans>
                </Button>
                <Button
                  type="submit"
                  variant="tertiary"
                  isPending={busy}
                  isDisabled={
                    busy || !enabled || title.trim().length < 5 || details.trim().length < 20
                  }
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? <PixelLoader size="xs" /> : <Send className="size-3.5" />}
                      <Trans>Send</Trans>
                    </>
                  )}
                </Button>
              </Modal.Footer>
            </form>
          )}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
