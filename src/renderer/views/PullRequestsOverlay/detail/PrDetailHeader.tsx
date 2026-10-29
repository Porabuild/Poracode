import { Copy, ExternalLink, MoreHorizontal, RefreshCw } from "lucide-react";
import { Button, Dropdown, Label } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { PixelLoader } from "@/renderer/components/common";
import { usePrState } from "@/renderer/state/gitSelectors";
import { PrAutomationControl } from "./header/PrAutomationControl";
import { PrCheckoutMenu } from "./header/PrCheckoutMenu";
import { PrMergeControls } from "./header/PrMergeControls";
import { PrStateMenu } from "./header/PrStateMenu";
import { usePrLinkActions } from "./header/usePrLinkActions";
import { usePrDetailNav } from "./prDetailNav";
import { usePrDetailScope } from "./prDetailScope";

/** Content-header bar: state, where the review lives, and its primary actions. */
export function PrDetailHeader() {
  const { t } = useLingui();
  const scope = usePrDetailScope();
  const nav = usePrDetailNav();
  const state = usePrState(scope.prKey);
  const { url, copyLink, copyNumber, openExternal } = usePrLinkActions();
  const open = state === "open" || state === "draft";
  const repository = scope.source?.repository;

  return (
    <>
      <div className="flex min-w-0 shrink items-center gap-2 pl-1.5">
        <PrStateMenu />
        <span className="min-w-0 truncate text-xs text-muted">
          {repository ? `${repository} ` : ""}
          <span className="font-mono">#{scope.prNumber}</span>
        </span>
        {scope.loading && !scope.cached ? (
          <span
            role="status"
            aria-label={t`Loading:`}
            className="inline-flex size-4 shrink-0 items-center justify-center"
          >
            <PixelLoader size="xs" />
          </span>
        ) : null}
        {url ? (
          <div className="poracode-overlay-header__controls flex items-center">
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label={t`Copy link`}
              onPress={copyLink}
            >
              <Copy className="size-3.5" />
            </Button>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label={t`Open on source host`}
              onPress={openExternal}
            >
              <ExternalLink className="size-3.5" />
            </Button>
          </div>
        ) : null}
      </div>
      <div className="flex-1" />
      <div className="poracode-overlay-header__controls flex items-center gap-1.5">
        {open ? <PrAutomationControl triggerClassName="h-8 w-8 rounded-3xl" /> : null}
        <PrCheckoutMenu />
        {state === "open" ? <PrMergeControls /> : null}
        <Dropdown>
          <Button isIconOnly size="sm" variant="ghost" aria-label={t`More actions`}>
            <MoreHorizontal className="size-4" />
          </Button>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu
              aria-label={t`More actions`}
              onAction={(key) => {
                if (key === "refresh") scope.reload();
                else if (key === "copy-number") copyNumber();
                else if (key === "guide") nav.setTab("guide");
              }}
            >
              <Dropdown.Item id="refresh" textValue={t`Refresh`}>
                <RefreshCw className={`size-3.5 ${scope.loading ? "animate-spin" : ""}`} />
                <Label>{t`Refresh`}</Label>
              </Dropdown.Item>
              <Dropdown.Item id="copy-number" textValue={t`Copy number`}>
                <Label>{t`Copy number`}</Label>
              </Dropdown.Item>
              {scope.scoped?.capabilities.reviewGuides ? (
                <Dropdown.Item id="guide" textValue={t`Review guide`}>
                  <Label>{t`Review guide`}</Label>
                </Dropdown.Item>
              ) : null}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>
    </>
  );
}
