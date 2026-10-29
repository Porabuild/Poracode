import { useId, useState } from "react";
import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { FileText, HelpCircle, ListChecks, Loader2, ShieldAlert } from "lucide-react";
import {
  asPermissionRequestDetails,
  type RequestOutcome,
  type ThreadServerRequestId,
} from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { applyOptimisticRequestResolution } from "@/renderer/state/runtimeRequestActions";
import type { OpenRuntimeRequest } from "@/renderer/state/slices/runtimeEventSlice";
import { buildUserInputFormDismissResponse } from "@/shared/runtimeRequestForms";
import { ItemMarkdown } from "../ChatPane/parts/items/ItemMarkdown";
import { ThreadDockSection } from "../ThreadDockUI";
import {
  asOpenCodePermissionDetails,
  formatInputSubject,
  formatRawDetails,
  getDefaultApprovalOptions,
  isPlanApprovalAccepted,
  isPlanApprovalRequest,
  outcomeForSelection,
  readInputString,
  summaryRepeatsSubject,
} from "./helpers";
import { asStructuredElicitationDetails, StructuredElicitationForm } from "./structuredElicitation";
import { asUserInputFormDetails, UserInputForm, useUserInputFormController } from "./userInputForm";
import { ApprovalActions } from "./parts/ApprovalActions";
import {
  OpenCodePermissionDetailsLine,
  PermissionDetailsLine,
  PlanFileLine,
} from "./parts/PermissionDetailsLine";
import { QuestionRows } from "./parts/QuestionRows";

/** Titles longer than this are the command itself, not a label. */
const APPROVAL_SUMMARY_PIN_LIMIT = 160;

interface ThreadRuntimeRequestPanelProps {
  threadId: string;
  request: OpenRuntimeRequest;
  agentLabel?: string | undefined;
  onResolve: (input: {
    requestId: ThreadServerRequestId;
    method: string;
    response: unknown;
    analytics: {
      outcome: RequestOutcome;
      requestType: string;
    };
  }) => Promise<void>;
  onPlanApproved?: (optionId: string) => void;
  onOpenPlanFile?: ((path: string) => void) | undefined;
}

/**
 * Inline panel rendered inside the composer (above the input area) when the
 * supervisor emits a `request.opened` event for a GUI/structured thread.
 *
 * Renders two flavors based on `request.requestType`:
 *  - `tool_user_input` → vertical list of menu rows; click submits.
 *  - approval requests (incl. `tool_call_approval`) → primary action with
 *    chevron-dropdown for alternates, and negative options as ghost buttons.
 *
 * Resolves through `resolveThreadServerRequest` with `method: "requestPermission"`,
 * matching the existing renderer<->supervisor contract.
 */
