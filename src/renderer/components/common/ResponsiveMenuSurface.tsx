import type { ComponentProps, ReactNode } from "react";
import { Popover, useMediaQuery } from "@heroui/react";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { isRemoteSession } from "@/renderer/bridge";
import { BottomSheet } from "./BottomSheet";

/** The placement union HeroUI's popover accepts, derived from the component. */
type Placement = ComponentProps<typeof Popover.Content>["placement"];

const DESKTOP_POINTER_QUERY = "(min-width: 768px) and (hover: hover) and (pointer: fine)";

function useCompactMenuSurface(): boolean {
  const compact = useCompactLayout();
  const desktopPointer = useMediaQuery(DESKTOP_POINTER_QUERY);
  return compact || (isRemoteSession() && !desktopPointer);
}

/**
 * A composer/menu popover with a bottom-drawer presentation for coarse input.
 * Popovers anchored to a tiny toolbar trigger are cramped and fiddly to tap
 * on a phone; a full-width bottom sheet gives roomy targets and matches the rest
 * of the mobile shell.
 *
 * The sheet reuses the canonical renderer's `.m-sheet*` styles.
 *
 * The menu owns its own open state (so it keeps working identically on desktop);
 * it must wire its trigger button to call `onOpenChange(true)` on press when
 * {@link useResponsiveMenu} reports `mobile`, since the sheet path doesn't use
 * HeroUI's `Popover.Trigger` press handling.
 */
export function ResponsiveMenuSurface(props: {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Trigger button. On desktop it is wrapped by `Popover.Trigger`. */
  readonly trigger: ReactNode;
  /** Menu body, rendered inside the popover dialog or the drawer. */
  readonly children: ReactNode | ((state: { readonly expanded: boolean }) => ReactNode);
  /** Accessible name + heading for the drawer (mobile only). */
  readonly label: string;
  /** Desktop popover placement. */
  readonly placement?: Placement;
  /** Desktop `Popover.Content` className. */
  readonly contentClassName?: string;
  /** Desktop `Popover.Dialog` className. */
  readonly dialogClassName?: string;
  /** Additional class for the compact bottom sheet. */
  readonly sheetClassName?: string;
  /** Applied to `Popover.Trigger` (desktop) / the trigger wrapper (mobile). */
  readonly triggerClassName?: string;
}) {
  const mobile = useCompactMenuSurface();
  const desktopBody =
    typeof props.children === "function" ? props.children({ expanded: false }) : props.children;

  if (!mobile) {
    return (
      <Popover isOpen={props.isOpen} onOpenChange={props.onOpenChange}>
        <Popover.Trigger {...(props.triggerClassName ? { className: props.triggerClassName } : {})}>
          {props.trigger}
        </Popover.Trigger>
        {props.isOpen ? (
          <Popover.Content
            placement={props.placement ?? "top start"}
            {...(props.contentClassName ? { className: props.contentClassName } : {})}
          >
            <Popover.Dialog
              {...(props.dialogClassName ? { className: props.dialogClassName } : {})}
            >
              {desktopBody}
            </Popover.Dialog>
          </Popover.Content>
        ) : null}
      </Popover>
    );
  }

  return (
    <>
      {props.triggerClassName ? (
        <div className={props.triggerClassName}>{props.trigger}</div>
      ) : (
        props.trigger
      )}
      <BottomSheet
        isOpen={props.isOpen}
        label={props.label}
        {...(props.sheetClassName ? { sheetClassName: props.sheetClassName } : {})}
        onClose={() => props.onOpenChange(false)}
      >
        {({ expanded }) => (
          <>
            <div className="m-sheet-head">
              <span className="truncate">{props.label}</span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              {typeof props.children === "function" ? props.children({ expanded }) : props.children}
            </div>
          </>
        )}
      </BottomSheet>
    </>
  );
}

/** Whether composer menus should render as a compact drawer instead of a popover. */
export function useResponsiveMenu(): { readonly mobile: boolean } {
  return { mobile: useCompactMenuSurface() };
}
