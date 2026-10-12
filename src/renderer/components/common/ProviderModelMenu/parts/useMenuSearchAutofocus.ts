import { useEffect, useRef, type RefObject } from "react";

/**
 * Focus the menu's search field shortly after the surface opens on desktop.
 * On mobile, autofocusing would pop the keyboard over the drawer, so the user
 * taps the field when they want to filter. Shared by the model picker and the
 * family selector menus so both behave identically.
 */
export function useMenuSearchAutofocus(
  isOpen: boolean,
  mobile: boolean,
  searchRef: RefObject<HTMLInputElement | null>,
): void {
  const wasMenuOpenRef = useRef(false);
  useEffect(() => {
    const opened = isOpen && !wasMenuOpenRef.current;
    wasMenuOpenRef.current = isOpen;
    if (opened && !mobile) setTimeout(() => searchRef.current?.focus(), 50);
  }, [isOpen, mobile, searchRef]);
}
