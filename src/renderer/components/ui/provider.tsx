import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
  type ReactNode,
} from "react";
import { Toast, toast as heroToast } from "@heroui/react";
import { I18nProvider } from "@lingui/react";
import { Copy } from "lucide-react";
import { resolveThemeMode } from "@/shared/themeMode";
import { applyAppTheme, persistThemeBoot, systemPrefersDark } from "@/renderer/theme/applyAppTheme";
import { applySidebarGlassTint } from "@/renderer/theme/sidebarGlass";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { captureRendererException } from "@/renderer/diagnostics/sentry";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { i18n, dynamicActivate } from "@/renderer/i18n/i18n";
import { detectOSLocale, resolveLocale } from "@/renderer/i18n/locales";
import { getToastActionLabel, normalizeToastContent } from "./toastContent";

function systemPrefersReducedTransparency(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-transparency: reduce)").matches
  );
}

const AppearanceContext = createContext<"light" | "dark">("dark");
const toastContentClassName = "min-w-0 p-0 pr-1";
const toastDescriptionClassName =
  "max-h-[min(22rem,calc(100vh-12rem))] overflow-y-auto overscroll-contain whitespace-pre-wrap pr-1";
const toastTitleClassName = "lc-toast__title";

export function useResolvedAppearance(): "light" | "dark" {
  return useContext(AppearanceContext);
}

interface ToastActionProps {
  actionProps: Record<string, any> | undefined;
  actionLabel: string | undefined;
  isCopyAction: boolean;
}

function ToastAction({ actionProps, actionLabel, isCopyAction }: ToastActionProps) {
  if (!actionProps) return null;
  const { className, ...rest } = actionProps;

  if (isCopyAction) {
    return (
      <Toast.ActionButton
        {...rest}
        {...(actionLabel ? { "aria-label": actionLabel, title: actionLabel } : {})}
        isIconOnly
        size="sm"
        variant="ghost"
        className={`absolute right-3 bottom-3 size-7 min-w-7 ${className ?? ""}`}
      >
        <Copy className="size-3.5" />
      </Toast.ActionButton>
    );
  }

  return (
    <Toast.ActionButton
      size="sm"
      variant="ghost"
      fullWidth
      {...rest}
      className={`w-full justify-center text-[color:var(--overlay-foreground)] ${className ?? ""}`}
    />
  );
}

