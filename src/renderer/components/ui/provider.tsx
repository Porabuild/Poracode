import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
  type ReactNode,
} from "react";
import { resolveThemeMode } from "../../../shared/themeMode";
import { readBridge } from "../../bridge";
import { useAppStore } from "../../state/appStore";

const AppearanceContext = createContext<"light" | "dark">("dark");

export function useResolvedAppearance(): "light" | "dark" {
  return useContext(AppearanceContext);
}

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function AppProvider(props: { children: ReactNode }) {
  const { children } = props;
  const themeMode = useAppStore((state) => state.themeMode);
  const [prefersDark, setPrefersDark] = useState(getSystemPrefersDark);
  const syncSystemPreference = useEffectEvent((matches: boolean) => {
    setPrefersDark(matches);
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      syncSystemPreference(event.matches);
    };

    syncSystemPreference(media.matches);
    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, []);

  const appearance = resolveThemeMode(themeMode, prefersDark);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(appearance);
    root.dataset.theme = appearance;
  }, [appearance]);

  useEffect(() => {
    if (typeof window === "undefined" || !("lightcode" in window)) {
      return;
    }

    const root = document.documentElement;
    const styles = window.getComputedStyle(root);

    void readBridge()
      .setWindowChrome({
        backgroundColor:
          styles.getPropertyValue("--window-overlay-background").trim() || "rgba(0, 0, 0, 0)",
        symbolColor: appearance === "dark" ? "#fafafa" : "#1f2937",
      })
      .catch(() => {
        // Keep renderer boot resilient if Electron rejects a color value.
      });
  }, [appearance]);

  return <AppearanceContext.Provider value={appearance}>{children}</AppearanceContext.Provider>;
}
