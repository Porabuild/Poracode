import { Dropdown, Separator } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import type { PrListSort } from "./prListModel";
import {
  CLEAR_FILTERS_ID,
  filterBadgeCount,
  PrClearFiltersItem,
  PrFilterSections,
  PrSortSection,
  type PrFilterControls,
} from "./PrListMenuSections";

export function PrSortMenu(props: {
  value: PrListSort;
  onChange: (value: PrListSort) => void;
  /** A HeroUI `Button`; the dropdown uses it as its trigger. */
  trigger: ReactNode;
}) {
  const { t } = useLingui();
  return (
    <Dropdown>
      {props.trigger}
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu aria-label={t`Sort pull requests`} className="poracode-menu min-w-52">
          <PrSortSection value={props.value} onChange={props.onChange} />
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

export function PrFilterMenu(
  props: PrFilterControls & {
    /** Content of the trigger button, which is styled by `triggerClassName`. */
    trigger: ReactNode;
    triggerClassName?: string;
    triggerLabel?: string;
    onClearFilters: () => void;
  },
) {
  const { t } = useLingui();
  const count = filterBadgeCount(props.state, props.filters);
  const { trigger, triggerClassName, triggerLabel, onClearFilters, ...controls } = props;
  return (
    <Dropdown>
      <Dropdown.Trigger
        {...(triggerClassName !== undefined ? { className: triggerClassName } : {})}
        {...(triggerLabel !== undefined ? { "aria-label": triggerLabel } : {})}
      >
        {trigger}
      </Dropdown.Trigger>
      <Dropdown.Popover placement="bottom start">
        <Dropdown.Menu
          aria-label={t`Filter pull requests`}
          className="poracode-menu max-h-[70dvh] min-w-56 overflow-y-auto"
          onAction={(key) => {
            if (key === CLEAR_FILTERS_ID) onClearFilters();
          }}
        >
          <PrFilterSections {...controls} />
          {count > 0 ? (
            <>
              <Separator />
              <PrClearFiltersItem />
            </>
          ) : null}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
