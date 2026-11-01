import { useEffect, useRef, useState } from "react";
import { Checkbox, Input, Label, Modal, TextField } from "@heroui/react";
import { Bug, Globe, Lightbulb, Search } from "lucide-react";
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
  const { kind, title, details, files, diagnostics, delivery } = useFeedbackDraftStore(
    (state) => state.draft,
  );
  const setKind = (value: "bug" | "idea") => updateFeedbackDraft({ kind: value });
  const setTitle = (value: string) => updateFeedbackDraft({ title: value });
  const setDetails = (value: string) => updateFeedbackDraft({ details: value });
  const setFiles = (value: File[]) => updateFeedbackDraft({ files: value });
  const setDiagnostics = (value: boolean) => updateFeedbackDraft({ diagnostics: value });
  const [preview, setPreview] = useState(false);
  const [token, setToken] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const hasDelivery = Boolean(delivery);
  const [verificationKey, setVerificationKey] = useState(0);
  const [verificationHeight, setVerificationHeight] = useState(70);
  const verification = useRef<HTMLIFrameElement>(null);
  const environment = `Poracode ${bridge.appVersion}; ${bridge.platform}`;
  const verificationSupported =
    location.protocol === "file:" ||
    location.origin === SERVICE ||
    (location.protocol === "http:" && ["localhost", "127.0.0.1"].includes(location.hostname));
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
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== SERVICE || event.source !== verification.current?.contentWindow) return;
      if (event.data?.type === "poracode.feedback.verification.ready") {
        if (event.data.height === 65 || event.data.height === 140)
          setVerificationHeight(event.data.height);
        verification.current?.contentWindow?.postMessage(
          { type: "poracode.feedback.verify" },
          SERVICE,
        );
      }
      if (
        event.data?.type === "poracode.feedback.verification" &&
        typeof event.data.token === "string" &&
        event.data.token.length <= 2048
      )
        setToken(event.data.token);
      if (event.data?.type === "poracode.feedback.verification" && event.data.error === true)
        setMessage(t`Verification could not load. Please try again.`);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
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
        draft: { kind, title, details, diagnostics: diagnostics ? environment : "" },
        files,
        token,
        delivery,
        onDelivery: (value) => {
          updateFeedbackDraft({ delivery: value });
          setToken("");
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
      setToken("");
      setVerificationKey((value) => value + 1);
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
        <Modal.Dialog className="overflow-x-hidden p-0 sm:max-w-[500px] dark:bg-[#24242b]">
          <Modal.CloseTrigger isDisabled={busy} />
          <Modal.Header className="px-5 pt-5 pb-1">
            <Modal.Heading className="text-base font-semibold">
              <Trans>Send feedback</Trans>
            </Modal.Heading>
          </Modal.Header>
          {url ? (
            <Modal.Body className="space-y-3 p-5">
              <h2 className="text-sm font-semibold">
                <Trans>Feedback sent</Trans>
              </h2>
              <p className="text-xs text-muted">
                <Trans>Your report and attachments are now on GitHub.</Trans>
              </p>
              <Button variant="tertiary" onPress={() => void bridge.openExternal(url)}>
                <Trans>View GitHub issue</Trans>
              </Button>
            </Modal.Body>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <Modal.Body className="flex flex-col gap-3 px-5 pt-0 pb-2">
                <p className="text-[13px] text-muted">
                  <Trans>Report a bug or suggest an idea.</Trans>
                </p>
                <div className="flex gap-1.5">
                  {(["bug", "idea"] as const).map((value) => (
                    <Button
                      key={value}
                      size="sm"
                      variant="ghost"
                      isDisabled={locked}
                      aria-pressed={kind === value}
                      onPress={() => setKind(value)}
                      className={`h-8 gap-2 rounded-[8px] border px-3 text-xs font-normal ${kind === value ? "border-border bg-surface-tertiary text-foreground dark:border-[#626272] dark:bg-[#3a3a46]" : "border-border text-muted"}`}
                    >
                      {value === "bug" ? (
                        <Bug className="size-4" />
                      ) : (
                        <Lightbulb className="size-4" />
                      )}
                      {value === "bug" ? <Trans>Bug</Trans> : <Trans>Idea</Trans>}
                    </Button>
                  ))}
                </div>
                <TextField
                  isRequired
                  value={title}
                  onChange={setTitle}
                  isDisabled={locked}
                  minLength={5}
                  maxLength={160}
                  className="gap-1.5"
                >
                  <Label className="text-xs">
                    <Trans>Title</Trans>
                  </Label>
                  <Input className="h-9 rounded-[8px] text-[13px] dark:border dark:border-[#464652] dark:bg-[#1a1a21]" />
                </TextField>
                <TextField
                  isRequired
                  value={details}
                  onChange={setDetails}
                  isDisabled={locked}
                  minLength={20}
                  maxLength={5000}
                  className="gap-1.5"
                >
                  <Label className="text-xs">
                    {kind === "bug" ? (
                      <Trans>What happened?</Trans>
                    ) : (
                      <Trans>What would you like to see?</Trans>
                    )}
                  </Label>
                  <TextArea
                    rows={4}
                    className="min-h-24 resize-y rounded-[8px] text-[13px] leading-5 dark:border dark:border-[#464652] dark:bg-[#1a1a21]"
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
                <div className="mt-1 space-y-1.5 border-t border-border pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <Checkbox
                      isSelected={diagnostics}
                      onChange={setDiagnostics}
                      isDisabled={locked}
                    >
                      <Checkbox.Content className="gap-1.5 text-xs">
                        <Checkbox.Control className="size-3.5 rounded-sm">
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        <span className="text-xs font-normal">
                          <Trans>Include basic diagnostics</Trans>
                        </span>
                      </Checkbox.Content>
                    </Checkbox>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-auto min-w-0 p-0 text-[11px] font-normal text-muted underline"
                      onPress={() => setPreview(!preview)}
                    >
                      <Trans>Preview</Trans>
                    </Button>
                  </div>
                  <p className="text-[11px] leading-4 text-muted">
                    <Trans>
                      Version and platform only. No chat history, code, or project paths.
                    </Trans>
                  </p>
                  {preview && <p className="break-all text-[11px] text-muted">{environment}</p>}
                </div>
                <p className="flex items-start gap-2 text-[11px] leading-4 text-muted">
                  <Globe className="mt-px size-3.5 shrink-0" />
                  <span>
                    <strong className="font-medium text-foreground">
                      <Trans>Public on GitHub.</Trans>
                    </strong>{" "}
                    <Trans>Your report and attachments will be visible to everyone.</Trans>
                  </span>
                </p>
                {enabled && verificationSupported && !hasDelivery && (
                  <iframe
                    key={verificationKey}
                    ref={verification}
                    title={t`Verification`}
                    src={`${SERVICE}/feedback/verify`}
                    referrerPolicy="no-referrer"
                    className="min-w-0 w-full border-0"
                    style={{ height: verificationHeight }}
                    // The cross-origin frame contains only Turnstile; native fields never enter it.
                    // eslint-disable-next-line react/iframe-missing-sandbox
                    sandbox="allow-scripts allow-same-origin"
                    onLoad={() =>
                      verification.current?.contentWindow?.postMessage(
                        { type: "poracode.feedback.verify" },
                        SERVICE,
                      )
                    }
                  />
                )}
                {enabled && !verificationSupported && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => void bridge.openExternal(`${SERVICE}/feedback`)}
                  >
                    <Trans>Open feedback on website</Trans>
                  </Button>
                )}
                <p role="status" className="text-xs text-muted empty:hidden">
                  {message}
                </p>
              </Modal.Body>
              <Modal.Footer className="flex-wrap gap-2 px-5 pb-5 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="mr-auto h-8 gap-1.5 px-0 text-[11px] font-normal text-muted max-[400px]:basis-full max-[400px]:justify-start"
                  onPress={() =>
                    void bridge.openExternal("https://github.com/Porabuild/Poracode/issues")
                  }
                >
                  <Search className="size-3" />
                  <Trans>Existing issues</Trans>
                </Button>
                <Button
                  slot="close"
                  variant="ghost"
                  size="sm"
                  isDisabled={busy}
                  className="text-xs font-normal text-muted"
                >
                  <Trans>Cancel</Trans>
                </Button>
                <Button
                  type="submit"
                  variant="tertiary"
                  size="sm"
                  isPending={busy}
                  isDisabled={
                    busy ||
                    !enabled ||
                    (!token && !hasDelivery) ||
                    title.trim().length < 5 ||
                    details.trim().length < 20
                  }
                  className="text-xs"
                >
                  <Trans>Send</Trans>
                </Button>
              </Modal.Footer>
            </form>
          )}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
