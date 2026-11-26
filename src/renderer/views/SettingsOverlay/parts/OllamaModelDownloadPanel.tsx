import { useEffect, useRef, useState } from "react";
import { Button, ComboBox, Description, Label, ListBox } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { CircleCheck, ExternalLink, TriangleAlert } from "lucide-react";
import { Input } from "@/renderer/components/common";
import { ContentSurface } from "@/renderer/components/common/ContentSurface";
import type { AgentSettingsHost } from "@/renderer/components/providers/settings/AgentSettingsHostContext";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import {
  appendOllamaPullOutput,
  isValidOllamaLibraryTag,
  normalizeOllamaLibraryTag,
  OLLAMA_TAG_MAX_LENGTH,
  ollamaPullPercent,
  startOllamaModelPull,
  type OllamaModelPullHandle,
} from "./ollamaModelPull";
import { filterOllamaModelSuggestions, type OllamaModelSuggestion } from "./ollamaModelSuggestions";

type PullPhase = "running" | "cancelling" | "success" | "failed" | "cancelled";

export type OllamaDownloadRun = {
  id: number;
  phase: PullPhase;
  tag: string;
  error?: string;
  inventoryRefreshFailed?: boolean;
};

export function useOllamaModelDownload(settingsHost: AgentSettingsHost) {
  const { t } = useLingui();
  const [tagInput, setTagInput] = useState("");
  const [output, setOutput] = useState("");
  const [run, setRun] = useState<OllamaDownloadRun | undefined>();
  const runIdRef = useRef(0);
  const handleRef = useRef<OllamaModelPullHandle | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runIdRef.current += 1;
      void handleRef.current?.cancel().catch(() => undefined);
      handleRef.current = null;
    };
  }, []);

  const tag = normalizeOllamaLibraryTag(tagInput);
  const tagInvalid = tag.length > 0 && !isValidOllamaLibraryTag(tag);
  const canOperateTerminal = settingsHost.canOperateTerminal ?? !settingsHost.isRemote;
  const canReadTerminal = settingsHost.canReadTerminal ?? !settingsHost.isRemote;
  const unavailableReason = !settingsHost.isOnline
    ? t`The selected host is offline.`
    : !settingsHost.canWrite
      ? t`This connection is read-only.`
      : !canOperateTerminal || !canReadTerminal
        ? t`This connection does not allow terminal access on the selected host.`
        : !settingsHost.machineProject
          ? t`No host location is available for this machine.`
          : undefined;
  const running = run?.phase === "running";
  const cancelling = run?.phase === "cancelling";
  const canDownload =
    unavailableReason === undefined &&
    isValidOllamaLibraryTag(tag) &&
    (!run || run.phase === "failed" || run.phase === "cancelled");
  const percent = run ? (run.phase === "success" ? 100 : ollamaPullPercent(output)) : undefined;

  const startDownload = () => {
    const project = settingsHost.machineProject;
    if (!canDownload || !project) return;
    const id = ++runIdRef.current;
    const host = settingsHost;
    handleRef.current = null;
    setOutput("");
    setRun({ id, phase: "running", tag });
    try {
      handleRef.current = startOllamaModelPull({
        project,
        tag,
        ...(host.connectionKey ? { remoteServerId: host.connectionKey } : {}),
        onOutput: (chunk) => {
          if (!mountedRef.current || runIdRef.current !== id) return;
          setOutput((current) => appendOllamaPullOutput(current, chunk));
        },
        onOutputReset: () => {
          if (!mountedRef.current || runIdRef.current !== id) return;
          setOutput("");
        },
        onComplete: (completion) => {
          if (!mountedRef.current || runIdRef.current !== id) return;
          handleRef.current = null;
          if (completion.status === "success") {
            setRun({ id, phase: "success", tag });
            void host.rediscoverAgents().catch(() => {
              if (!mountedRef.current || runIdRef.current !== id) return;
              setRun((current) =>
                current?.id === id ? { ...current, inventoryRefreshFailed: true } : current,
              );
            });
          } else {
            setRun({
              id,
              phase: "failed",
              tag,
              ...(completion.error ? { error: completion.error } : {}),
            });
          }
        },
      });
    } catch (error) {
      setRun({
        id,
        phase: "failed",
        tag,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const cancelDownload = () => {
    const current = run;
    const handle = handleRef.current;
    if (!current || (current.phase !== "running" && current.phase !== "cancelling") || !handle) {
      return;
    }
    const id = current.id;
    if (current.phase === "running") {
      setRun({ ...current, phase: "cancelling" });
    }
    void handle
      .cancel()
      .then(() => {
        if (!mountedRef.current || runIdRef.current !== id) return;
        handleRef.current = null;
        setRun((latest) =>
          latest?.id === id && latest.phase === "cancelling"
            ? { id, phase: "cancelled", tag: current.tag }
            : latest,
        );
      })
      .catch(() => {
        if (!mountedRef.current || runIdRef.current !== id) return;
        setRun((latest) =>
          latest?.id === id && latest.phase === "cancelling"
            ? {
                ...latest,
                error: t`Cancellation could not be confirmed; the model download may still be running.`,
              }
            : latest,
        );
      });
  };

  return {
    tagInput,
    setTagInput,
    output,
    run,
    tagInvalid,
    unavailableReason,
    running,
    cancelling,
    canDownload,
    percent,
    startDownload,
    cancelDownload,
  };
}

export type OllamaModelDownloadController = ReturnType<typeof useOllamaModelDownload>;

export function OllamaModelDownloadPanel(props: {
  download: OllamaModelDownloadController;
  destinationLabel: string;
}) {
  const { t } = useLingui();
  const { download } = props;
  const [open, setOpen] = useState(false);
  const run = download.run;
  const active = download.running || download.cancelling;
  const suggestions = filterOllamaModelSuggestions(download.tagInput);
  const showDownloadButton = !active && run?.phase !== "success";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-muted">
            <Trans>Model</Trans>
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1 text-muted"
            onPress={() => openExternalWithFeedback("https://ollama.com/search?c=local")}
          >
            <Trans>Browse full library</Trans>
            <ExternalLink className="size-3.5" aria-hidden />
          </Button>
        </div>
        <p className="truncate text-[11px] text-muted" title={props.destinationLabel}>
          {props.destinationLabel}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <ComboBox
            aria-label={t`Model`}
            onKeyDown={(event) => {
              // Keep Escape inside an open suggestion list instead of closing the modal.
              if (event.key === "Escape" && open) event.stopPropagation();
            }}
            className="min-w-0 flex-1"
            allowsCustomValue
            menuTrigger="input"
            items={suggestions}
            inputValue={download.tagInput}
            onInputChange={download.setTagInput}
            onChange={(key) => {
              if (key != null) download.setTagInput(String(key));
            }}
            onOpenChange={setOpen}
            isReadOnly={active || run?.phase === "success"}
          >
            <ComboBox.InputGroup>
              <Input
                placeholder={t`Search or enter a model tag`}
                maxLength={OLLAMA_TAG_MAX_LENGTH}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
              <ComboBox.Trigger
                aria-label={t`Show model suggestions`}
                isDisabled={active || run?.phase === "success"}
              />
            </ComboBox.InputGroup>
            <ComboBox.Popover
              placement="bottom start"
              maxHeight={224}
              className="min-w-0 max-w-[calc(100vw-16px)] p-1"
              style={{ width: "var(--trigger-width)" }}
            >
              <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted/80">
                <Trans>Suggested models</Trans>
              </div>
              <ListBox className="poracode-menu max-h-48 overflow-y-auto">
                {(option: OllamaModelSuggestion) => (
                  <ListBox.Item id={option.id} textValue={option.tag} className="min-w-0 pe-7">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <Label className="block max-w-full truncate text-xs">{option.name}</Label>
                        <Description className="block max-w-full truncate font-mono text-[11px]">
                          {option.tag}
                        </Description>
                      </div>
                      <span className="shrink-0 text-[11px] text-muted tabular-nums">
                        {option.sizeLabel}
                      </span>
                    </div>
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                )}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
          {showDownloadButton ? (
            <Button
              size="sm"
              variant="primary"
              className="w-full shrink-0 sm:w-auto"
              isDisabled={!download.canDownload}
              onPress={download.startDownload}
            >
              {run?.phase === "failed" || run?.phase === "cancelled" ? (
                <Trans>Retry download</Trans>
              ) : (
                <Trans>Download</Trans>
              )}
            </Button>
          ) : null}
        </div>
        {download.tagInvalid ? (
          <p role="alert" className="text-[11px] text-danger">
            <Trans>
              Use a lowercase Ollama library tag such as llama3.2:3b. Cloud models are not
              supported.
            </Trans>
          </p>
        ) : null}
      </div>

      {download.unavailableReason ? (
        <p role="alert" className="text-[11px] text-danger">
          {download.unavailableReason}
        </p>
      ) : null}

      {run && active ? (
        <ContentSurface variant="row" className="flex items-center gap-2 px-2.5 py-2">
          <span className="shrink-0 text-xs text-foreground">
            {run.phase === "running" ? (
              <Trans>Downloading</Trans>
            ) : (
              <Trans>Cancelling download…</Trans>
            )}
          </span>
          <div
            role="progressbar"
            aria-label={t`Ollama model download progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            {...(download.percent === undefined ? {} : { "aria-valuenow": download.percent })}
            className="h-1 min-w-8 flex-1 overflow-hidden rounded-full bg-[var(--row-active)]"
          >
            <div
              className={`h-full rounded-full bg-foreground ${download.percent === undefined ? "w-1/2 animate-pulse" : "transition-[width] duration-300"}`}
              {...(download.percent === undefined
                ? {}
                : { style: { width: `${download.percent}%` } })}
            />
          </div>
          {download.percent === undefined ? null : (
            <span className="w-9 shrink-0 text-right text-xs text-muted tabular-nums">
              {download.percent}%
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0"
            aria-label={download.cancelling && run.error ? t`Retry cancel` : t`Cancel download`}
            onPress={download.cancelDownload}
          >
            {download.cancelling && run.error ? <Trans>Retry cancel</Trans> : <Trans>Cancel</Trans>}
          </Button>
        </ContentSurface>
      ) : null}
      {run?.phase === "cancelling" && run.error ? (
        <p role="alert" className="text-[11px] text-danger">
          {run.error}
        </p>
      ) : null}

      {run?.phase === "success" ? (
        <ContentSurface variant="row" className="flex items-start gap-2 px-2.5 py-2">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <div className="min-w-0 flex-1">
            <p role="status" className="truncate text-xs text-success">
              <Trans>Downloaded {run.tag}.</Trans>
            </p>
            {run.inventoryRefreshFailed ? (
              <p role="alert" className="mt-1 text-[11px] text-danger">
                <Trans>The model downloaded, but the host inventory could not be refreshed.</Trans>
              </p>
            ) : null}
          </div>
        </ContentSurface>
      ) : null}

      {run && (run.phase === "failed" || run.phase === "cancelled") ? (
        <ContentSurface variant="row" className="flex items-start gap-2 px-2.5 py-2">
          <TriangleAlert
            className={`mt-0.5 size-4 shrink-0 ${run.phase === "failed" ? "text-danger" : "text-muted"}`}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p
              role={run.phase === "failed" ? "alert" : "status"}
              className={`text-xs ${run.phase === "failed" ? "text-danger" : "text-muted"}`}
            >
              {run.phase === "failed" ? (
                <Trans>Download failed.</Trans>
              ) : (
                <Trans>Download cancelled.</Trans>
              )}
            </p>
            {run.error ? <p className="mt-1 text-[11px] text-danger">{run.error}</p> : null}
            {download.output ? (
              <details className="mt-1.5">
                <summary className="cursor-pointer text-xs text-muted">
                  <Trans>Details</Trans>
                </summary>
                <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border/10 bg-black/10 p-2 font-mono text-[10px] text-muted">
                  {download.output}
                </pre>
              </details>
            ) : null}
          </div>
        </ContentSurface>
      ) : null}
    </div>
  );
}
