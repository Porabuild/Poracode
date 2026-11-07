import { useState } from "react";
import {
  Button,
  Description,
  Label,
  Popover,
  Radio,
  RadioGroup,
  TextArea,
  toast,
} from "@heroui/react";
import { Check, MessageSquare, X } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { PrReviewDecision, ProjectLocation } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import {
  reviewClient,
  reviewSourceIdentity,
  scopedReviewClient,
} from "@/renderer/utils/forgeReviews";
import { useGitStore } from "@/renderer/state/gitStore";
import {
  ResponsiveMenuSurface,
  useResponsiveMenu,
} from "@/renderer/components/common/ResponsiveMenuSurface";
import { MobileCircleButton } from "@/renderer/components/mobileComposer/MobileCircleButton";
import { usePrDetailNav } from "../detail/prDetailNav";
import { usePrDetailScope } from "../detail/prDetailScope";
import { currentDrafts, useReviewDraftStore, useReviewDrafts } from "../changes/prReviewDraftStore";
import { ReviewDraftSummary } from "../changes/ReviewDraftSummary";

/** The host accepts at most this many line comments in one review. */
const MAX_DRAFT_COMMENTS = 100;

/**
 * The single "Review changes" entry: decision, summary and the drafted line
 * comments. Drafts are sent together with the decision when the host supports
 * it; without drafts this is the plain review submission.
 */