export function AppProvider(props: {
  children: ReactNode;
  contentReady?: boolean;
  syncWindowChrome?: boolean;
}) {
  // `contentReady` gates the glass material: the window stays opaque through
  // loading and only goes translucent once the main content is mounted, so the
  // app never shows a bare translucent window mid-load.
  const { children, contentReady = false, syncWindowChrome = true } = props;
  const themeMode = useSharedSettings((state) => state.themeMode);
  const themePreset = useSharedSettings((state) => state.themePreset);
  const locale = useSharedSettings((state) => state.locale);
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);
  const syncSystemPreference = useEffectEvent((matches: boolean) => {
    setPrefersDark(matches);
  });
  const sidebarTranslucency = useSharedSettings((state) => state.sidebarTranslucency);
  const sidebarGlassTint = useSharedSettings((state) => state.sidebarGlassTint);
  const [reducedTransparency, setReducedTransparency] = useState(systemPrefersReducedTransparency);
  const syncReducedTransparency = useEffectEvent((matches: boolean) => {
    setReducedTransparency(matches);
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

  useEffect(() => {
    const resolved = resolveLocale(locale, detectOSLocale());
    void dynamicActivate(resolved).catch((error: unknown) => {
      captureRendererException(error, { featureArea: "i18n" });
      // Keep the app usable in the source locale if a catalog fails to load.
    });
  }, [locale]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia("(prefers-reduced-transparency: reduce)");
    const onChange = (event: MediaQueryListEvent) => {
      syncReducedTransparency(event.matches);
    };

    syncReducedTransparency(media.matches);
    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, []);

  const appearance = resolveThemeMode(themeMode, prefersDark);
  // The opt-in translucent sidebar, suppressed when the OS asks for reduced
  // transparency or when viewing over a remote session.
  const remoteSession = isRemoteSession();
  const effectiveGlassEnabled = !remoteSession && sidebarTranslucency && !reducedTransparency;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(appearance);
    root.dataset.theme = appearance;
    applyAppTheme(root, appearance, themePreset);
    persistThemeBoot(appearance, themePreset);
  }, [appearance, themePreset]);

  // Gates the in-app CSS sidebar tint/fallback. Held off until content is ready
  // so the loading screen stays opaque.
  useEffect(() => {
    document.documentElement.dataset.sidebarGlass =
      effectiveGlassEnabled && contentReady ? "on" : "off";
  }, [effectiveGlassEnabled, contentReady]);

  useEffect(() => {
    if (remoteSession) {
      document.documentElement.dataset.nativeMaterial = "off";
      return;
    }
    if (!syncWindowChrome || typeof window === "undefined" || !("poracode" in window)) {
      return;
    }

    const root = document.documentElement;
    const styles = window.getComputedStyle(root);
    const wantMaterial = effectiveGlassEnabled && contentReady;

    void readBridge()
      .setWindowChrome({
        backgroundColor:
          styles.getPropertyValue("--window-overlay-background").trim() || "rgba(0, 0, 0, 0)",
        symbolColor: appearance === "dark" ? "#fafafa" : "#1f2937",
        materialEnabled: wantMaterial,
        appearance,
      })
      .then((result) => {
        // The native material is toggled live by the main process; reveal it via
        // the transparent-window CSS only where the OS actually supports it.
        root.dataset.nativeMaterial = wantMaterial && !!result?.nativeCapable ? "on" : "off";
      })
      .catch((error: unknown) => {
        root.dataset.nativeMaterial = "off";
        captureRendererException(error, { featureArea: "window-chrome" });
        // Keep renderer boot resilient if Electron rejects a color value.
      });
  }, [appearance, effectiveGlassEnabled, contentReady, syncWindowChrome, remoteSession]);

  // User-tuned sidebar frosting (Appearance slider): override the glass tint
  // alpha for the active appearance. No-op on platforms without a native blur
  // material / when an appearance has no override, leaving the styles.css
  // per-platform default authoritative.
  useEffect(() => {
    applySidebarGlassTint(
      document.documentElement,
      sidebarGlassTint[appearance],
      effectiveGlassEnabled && contentReady,
    );
  }, [appearance, effectiveGlassEnabled, contentReady, sidebarGlassTint]);

  return (
    <I18nProvider i18n={i18n}>
      <AppearanceContext.Provider value={appearance}>
        <Toast.Provider placement="bottom end" maxVisibleToasts={5}>
          {({ toast: toastItem }) => {
            const content = toastItem.content;
            const isObject = typeof content === "object" && content !== null;
            const rawTitle = isObject ? (content as any).title : content;
            const rawDescription = isObject ? (content as any).description : undefined;
            const variant = isObject ? (content as any).variant : "default";
            const { title, description } = normalizeToastContent(variant, rawTitle, rawDescription);
            const onPress = isObject ? (content as any).onPress : undefined;
            const hasOnPress = typeof onPress === "function";
            const rawActionProps = isObject ? (content as any).actionProps : undefined;
            const actionProps = rawActionProps
              ? {
                  ...rawActionProps,
                  onPress: (event: unknown) => {
                    try {
                      rawActionProps.onPress?.(event);
                    } finally {
                      heroToast.close(toastItem.key);
                    }
                  },
                }
              : undefined;
            const isToastPressable = hasOnPress && !actionProps;
            const actionLabel = getToastActionLabel(actionProps);
            const isCopyAction = actionLabel?.toLowerCase().startsWith("copy") ?? false;

            return (
              <Toast
                toast={toastItem}
                variant={variant}
                className={`lc-toast relative w-[min(24rem,calc(100vw-2rem))] border border-border/40 ${isToastPressable ? "cursor-pointer" : ""}`}
              >
                {isToastPressable ? (
                  <div
                    className="flex w-full items-start gap-3 p-3"
                    onClick={onPress}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onPress();
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <Toast.Indicator variant={variant} />
                      <Toast.Content className={`${toastContentClassName} pr-8`}>
                        {title && (
                          <Toast.Title className={toastTitleClassName}>{title}</Toast.Title>
                        )}
                        {description && (
                          <Toast.Description className={toastDescriptionClassName}>
                            {description}
                          </Toast.Description>
                        )}
                      </Toast.Content>
                    </div>
                  </div>
                ) : (
                  <div className="flex w-full flex-col gap-3 p-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <Toast.Indicator variant={variant} />
                      <Toast.Content
                        className={`${toastContentClassName} pr-8 ${isCopyAction ? "pb-8" : ""}`}
                      >
                        {title && (
                          <Toast.Title className={toastTitleClassName}>{title}</Toast.Title>
                        )}
                        {description && (
                          <Toast.Description className={toastDescriptionClassName}>
                            {description}
                          </Toast.Description>
                        )}
                      </Toast.Content>
                    </div>
                    <ToastAction
                      actionProps={actionProps}
                      actionLabel={actionLabel}
                      isCopyAction={isCopyAction}
                    />
                  </div>
                )}
                <Toast.CloseButton className="absolute top-3 right-3" />
              </Toast>
            );
          }}
        </Toast.Provider>
        {children}
      </AppearanceContext.Provider>
    </I18nProvider>
  );
}
