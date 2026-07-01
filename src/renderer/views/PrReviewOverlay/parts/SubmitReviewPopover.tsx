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
import { readBridge } from "@/renderer/bridge";
import {
  ResponsiveMenuSurface,
  useResponsiveMenu,
} from "@/renderer/components/common/ResponsiveMenuSurface";

export function SubmitReviewPopover(props: {
  projectLocation: ProjectLocation;
  prNumber: number;
  /** Hide the trigger when the viewer authored the PR (GitHub disallows self-review). */
  hidden?: boolean;
  triggerPresentation?: "compact" | "touch";
  onSubmitted: () => void;
}) {
  const { projectLocation, prNumber, hidden, triggerPresentation = "compact", onSubmitted } = props;
  const { t } = useLingui();
  const { mobile } = useResponsiveMenu();
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<PrReviewDecision>("comment");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const requiresBody = decision !== "approve";
  const bodyEmpty = body.trim().length === 0;

  if (hidden) return null;

  async function handleSubmit() {
    if (requiresBody && bodyEmpty) return;
    setSubmitting(true);
    try {
      await readBridge().ghSubmitPrReview({
        projectLocation,
        prNumber,
        decision,
        body,
      });
      toast.success(
        decision === "approve"
          ? t`Approved`
          : decision === "request-changes"
            ? t`Changes requested`
            : t`Comment posted`,
      );
      setOpen(false);
      setBody("");
      setDecision("comment");
      onSubmitted();
    } catch (err) {
      toast.danger(friendlyError(err));
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

  const triggerButton = (
    <Button
      size="sm"
      variant="primary"
      className={
        triggerPresentation === "touch"
          ? "h-11 min-h-11 w-full justify-start gap-2 rounded-[0.625rem] bg-success px-3 text-sm font-medium text-success-foreground hover:bg-success/90"
          : "h-5 min-h-0 gap-1 bg-success px-2 text-[11px] font-medium text-success-foreground hover:bg-success/90"
      }
      onPress={() => setOpen(true)}
    >
      <Check className="size-3" />
      <Trans>Submit review</Trans>
    </Button>
  );

  const form = (
    <div className="mt-2 flex flex-col gap-3">
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
          <Radio key={value} value={value} className="items-start">
            <Radio.Control className="mt-0.5">
              <Radio.Indicator />
            </Radio.Control>
            <Radio.Content>
              <div className="flex items-center gap-1.5">
                <Icon className="size-3.5 shrink-0 text-muted" />
                <Label className="text-xs font-medium">{label}</Label>
              </div>
              <Description className="text-[11px] text-muted">{description}</Description>
            </Radio.Content>
          </Radio>
        ))}
      </RadioGroup>
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
          isDisabled={submitting || (requiresBody && bodyEmpty)}
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
