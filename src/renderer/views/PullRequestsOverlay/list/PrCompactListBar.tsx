import { RefreshCw, SlidersHorizontal } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { MobileMachineToolbar } from "@/renderer/components/common/MobileMachineToolbar";
import { MobileCircleButton } from "@/renderer/components/mobileComposer/MobileCircleButton";
import { PrResponsiveMenu } from "../parts/PrResponsiveMenu";
import type { PrListSort } from "./prListModel";
import { filterBadgeCount, type PrFilterControls } from "./PrListMenuSections";
import { usePrListSheetSections } from "./prListSheetSections";

/**
 * The compact list's one thumb-reachable bottom row, the Usage page's pattern:
 * `[filter and sort][machine][refresh]`. The machine picker only renders when the
 * host supplies the machine to show; otherwise the two actions sit at the edges.
 */
export function PrCompactListBar(props: {
  sort: PrListSort;
  onSortChange: (sort: PrListSort) => void;
  filterControls: PrFilterControls;
  loading: boolean;
  onRefresh: () => void;
  onClearFilters: () => void;
  desktopId?: string | undefined;
  onDesktopChange?: ((desktopId: string | null) => void) | undefined;
}) {
  const { t } = useLingui();
  const { state, filters } = props.filterControls;
  const count = filterBadgeCount(state, filters);
  const sections = usePrListSheetSections({
    sort: props.sort,
    onSortChange: props.onSortChange,
    controls: props.filterControls,
    canClear: count > 0,
    onClear: props.onClearFilters,
  });
  const menu = (
    <PrResponsiveMenu
      label={t`Filter and sort`}
      placement="top start"
      sections={sections}
      trigger={
        <MobileCircleButton
          className="relative"
          aria-label={count > 0 ? t`Filter and sort (${count} active)` : t`Filter and sort`}
        >
          <SlidersHorizontal className="size-4" />
          {count > 0 ? (
            <span
              aria-hidden
              className="absolute right-1 top-1 flex min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[9px] font-semibold text-accent-foreground"
            >
              {count}
            </span>
          ) : null}
        </MobileCircleButton>
      }
    />
  );
  const refresh = (
    <MobileCircleButton
      aria-label={t`Refresh`}
      isDisabled={props.loading}
      onPress={props.onRefresh}
    >
      <RefreshCw className={`size-4 ${props.loading ? "animate-spin" : ""}`} />
    </MobileCircleButton>
  );
  return props.desktopId && props.onDesktopChange ? (
    <MobileMachineToolbar
      desktopId={props.desktopId}
      onDesktopChange={props.onDesktopChange}
      leading={menu}
      trailing={refresh}
    />
  ) : (
    <MobileMachineToolbar leading={menu} trailing={refresh} />
  );
}
