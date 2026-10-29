import { Button, Tooltip } from "@heroui/react";
import { ArrowDownUp, RefreshCw } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { PrListController } from "./usePrListController";
import { PrSortMenu } from "./PrListMenus";

export function PrListHeaderControls(props: { controller: PrListController }) {
  const { t } = useLingui();
  const { controller } = props;
  return (
    <div className="poracode-overlay-header__controls flex items-center gap-1.5">
      <PrSortMenu
        value={controller.sort}
        onChange={controller.setSort}
        trigger={
          <Button
            isIconOnly
            aria-label={t`Sort pull requests`}
            size="sm"
            variant="ghost"
            className="size-6 min-w-0 text-muted hover:text-foreground"
          >
            <ArrowDownUp className="size-3.5" />
          </Button>
        }
      />
      <Tooltip delay={150}>
        <Tooltip.Trigger>
          <Button
            isIconOnly
            aria-label={t`Refresh`}
            size="sm"
            variant="ghost"
            className="size-6 min-w-0 text-muted hover:text-foreground"
            isDisabled={controller.data.loading}
            onPress={controller.data.refresh}
          >
            <RefreshCw className={`size-3.5 ${controller.data.loading ? "animate-spin" : ""}`} />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content placement="bottom">
          <Trans>Refresh</Trans>
        </Tooltip.Content>
      </Tooltip>
    </div>
  );
}