export function ThreadRuntimeRequestPanel(props: ThreadRuntimeRequestPanelProps) {
  const { threadId, request, agentLabel, onResolve, onPlanApproved, onOpenPlanFile } = props;
  const { t } = useLingui();
  const [pendingOutcome, setPendingOutcome] = useState<RequestOutcome | null>(null);
  const resolving = pendingOutcome !== null;
  const formId = useId();

  function submitRaw(response: unknown, outcome: RequestOutcome) {
    if (resolving) return;
    setPendingOutcome(outcome);
    const rollback = applyOptimisticRequestResolution(threadId, request, outcome);
    void onResolve({
      requestId: request.requestId,
      method: "requestPermission",
      response,
      analytics: {
        outcome,
        requestType: request.requestType,
      },
    }).catch((err) => {
      console.error("[chat] request resolution failed", err);
      rollback();
      toast.danger(friendlyError(err));
      setPendingOutcome(null);
    });
  }

  function decide(optionIds: readonly string[]) {
    if (resolving) return;
    const primaryOptionId = optionIds[0];
    if (!primaryOptionId) return;
    const isPlanApproval = isPlanApprovalRequest(request);
    const outcome = outcomeForSelection(request.requestType, primaryOptionId, isPlanApproval);
    if (outcome === "accepted" && isPlanApproval && isPlanApprovalAccepted(primaryOptionId)) {
      onPlanApproved?.(primaryOptionId);
    }
    submitRaw(
      optionIds.length === 1
        ? { optionId: primaryOptionId }
        : { optionId: primaryOptionId, optionIds },
      outcome,
    );
  }

  const isPlanApproval = isPlanApprovalRequest(request);
  const structuredElicitation = asStructuredElicitationDetails(request.payload.details);
  const userInputForm = !structuredElicitation
    ? asUserInputFormDetails(request.payload.details)
    : undefined;
  const options = request.payload.options ?? getDefaultApprovalOptions();
  const isQuestion = request.requestType === "tool_user_input" && !isPlanApproval;
  const isCustomForm = !!(structuredElicitation || userInputForm);
  const Icon = isPlanApproval ? ListChecks : isQuestion ? HelpCircle : ShieldAlert;
  const userInputFormController = useUserInputFormController(userInputForm);
  const permissionDetails = !isCustomForm
    ? asPermissionRequestDetails(request.payload.details)
    : undefined;
  const planFilePath =
    isPlanApproval && permissionDetails
      ? readInputString(permissionDetails.input, "planFilePath", "plan_filename")
      : undefined;
  const planText =
    isPlanApproval && permissionDetails
      ? readInputString(permissionDetails.input, "plan")
      : undefined;
  const opencodePermission =
    !permissionDetails && !isCustomForm
      ? asOpenCodePermissionDetails(request.payload.details)
      : undefined;
  const detailText =
    !permissionDetails && !opencodePermission && !isCustomForm && !isQuestion
      ? formatRawDetails(request.payload.details)
      : undefined;
  const agentLead = agentLabel ?? t`The agent`;
  const contextLine = isQuestion ? t`${agentLead} needs your input to continue.` : undefined;
  const summary = request.payload.summary;
  // Providers often put the whole shell command in `summary` (for example
  // "Bash: <script>"). That title sits outside the details scroller, so a long
  // command grew the composer until Allow and Deny left the window. A short
  // title stays pinned; a command-sized one scrolls with the details.
  const approvalSummaryScrolls =
    !isCustomForm &&
    !isQuestion &&
    !!summary &&
    (summary.length > APPROVAL_SUMMARY_PIN_LIMIT || summary.includes("\n"));
  // The details line repeats `input.command`. When the scrolling title is that
  // command, keep the title and drop the second copy so the warning still fits
  // in the capped region.
  const commandSubject = permissionDetails
    ? formatInputSubject(permissionDetails.input)
    : undefined;
  const hideDuplicateCommand =
    approvalSummaryScrolls &&
    !!summary &&
    !!commandSubject &&
    summaryRepeatsSubject(summary, commandSubject);
  const planFileAction =
    planFilePath && onOpenPlanFile ? (
      <Button
        size="sm"
        variant="ghost"
        className="@max-[44rem]:w-full"
        onPress={() => onOpenPlanFile(planFilePath)}
      >
        <FileText className="size-3.5" />
        <Trans>Open plan</Trans>
      </Button>
    ) : null;
  const approvalActions =
    !isCustomForm && !isQuestion ? (
      <ApprovalActions
        options={options}
        requestType={request.requestType}
        isDisabled={resolving}
        leadingAction={planFileAction}
        showAllOptions
        stackOnNarrow={isPlanApproval}
        onSelect={(optionId) => decide([optionId])}
      />
    ) : null;
  const requestDetails =
    permissionDetails && !isPlanApproval ? (
      <PermissionDetailsLine
        details={permissionDetails}
        {...(hideDuplicateCommand ? { hideSubject: true } : {})}
      />
    ) : opencodePermission ? (
      <OpenCodePermissionDetailsLine details={opencodePermission} />
    ) : detailText ? (
      <pre className="rounded-sm bg-foreground/5 p-1 font-mono text-[11px] whitespace-pre-wrap [overflow-wrap:anywhere]">
        {detailText}
      </pre>
    ) : null;

  return (
    <ThreadDockSection className="!text-xs" placement="composer" collapsed={false}>
      {/* Question forms title themselves with the active question. */}
      {isCustomForm ? null : (
        <div className="@container flex flex-wrap items-start gap-x-2 gap-y-1 px-2 py-1.5 leading-snug">
          <Icon
            className={`mt-0.5 size-3.5 shrink-0 ${isQuestion || isPlanApproval ? "text-foreground-muted" : "text-warning"}`}
          />
          <div className="min-w-0 flex-1 basis-96">
            {summary && !approvalSummaryScrolls ? (
              <div className="font-semibold text-foreground [overflow-wrap:anywhere]">
                {summary}
              </div>
            ) : null}
            {contextLine ? (
              <div className="text-[11px] text-[color:var(--muted)]">{contextLine}</div>
            ) : null}
            {requestDetails || planFilePath || planText || approvalSummaryScrolls ? (
              <div
                role="region"
                aria-label={t`Request details`}
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard focus enables native scrolling
                tabIndex={0}
                className="mt-0.5 max-h-[min(12rem,35vh)] overflow-y-auto pr-1 [scrollbar-gutter:stable] [overflow-wrap:anywhere] outline-none focus-visible:ring-2 focus-visible:ring-focus/50"
              >
                {approvalSummaryScrolls ? (
                  <div className="font-semibold whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
                    {summary}
                  </div>
                ) : null}
                {planText ? <ItemMarkdown text={planText} /> : null}
                {requestDetails}
                {planFilePath ? <PlanFileLine path={planFilePath} /> : null}
              </div>
            ) : null}
          </div>
          {approvalActions ? (
            <div
              className={
                isPlanApproval
                  ? "ml-auto max-w-full shrink-0 self-end @max-[44rem]:ml-0 @max-[44rem]:basis-full @max-[44rem]:self-stretch"
                  : "ml-auto shrink-0 self-end"
              }
            >
              {approvalActions}
            </div>
          ) : null}
          {resolving ? (
            <span
              className="flex shrink-0 items-center gap-1 self-center text-[11px] text-muted"
              role="status"
            >
              <Loader2 className="size-3 animate-spin" />
              <Trans>Resolving…</Trans>
            </span>
          ) : null}
        </div>
      )}

      {structuredElicitation ? (
        <StructuredElicitationForm
          params={structuredElicitation}
          isDisabled={resolving}
          isPending={pendingOutcome === "answered"}
          onSubmit={(response, outcome) => submitRaw(response, outcome)}
        />
      ) : userInputFormController ? (
        <UserInputForm
          formId={formId}
          controller={userInputFormController}
          isDisabled={resolving}
          isPending={pendingOutcome === "answered"}
          onDecline={() => submitRaw(buildUserInputFormDismissResponse(), "cancelled")}
          onSubmit={(response, outcome) => submitRaw(response, outcome)}
        />
      ) : isQuestion ? (
        <QuestionRows
          options={options}
          isDisabled={resolving}
          onSubmit={decide}
          multiSelect={request.payload.multiSelect === true}
        />
      ) : null}
    </ThreadDockSection>
  );
}
