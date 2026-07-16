import type { ReactNode } from "react";
import { Modal } from "@heroui/react";
import { Plural, Trans } from "@lingui/react/macro";
import { Check, Crown, Loader2 } from "lucide-react";
import { Button } from "@/renderer/components/common/Button";
import { useShimmer } from "@/renderer/thinkingAnimator";

/**
 * Minimal inline-markdown renderer for the judge's rationale: `code` spans and
 * **bold**, paragraph breaks on blank lines. The chat markdown pipeline is
 * deliberately not used here — its file-path chip detection misreads diff
 * shorthand like "+6/-6" as path:line references.
 */
function renderRationaleMarkdown(text: string): ReactNode {
  return text.split(/\n{2,}/).map((paragraph, pIndex) => (
    <p key={pIndex} className={pIndex > 0 ? "mt-2" : undefined}>
      {paragraph.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((segment, sIndex) => {
        if (segment.startsWith("`") && segment.endsWith("`") && segment.length > 2) {
          return (
            <code
              key={sIndex}
              className="rounded bg-foreground/10 px-1 py-px font-mono text-[0.85em]"
            >
              {segment.slice(1, -1)}
            </code>
          );
        }
        if (segment.startsWith("**") && segment.endsWith("**") && segment.length > 4) {
          return (
            <strong key={sIndex} className="font-semibold">
              {segment.slice(2, -2)}
            </strong>
          );
        }
        return <span key={sIndex}>{segment}</span>;
      })}
    </p>
  ));
}

export interface JudgeWinnerAssessment {
  threadId: string;
  label: string;
  details: string;
  solutionLabel: string;
  rationale: string;
}

function WinnerRationale(props: {
  rationale: string;
  assessments: readonly JudgeWinnerAssessment[];
}) {
  return (
    <div className="w-full rounded-lg bg-surface-secondary/60 px-4 py-3 text-left text-[13px] leading-relaxed text-foreground/85">
      <div>{renderRationaleMarkdown(props.rationale)}</div>
      <div className="mt-3 space-y-3 border-t border-[var(--hairline)] pt-3">
        {props.assessments.map((assessment) => (
          <div key={assessment.threadId}>
            <div className="font-medium text-foreground">
              {assessment.label}
              {assessment.details ? (
                <span className="text-muted"> · {assessment.details}</span>
              ) : null}{" "}
              <span className="text-muted">({assessment.solutionLabel})</span>
            </div>
            <div className="mt-1 text-muted">{renderRationaleMarkdown(assessment.rationale)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export type JudgeTranscriptEntryInput =
  | { kind: "capturing" }
  | {
      kind: "captured";
      label: string;
      details: string;
      files: number;
      insertions: number;
      deletions: number;
    }
  | { kind: "judging"; judgeLabel: string };

export type JudgeTranscriptEntry = JudgeTranscriptEntryInput & { id: number };

export type JudgeRunState =
  | { stage: "running"; transcript: JudgeTranscriptEntry[] }
  | {
      stage: "won";
      winner: {
        label: string;
        details: string;
        solutionLabel: string;
        rationale: string;
        assessments: JudgeWinnerAssessment[];
      };
    };

function TranscriptLine(props: { entry: JudgeTranscriptEntry; isCurrent: boolean }) {
  const { entry, isCurrent } = props;
  const shimmerActive = isCurrent && entry.kind !== "captured";
  const shimmerRef = useShimmer<HTMLSpanElement>(shimmerActive);
  return (
    <div className="flex items-start gap-2 text-sm">
      {isCurrent ? (
        <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-accent" />
      ) : (
        <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
      )}
      <span
        ref={shimmerRef}
        className={
          shimmerActive ? "poracode-thinking-text" : isCurrent ? "text-foreground" : "text-muted"
        }
      >
        {entry.kind === "capturing" ? (
          <Trans>Reading each candidate's changes…</Trans>
        ) : entry.kind === "judging" ? (
          <Trans>{entry.judgeLabel} is comparing the anonymized diffs…</Trans>
        ) : (
          <>
            {entry.label}
            {entry.details ? <span className="text-muted/80"> · {entry.details}</span> : null} —{" "}
            <span className="font-mono text-success">+{entry.insertions}</span>{" "}
            <span className="font-mono text-danger">−{entry.deletions}</span>{" "}
            <span className="text-muted">
              (<Plural value={entry.files} one="# file" other="# files" />)
            </span>
          </>
        )}
      </span>
    </div>
  );
}

export function ExperimentJudgeRunDialog(props: {
  run: JudgeRunState;
  onCancel: () => void;
  onClose: () => void;
}) {
  const { run } = props;
  const running = run.stage === "running";

  return (
    <Modal.Backdrop
      isOpen
      isDismissable={!running}
      isKeyboardDismissDisabled={running}
      // While the judge is working the modal is intentionally sticky: dismiss
      // requests (backdrop/Escape) are ignored so an accidental click cannot
      // abort a long-running comparison — only the explicit Cancel button can.
      onOpenChange={(open) => {
        if (!open && !running) props.onClose();
      }}
    >
      <Modal.Container size="sm">
        <Modal.Dialog className="overflow-hidden sm:max-w-[600px]">
          {running ? (
            <>
              <Modal.Header>
                <Modal.Icon className="bg-default text-foreground">
                  <Crown className="size-5" />
                </Modal.Icon>
                <Modal.Heading>
                  <Trans>AI judge</Trans>
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-2">
                {run.transcript.map((entry, index) => (
                  <TranscriptLine
                    key={entry.id}
                    entry={entry}
                    isCurrent={index === run.transcript.length - 1}
                  />
                ))}
              </Modal.Body>
              <Modal.Footer>
                <Button variant="ghost" className="text-muted" onPress={props.onCancel}>
                  <Trans>Cancel</Trans>
                </Button>
              </Modal.Footer>
            </>
          ) : (
            <>
              <Modal.Body className="flex flex-col items-center gap-4 overflow-y-auto pt-6">
                <div className="flex h-28 w-full items-center justify-center">
                  <Crown className="size-12 text-warning" strokeWidth={1.75} />
                </div>
                <div className="flex flex-col items-center gap-1 text-center">
                  <span className="text-xl font-semibold text-foreground">
                    <Trans>We have a winner!</Trans>
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {run.winner.label}
                    {run.winner.details ? (
                      <span className="text-muted"> · {run.winner.details}</span>
                    ) : null}
                    <span className="text-muted"> ({run.winner.solutionLabel})</span>
                  </span>
                </div>
                {run.winner.rationale ? (
                  <WinnerRationale
                    rationale={run.winner.rationale}
                    assessments={run.winner.assessments}
                  />
                ) : null}
              </Modal.Body>
              <Modal.Footer className="justify-center">
                <Button variant="primary" onPress={props.onClose}>
                  <Trans>Close</Trans>
                </Button>
              </Modal.Footer>
            </>
          )}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
