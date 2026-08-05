import { useId, useState } from "react";
import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { FileText, HelpCircle, ListChecks, Plug, ShieldAlert } from "lucide-react";
import {
  asPermissionRequestDetails,
  type RequestOutcome,
  type ThreadServerRequestId,
} from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { applyOptimisticRequestResolution } from "@/renderer/state/runtimeRequestActions";
import type { OpenRuntimeRequest } from "@/renderer/state/slices/runtimeEventSlice";
import { ItemMarkdown } from "../ChatPane/parts/items/ItemMarkdown";
import { ThreadDockSection } from "../ThreadDockUI";
import {
  asOpenCodePermissionDetails,
  formatRawDetails,
  getDefaultApprovalOptions,
  isPlanApprovalRequest,
  outcomeForSelection,
  readInputString,
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
import { QuestionSwitcher } from "./parts/QuestionSwitcher";

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
  const [resolving, setResolving] = useState(false);
  const formId = useId();

  function submitRaw(response: unknown, outcome: RequestOutcome) {
    if (resolving) return;
    setResolving(true);
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
      setResolving(false);
    });
  }

  function decide(optionIds: readonly string[]) {
    if (resolving) return;
    const primaryOptionId = optionIds[0];
    if (!primaryOptionId) return;
    const isPlanApproval = isPlanApprovalRequest(request);
    const outcome = outcomeForSelection(request.requestType, primaryOptionId, isPlanApproval);
    if (outcome === "accepted" && isPlanApproval) {
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
  const Icon = isPlanApproval
    ? ListChecks
    : structuredElicitation
      ? Plug
      : isQuestion
        ? HelpCircle
        : ShieldAlert;
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
  const contextLine = structuredElicitation
    ? t`${structuredElicitation.sourceText} needs input.`
    : isQuestion
      ? t`${agentLead} needs your input to continue.`
      : undefined;
  const summary = request.payload.summary;
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
  const userInputFormActions = userInputForm ? (
    <div className="flex items-center gap-1">
      <Button
        isDisabled={resolving}
        size="sm"
        variant="ghost"
        className="text-muted"
        onPress={() => submitRaw({ action: "cancel" }, "cancelled")}
      >
        <Trans>Cancel</Trans>
      </Button>
      <Button
        form={formId}
        isDisabled={resolving}
        size="sm"
        type="submit"
        variant="tertiary"
        className="text-white"
      >
        <Trans>Submit</Trans>
      </Button>
    </div>
  ) : null;
  const requestDetails =
    permissionDetails && !isPlanApproval ? (
      <PermissionDetailsLine details={permissionDetails} />
    ) : opencodePermission ? (
      <OpenCodePermissionDetailsLine details={opencodePermission} />
    ) : !structuredElicitation && detailText ? (
      <pre className="rounded-sm bg-foreground/5 p-1 font-mono text-[11px] whitespace-pre-wrap break-words">
        {detailText}
      </pre>
    ) : null;

  return (
    <ThreadDockSection className="!text-xs" placement="composer" collapsed={false}>
      <div className="@container flex flex-wrap items-start gap-x-2 gap-y-1 px-2 py-1.5 leading-snug">
        <Icon
          className={`mt-0.5 size-3.5 shrink-0 ${structuredElicitation || isQuestion || isPlanApproval ? "text-foreground-muted" : "text-warning"}`}
        />
        <div className="min-w-0 flex-1 basis-96">
          <div className="font-semibold text-foreground">{summary}</div>
          {userInputFormController && userInputFormController.questions.length > 1 ? (
            <>
              <QuestionSwitcher
                questions={userInputFormController.questions}
                answers={userInputFormController.answers}
                customAnswers={userInputFormController.customAnswers}
                activeIndex={userInputFormController.activeIndex}
                isDisabled={resolving}
                onSelect={userInputFormController.setActiveIndex}
              />
              {contextLine ? (
                <div className="text-[11px] text-[color:var(--muted)]">{contextLine}</div>
              ) : null}
            </>
          ) : contextLine ? (
            <div className="text-[11px] text-[color:var(--muted)]">{contextLine}</div>
          ) : null}
          {requestDetails || planFilePath || planText ? (
            <div
              role="region"
              aria-label={t`Request details`}
              className="mt-0.5 max-h-[min(12rem,35vh)] overflow-y-auto pr-1 [scrollbar-gutter:stable]"
            >
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
        ) : userInputFormActions ? (
          <div className="ml-auto shrink-0 self-start">{userInputFormActions}</div>
        ) : null}
      </div>

      {structuredElicitation ? (
        <StructuredElicitationForm
          params={structuredElicitation}
          isDisabled={resolving}
          onSubmit={(response, outcome) => submitRaw(response, outcome)}
        />
      ) : userInputFormController ? (
        <UserInputForm
          formId={formId}
          controller={userInputFormController}
          isDisabled={resolving}
          {...(summary !== undefined ? { summary } : {})}
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
