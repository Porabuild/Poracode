import { useEffect, useState } from "react";

/**
 * Reactively reads a boolean dataset flag on the document root (e.g.
 * `data-sidebar-glass="on"`). The AppProvider toggles these attributes
 * asynchronously (after confirming OS support / once content is ready), so we
 * observe the attribute rather than read it once at mount.
 */
function useHtmlFlag(attribute: string, onValue = "on"): boolean {
  const [active, setActive] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.getAttribute(attribute) === onValue,
  );
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setActive(root.getAttribute(attribute) === onValue);
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: [attribute] });
    return () => observer.disconnect();
  }, [attribute, onValue]);
  return active;
}

/**
 * Whether the translucent ("liquid glass") sidebar is currently rendered —
 * either the native blur material or the in-app fallback tint.
 */
export function useSidebarGlassActive(): boolean {
  return useHtmlFlag("data-sidebar-glass");
}

/**
 * Whether a native OS blur material (Windows 11 acrylic / macOS vibrancy) is
 * composited behind the window.
 */
export function useNativeMaterialActive(): boolean {
  return useHtmlFlag("data-native-material");
}
