import {
  cloneElement,
  Fragment,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import { Dropdown, Label } from "@heroui/react";
import { Header } from "react-aria-components";

import { Check } from "lucide-react";
import { BottomSheet } from "@/renderer/components/common/BottomSheet";
import { useResponsiveMenu } from "@/renderer/components/common/ResponsiveMenuSurface";

export interface PrMenuItem {
  id: string;
  label: string;
  labelContent?: ReactNode;
  icon?: ReactNode;
  /** Draws a check mark: the item is the selected option (or an enabled toggle). */
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
  /** Why the item is unavailable, shown under its label. */
  reason?: string | undefined;
  /** The menu stays open after the choice (a multi-select row). */
  keepOpen?: boolean;
  onSelect: () => void;
}

/** Eyebrow header above a menu group. */
export function PrMenuSectionTitle(props: { children: ReactNode }) {
  return (
    <Header className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
      {props.children}
    </Header>
  );
}

export interface PrMenuSection {
  id: string;
  title?: string;
  items: PrMenuItem[];
}

/**
 * Every menu of the pull-request pages goes through this one wrapper: a dropdown on
 * desktop, the app's bottom sheet (neutral 44px rows, check marks for the selected
 * ones) on compact layouts. `trigger` is the button that opens it.
 */
export function PrResponsiveMenu(props: {
  label: string;
  sections: readonly PrMenuSection[];
  trigger: ReactElement<{ onPress?: () => void }>;
  placement?: ComponentProps<typeof Dropdown.Popover>["placement"];
  menuClassName?: string;
}) {
  const { mobile } = useResponsiveMenu();
  const [open, setOpen] = useState(false);
  const sections = props.sections.filter((section) => section.items.length > 0);

  if (mobile) {
    const choose = (item: PrMenuItem) => () => {
      if (!item.keepOpen) setOpen(false);
      item.onSelect();
    };
    return (
      <>
        {cloneElement(props.trigger, { onPress: () => setOpen(true) })}
        <BottomSheet isOpen={open} label={props.label} onClose={() => setOpen(false)}>
          <div className="m-sheet-head">
            <span className="truncate">{props.label}</span>
          </div>
          <div className="m-sheet-list">
            {sections.map((section) => (
              <Fragment key={section.id}>
                {section.title ? <div className="m-sheet-section">{section.title}</div> : null}
                {section.items.map((item) => {
                  const tone = item.danger ? "text-danger" : "";
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="m-sheet-action"
                      aria-pressed={item.checked === undefined ? undefined : item.checked}
                      disabled={item.disabled === true || item.reason !== undefined}
                      onClick={choose(item)}
                    >
                      {item.icon ? (
                        <span
                          className={`flex size-4 shrink-0 items-center ${tone || "text-muted"}`}
                        >
                          {item.icon}
                        </span>
                      ) : null}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className={`truncate ${tone}`}>
                          {item.labelContent ?? item.label}
                        </span>
                        {item.reason ? (
                          <span className="text-[11px] text-muted">{item.reason}</span>
                        ) : null}
                      </span>
                      {item.checked ? <Check className="size-4 shrink-0" aria-hidden /> : null}
                    </button>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </BottomSheet>
      </>
    );
  }

  const byId = new Map(sections.flatMap((section) => section.items).map((item) => [item.id, item]));
  return (
    <Dropdown>
      {props.trigger}
      <Dropdown.Popover placement={props.placement ?? "bottom end"}>
        <Dropdown.Menu
          aria-label={props.label}
          className={`poracode-menu min-w-44 ${props.menuClassName ?? ""}`}
          disabledKeys={[...byId.values()]
            .filter((item) => item.disabled === true || item.reason !== undefined)
            .map((item) => item.id)}
          onAction={(key) => byId.get(String(key))?.onSelect()}
        >
          {sections.map((section) => (
            <Dropdown.Section key={section.id}>
              {section.title ? <PrMenuSectionTitle>{section.title}</PrMenuSectionTitle> : null}
              {section.items.map((item) => (
                <Dropdown.Item
                  key={item.id}
                  id={item.id}
                  textValue={item.label}
                  {...(item.danger ? { variant: "danger" as const } : {})}
                >
                  {item.icon}
                  <Label className="min-w-0 flex-1 truncate">
                    {item.labelContent ?? item.label}
                  </Label>
                  <span className="size-4 shrink-0" aria-hidden>
                    {item.checked ? <Check className="size-4" /> : null}
                  </span>
                </Dropdown.Item>
              ))}
            </Dropdown.Section>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
