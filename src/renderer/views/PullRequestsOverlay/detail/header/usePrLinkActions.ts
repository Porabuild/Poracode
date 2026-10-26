import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { usePrUrl } from "@/renderer/state/gitSelectors";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import { usePrDetailScope } from "../prDetailScope";

/** Copy and open actions for the review's link and number, shared by the desktop and compact headers. */
export function usePrLinkActions() {
  const { t } = useLingui();
  const scope = usePrDetailScope();
  const url = usePrUrl(scope.prKey);

  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch {
      toast.danger(t`Could not copy to the clipboard.`);
    }
  }
  return {
    url,
    copyLink: () => {
      if (url) void copy(url, t`Link copied`);
    },
    copyNumber: () => void copy(`#${scope.prNumber}`, t`Number copied`),
    openExternal: () => {
      if (url) openExternalWithFeedback(url);
    },
  };
}
