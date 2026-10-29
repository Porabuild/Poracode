import { GitMerge } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { ResponsiveMenuSurface } from "@/renderer/components/common/ResponsiveMenuSurface";
import { MobileCircleButton } from "@/renderer/components/mobileComposer/MobileCircleButton";
import { MergeMethodLabel, PrMergeConfirm } from "../detail/header/PrMergeConfirm";
import { MERGE_METHODS, usePrMergeFlow } from "../detail/header/usePrMergeFlow";

/**
 * Merge from the compact bottom bar: an icon button that opens the merge
 * confirmation in a bottom sheet. The sheet leads with the merge method so a
 * non-default method is one tap away; merging itself is never one tap.
 */
export function PrCompactMergeAction() {
  const { t } = useLingui();
  const flow = usePrMergeFlow();
  const { mergeMethods, preferredMethod } = flow.readiness;
  return (
    <ResponsiveMenuSurface
      isOpen={flow.method !== null}
      onOpenChange={(open) => !open && flow.dismiss()}
      label={t`Confirm merge`}
      trigger={
        <MobileCircleButton
          aria-label={t`Merge`}
          isDisabled={flow.triggerDisabled}
          isPending={flow.merging}
          onPress={() => flow.ask(preferredMethod)}
        >
          <GitMerge className="size-4" />
        </MobileCircleButton>
      }
    >
      <div className="flex flex-col gap-1 px-3 pb-2">
        <div aria-label={t`Merge method`} className="flex flex-col gap-1">
          {MERGE_METHODS.filter((method) => mergeMethods.includes(method)).map((method) => (
            <button
              key={method}
              type="button"
              aria-pressed={flow.selected === method}
              className={`flex min-h-11 items-center rounded-lg px-3 text-left text-sm ${
                flow.selected === method ? "bg-default font-medium text-foreground" : "text-muted"
              }`}
              onClick={() => flow.ask(method)}
            >
              <MergeMethodLabel method={method} />
            </button>
          ))}
        </div>
        <PrMergeConfirm flow={flow} showMethod={false} />
      </div>
    </ResponsiveMenuSurface>
  );
}