export function SubmitReviewPopover(props: {
  projectLocation: ProjectLocation;
  prNumber: number;
  prKey: string;
  cacheKey: string;
  /** Hide the trigger when the viewer authored the PR (GitHub disallows self-review). */
  hidden?: boolean;
  /** `circle` is the compact page's bottom-bar action: an icon button with the draft count. */
  triggerPresentation?: "compact" | "touch" | "circle";
  triggerLabel?: string;
  disabled?: boolean;
  onSubmitted: () => void;
}) {
  const {
    projectLocation,
    prNumber,
    prKey,
    cacheKey,
    hidden,
    triggerPresentation = "compact",
    triggerLabel,
    disabled = false,
    onSubmitted,
  } = props;
  const { t } = useLingui();
  const scope = usePrDetailScope();
  const nav = usePrDetailNav();
  const source = useGitStore((s) => s.prDetails[cacheKey]?.source);
  const prState = useGitStore((s) => s.prData[prKey]?.state);
  const detailsReady = useGitStore(
    (s) =>
      !disabled &&
      s.prData[prKey] !== null &&
      (!s.prData[prKey] || s.prData[prKey]?.number === prNumber) &&
      s.prDetails[cacheKey]?.number === prNumber &&
      reviewSourceIdentity(s.prDetails[cacheKey]?.source) ===
        reviewSourceIdentity(s.prData[prKey]?.source),
  );
  const storedDrafts = useReviewDrafts(scope.draftKey);
  const { mobile } = useResponsiveMenu();
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<PrReviewDecision>("comment");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { scoped, headSha } = scope;
  const draftsSupported = scoped?.capabilities.reviewDrafts === true;
  const drafts = draftsSupported ? currentDrafts(storedDrafts, headSha) : [];
  const outdatedCount = draftsSupported ? storedDrafts.length - drafts.length : 0;
  const sendsDrafts = drafts.length > 0;
  const tooMany = drafts.length > MAX_DRAFT_COMMENTS;
  const requiresBody = decision === "request-changes" || (decision === "comment" && !sendsDrafts);
  const bodyEmpty = body.trim().length === 0;
  const decisionAllowed = !source || source.capabilities.reviewDecisions.includes(decision);
  const canSubmit =
    detailsReady &&
    !submitting &&
    !(requiresBody && bodyEmpty) &&
    decisionAllowed &&
    !tooMany &&
    !(sendsDrafts && (!scoped || !headSha));

  if (hidden || (prState != null && prState !== "open")) return null;

  async function handleSubmit() {
    if (!canSubmit) return;
    const isCurrent = () => {
      const currentPr = useGitStore.getState().prData[prKey];
      return (
        currentPr !== null &&
        (!currentPr || currentPr.number === prNumber) &&
        reviewSourceIdentity(currentPr?.source) === reviewSourceIdentity(source)
      );
    };
    if (!isCurrent()) return;
    setSubmitting(true);
    setError(null);
    try {
      if (sendsDrafts && scoped && headSha) {
        await scopedReviewClient(scoped).submitDraft({
          projectLocation,
          prNumber,
          decision,
          body,
          expectedHeadSha: headSha,
          comments: drafts.map(({ path, side, line, body: text }) => ({
            path,
            side,
            line,
            body: text,
          })),
        });
        useReviewDraftStore.getState().removeMany(
          scope.draftKey,
          drafts.map((draft) => draft.id),
        );
      } else {
        await reviewClient(source).review({ projectLocation, prNumber, decision, body });
      }
      if (!isCurrent()) return;
      toast.success(
        decision === "approve"
          ? t`Approved`
          : decision === "request-changes"
            ? t`Changes requested`
            : sendsDrafts
              ? t`Review submitted`
              : t`Comment posted`,
      );
      setOpen(false);
      setBody("");
      setDecision("comment");
      onSubmitted();
    } catch (err) {
      // Drafts stay in the store: a head change or partial post must not lose them.
      const message = friendlyError(err);
      setError(message);
      toast.danger(message);
    } finally {
      setSubmitting(false);
    }
  }

  const options: {
    value: PrReviewDecision;
    label: string;
    description: string;
    icon: typeof Check;
  }[] = [
    {
      value: "comment",
      label: t`Comment`,
      description: t`Submit feedback without explicit approval.`,
      icon: MessageSquare,
    },
    {
      value: "approve",
      label: t`Approve`,
      description: t`Submit feedback and approve merging these changes.`,
      icon: Check,
    },
    {
      value: "request-changes",
      label: t`Request changes`,
      description: t`Submit feedback that must be addressed before merging.`,
      icon: X,
    },
  ];

  const detailsBlocked = !detailsReady || source?.capabilities.reviewDecisions.length === 0;
  const triggerButton =
    triggerPresentation === "circle" ? (
      <div className="relative">
        <MobileCircleButton
          aria-label={triggerLabel ?? t`Review changes`}
          isDisabled={detailsBlocked}
          onPress={() => setOpen(true)}
        >
          <Check className="size-4" />
        </MobileCircleButton>
        {drafts.length > 0 ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold leading-none text-background"
          >
            {drafts.length}
          </span>
        ) : null}
      </div>
    ) : (
      <Button
        size="sm"
        variant="primary"
        className={
          triggerPresentation === "touch"
            ? "h-11 min-h-11 w-full justify-start gap-2 rounded-[0.625rem] bg-success px-3 text-sm font-medium text-success-foreground hover:bg-success/90"
            : "gap-1 bg-success px-2 text-xs font-medium text-success-foreground hover:bg-success/90"
        }
        isDisabled={detailsBlocked}
        onPress={() => setOpen(true)}
      >
        <Check className="size-3.5" />
        {triggerLabel ?? <Trans>Review changes</Trans>}
        {drafts.length > 0 ? (
          <span
            aria-hidden
            className="rounded-full bg-success-foreground/20 px-1 text-[10px] leading-4"
          >
            {drafts.length}
          </span>
        ) : null}
      </Button>
    );

  const form = (
    <div className="mt-2 flex flex-col gap-3">
      <ReviewDraftSummary
        drafts={drafts}
        outdatedCount={outdatedCount}
        tooMany={tooMany}
        disabled={submitting}
        onOpen={(draft) => {
          setOpen(false);
          nav.openFile(draft.path, draft.side === "RIGHT" ? draft.line : undefined);
        }}
        onDiscardOutdated={() =>
          useReviewDraftStore.getState().removeOutdated(scope.draftKey, headSha)
        }
      />
      <TextArea
        aria-label={t`Review comment`}
        className="h-20 w-full text-xs"
        placeholder={t`Leave a comment`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={submitting}
      />
      <RadioGroup
        aria-label={t`Review decision`}
        className="gap-1.5"
        value={decision}
        onChange={(v) => setDecision(v as PrReviewDecision)}
      >
        {options.map(({ value, label, description, icon: Icon }) => (
          <Radio
            key={value}
            value={value}
            isDisabled={Boolean(source && !source.capabilities.reviewDecisions.includes(value))}
          >
            {/* The control belongs inside Radio.Content (the clickable row); the description is its sibling. */}
            <Radio.Content className="gap-2">
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              <Icon className="size-3.5 shrink-0 text-muted" />
              <Label className="text-xs font-medium">{label}</Label>
            </Radio.Content>
            <Description className="text-[11px] text-muted">{description}</Description>
          </Radio>
        ))}
      </RadioGroup>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="tertiary" size="sm" onPress={() => setOpen(false)} isDisabled={submitting}>
          <Trans>Cancel</Trans>
        </Button>
        <Button
          variant="primary"
          size="sm"
          className="bg-success text-success-foreground hover:bg-success/90"
          onPress={() => void handleSubmit()}
          isPending={submitting}
          isDisabled={!canSubmit}
        >
          <Trans>Submit review</Trans>
        </Button>
      </div>
    </div>
  );

  // Mobile PWA: a bottom drawer instead of the cramped 340px desktop popover.
  if (mobile) {
    return (
      <ResponsiveMenuSurface
        isOpen={open}
        onOpenChange={setOpen}
        label={t`Finish your review`}
        trigger={triggerButton}
      >
        <div className="overflow-y-auto px-0.5 pb-1">{form}</div>
      </ResponsiveMenuSurface>
    );
  }

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      {triggerButton}
      <Popover.Content className="w-[340px]">
        <Popover.Dialog>
          <Popover.Heading>
            <Trans>Finish your review</Trans>
          </Popover.Heading>
          {form}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
