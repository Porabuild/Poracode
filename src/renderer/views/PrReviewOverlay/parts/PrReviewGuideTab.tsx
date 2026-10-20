import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ForgeGetPrReviewGuidePayload, ForgePrReviewGuideResult } from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { resolveAiLanguageName } from "@/shared/locale";
import { friendlyError } from "@/shared/messages";
import { sha256Hex } from "@/shared/remote/contract/sha256";
import { readBridge } from "@/renderer/bridge";
import { Select, TextArea } from "@/renderer/components/common";
import { ItemMarkdown } from "@/renderer/components/thread/ChatPane/parts/items/ItemMarkdown";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  getCommitGenCandidates,
  resolveCommitGenConfig,
} from "@/renderer/components/providers/commitGen";
import { resolveUtilitySelection } from "@/renderer/utils/utilitySelection";
import { resolveFastValue } from "@/renderer/components/thread/threadDraftViewHelpers";
import { detectOSLocale } from "@/renderer/i18n/locales";

export function PrReviewGuideTab(props: {
  input: ForgeGetPrReviewGuidePayload;
  disabled: boolean;
  readOnly?: boolean;
  rawDiff: string | undefined;
  onSelectFile: (path: string) => void;
  onAskAgent?: (context: string) => void;
  finishReview: ReactNode;
}) {
  const { input, disabled, readOnly = false, onSelectFile, finishReview } = props;
  const { t } = useLingui();
  const [result, setResult] = useState<ForgePrReviewGuideResult>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [stopIndex, setStopIndex] = useState(0);
  const [writerOverride, setWriterOverride] = useState<string>();
  const [modelOverride, setModelOverride] = useState<string>();
  const [instructions, setInstructions] = useState("");
  const displayedDiffHash = props.rawDiff === undefined ? undefined : sha256Hex(props.rawDiff);
  const active = useRef(true);
  const revision = useRef(0);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const nativeStatuses = useAgentStatusesStore((s) => s.agentStatuses);
  const wslStatuses = useAgentStatusesStore((s) => s.wslAgentStatuses);
  const candidates = getCommitGenCandidates(
    getProjectAgentStatuses(input.projectLocation, nativeStatuses, wslStatuses).filter(
      (candidate) => candidate.capabilities.supportsReadOnlyOneShotWorkspace,
    ),
    "auto",
  );
  const wsl = input.projectLocation.kind === "wsl";
  const provider = useSharedSettings((s) => (wsl ? s.wslCommitGenProvider : s.commitGenProvider));
  const savedModel = useSharedSettings((s) => (wsl ? s.wslCommitGenModel : s.commitGenModel));
  const savedEffort = useSharedSettings((s) => (wsl ? s.wslCommitGenEffort : s.commitGenEffort));
  const savedFast = useSharedSettings((s) => (wsl ? s.wslCommitGenFast : s.commitGenFast));
  const savedSelection = useSharedSettings((s) =>
    wsl ? s.wslCommitGenSelection : s.commitGenSelection,
  );
  const languageSetting = useSharedSettings((s) => s.gitTextLanguage);
  const appLocale = useSharedSettings((s) => s.locale);
  const language = resolveAiLanguageName(languageSetting, appLocale, detectOSLocale());
  const writer =
    candidates.find((candidate) => candidate.kind === (writerOverride ?? provider)) ??
    candidates[0];
  const usesPreset =
    writerOverride === undefined &&
    modelOverride === undefined &&
    (provider === "auto" || provider === writer?.kind);
  const model = modelOverride ?? (usesPreset ? (savedSelection?.model ?? savedModel) : "");

  function refresh() {
    if (disabled) return;
    const ticket = ++revision.current;
    void readBridge()
      .forgeGetPrReviewGuide(input)
      .then((response) => {
        if (active.current && revision.current === ticket) {
          setResult(response);
          setError(undefined);
        }
      })
      .catch((failure: unknown) => {
        if (active.current && revision.current === ticket) setError(friendlyError(failure));
      })
      .finally(() => {
        if (active.current && revision.current === ticket) setLoading(false);
      });
  }
  const refreshCurrent = useEffectEvent(() => {
    refresh();
  });
  useEffect(() => {
    if (!disabled) refreshCurrent();
  }, [disabled]);
  useEffect(() => {
    if (result?.status !== "generating" || disabled || readOnly) return;
    const timer = setInterval(() => refreshCurrent(), 5000);
    return () => clearInterval(timer);
  }, [result?.status, disabled, readOnly]);

  async function write() {
    if (readOnly || disabled || loading || !writer || result?.status === "generating") return;
    const ticket = ++revision.current;
    setLoading(true);
    setError(undefined);
    try {
      const selection = resolveUtilitySelection(
        usesPreset ? savedSelection : undefined,
        { model, effort: usesPreset ? savedEffort : "", fast: usesPreset ? savedFast : false },
        (scalars) => {
          const config = resolveCommitGenConfig(writer, scalars.model, scalars.effort);
          return {
            model: config.model,
            effort: config.effort,
            fast: resolveFastValue(writer, config.model, scalars.fast),
          };
        },
      );
      const response = await readBridge().forgeWritePrReviewGuide({
        ...input,
        agentKind: writer.kind,
        selection,
        ...(language ? { language } : {}),
        ...(instructions.trim() ? { instructions } : {}),
      });
      if (active.current && revision.current === ticket) {
        setResult(response);
        setStopIndex(0);
      }
    } catch (failure) {
      if (active.current && revision.current === ticket) setError(friendlyError(failure));
    } finally {
      if (active.current && revision.current === ticket) setLoading(false);
    }
  }

  const guide = result?.guide;
  const stale = result?.stale || !result?.diffHash || displayedDiffHash !== result.diffHash;
  const index = Math.min(stopIndex, Math.max(0, (guide?.stops.length ?? 1) - 1));
  const stop = guide?.stops[index];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <div className="flex flex-wrap items-end gap-2">
            <Select
              aria-label={t`Guide writer`}
              label={t`Guide writer`}
              value={writer?.kind ?? null}
              options={candidates.map((candidate) => ({
                id: candidate.kind,
                label: candidate.label,
              }))}
              onChange={(value) => {
                setWriterOverride(value);
                setModelOverride(undefined);
              }}
              isDisabled={readOnly || loading || result?.status === "generating"}
              className="min-w-40 flex-1"
            />
            {writer && (
              <Select
                aria-label={t`Guide model`}
                label={t`Guide model`}
                value={model || resolveCommitGenConfig(writer, "", "").model}
                options={writer.capabilities.models.map((candidate) => ({
                  id: candidate.id,
                  label: candidate.label,
                }))}
                onChange={setModelOverride}
                isDisabled={readOnly || loading || result?.status === "generating"}
                className="min-w-40 flex-1"
              />
            )}
            <Button
              size="sm"
              variant="secondary"
              onPress={() => void write()}
              isDisabled={
                readOnly || disabled || loading || !writer || result?.status === "generating"
              }
              isPending={loading || result?.status === "generating"}
            >
              {guide ? <Trans>Rewrite guide</Trans> : <Trans>Write guide</Trans>}
            </Button>
          </div>
          <TextArea
            aria-label={t`Review guide instructions`}
            placeholder={t`Review guide instructions`}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            disabled={readOnly || loading || result?.status === "generating"}
            autoSize
            maxRows={4}
          />
          {!writer && (
            <p className="text-sm text-muted">
              <Trans>Select a guide writer that supports an enforced read-only workspace.</Trans>
            </p>
          )}
          {error && (
            <div role="alert" className="text-sm text-danger">
              {error}{" "}
              <Button
                size="sm"
                variant="ghost"
                isDisabled={loading || disabled}
                onPress={() => refresh()}
              >
                <Trans>Retry</Trans>
              </Button>
            </div>
          )}
          {result?.status === "generating" && (
            <p role="status" className="text-sm text-muted">
              <Trans>Writing guide. You can leave this review and return when it is ready.</Trans>
            </p>
          )}
          {result?.status === "failed" && (
            <p role="alert" className="text-sm text-danger">
              <Trans>Could not write the guide. Try rewriting it.</Trans>
            </p>
          )}
          {guide && stale && (
            <p role="status" className="text-sm text-warning">
              <Trans>
                This guide is out of date. Rewrite it to see excerpts for the current change.
              </Trans>
            </p>
          )}
          {guide && <ItemMarkdown text={guide.summary} />}
          {stop && (
            <article className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="break-words text-base font-semibold">{stop.title}</h2>
                {stop.lookClosely && (
                  <span className="rounded bg-warning/10 px-2 py-1 text-xs text-warning">
                    <Trans>Look closely</Trans>
                  </span>
                )}
              </div>
              <ItemMarkdown text={stop.body} />
              {!stale && props.onAskAgent && (
                <div className="flex flex-col items-start gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    isDisabled={disabled || readOnly}
                    onPress={() =>
                      props.onAskAgent?.(
                        JSON.stringify(
                          {
                            title: stop.title,
                            body: stop.body,
                            files: stop.files,
                          },
                          null,
                          2,
                        ),
                      )
                    }
                  >
                    <Trans>Ask agent</Trans>
                  </Button>
                  {stop.questions.map((question, ordinal) => (
                    <Button
                      key={ordinal}
                      size="sm"
                      variant="ghost"
                      className="h-auto max-w-full whitespace-normal text-left"
                      isDisabled={disabled || readOnly}
                      onPress={() =>
                        props.onAskAgent?.(
                          JSON.stringify(
                            {
                              question,
                              title: stop.title,
                              body: stop.body,
                              files: stop.files,
                            },
                            null,
                            2,
                          ),
                        )
                      }
                    >
                      {question}
                    </Button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {stop.files.map((path) => (
                  <Button
                    key={path}
                    size="sm"
                    variant="ghost"
                    className="h-auto max-w-full whitespace-normal break-all text-left"
                    onPress={() => onSelectFile(path)}
                  >
                    {path}
                  </Button>
                ))}
              </div>
              {!stale &&
                stop.excerpts.map((excerpt, ordinal) => (
                  <figure key={ordinal} className="overflow-hidden rounded-lg border border-border">
                    <figcaption className="break-all bg-surface-tertiary px-3 py-2 text-xs font-mono">
                      {excerpt.path}:{excerpt.startLine}–{excerpt.endLine}
                    </figcaption>
                    <pre className="overflow-x-auto p-3 text-xs">
                      <code>{excerpt.text}</code>
                    </pre>
                    {props.onAskAgent && (
                      <div className="px-3 pb-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          isDisabled={disabled || readOnly}
                          onPress={() =>
                            props.onAskAgent?.(
                              JSON.stringify(
                                {
                                  title: stop.title,
                                  body: stop.body,
                                  excerpt,
                                },
                                null,
                                2,
                              ),
                            )
                          }
                        >
                          <Trans>Ask agent</Trans>
                        </Button>
                      </div>
                    )}
                  </figure>
                ))}
            </article>
          )}
        </div>
      </div>
      {stop && (
        <nav
          aria-label={t`Guide stops`}
          className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-3"
        >
          <Button
            size="sm"
            variant="ghost"
            isDisabled={index === 0}
            onPress={() => setStopIndex(index - 1)}
          >
            <Trans>Back</Trans>
          </Button>
          <span className="text-xs text-muted">{t`${index + 1} of ${guide!.stops.length}`}</span>
          {index < guide!.stops.length - 1 ? (
            <Button size="sm" variant="primary" onPress={() => setStopIndex(index + 1)}>
              <Trans>Next</Trans>
            </Button>
          ) : (
            finishReview
          )}
        </nav>
      )}
    </div>
  );
}
