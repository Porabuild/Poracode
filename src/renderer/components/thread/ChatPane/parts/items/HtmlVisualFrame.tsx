import { useEffect, useRef, useState } from "react";
import {
  HTML_VISUAL_MIN_HEIGHT,
  HTML_VISUAL_THEME_VARIABLES,
  type HtmlVisualTheme,
} from "@/shared/htmlVisuals";
import type { HtmlVisualView } from "@/shared/mcpApps/htmlVisualView";
import { readBridge } from "@/renderer/bridge";
import { useChatPaneActions } from "../../chatPaneActionsContext";

const MONO_FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/** Resolved at the frame, so scoped chat overrides and custom themes carry over. */
function readHtmlVisualTheme(element: Element): HtmlVisualTheme {
  const style = getComputedStyle(element);
  const variables: HtmlVisualTheme["variables"] = {
    "--font-sans": style.fontFamily,
    "--font-mono": MONO_FONT,
  };
  for (const name of HTML_VISUAL_THEME_VARIABLES) {
    const value = style.getPropertyValue(name).trim();
    if (value) variables[name] = value;
  }
  return {
    appearance: document.documentElement.dataset.theme === "light" ? "light" : "dark",
    variables,
  };
}

interface HtmlVisualFrameProps {
  html: string;
  title: string;
  endpoint: string;
  /** Expanded frames fill their container instead of fitting the page height. */
  fill?: boolean;
  onReady?: () => void;
  onUnavailable: () => void;
}

export function HtmlVisualFrame({
  html,
  title,
  endpoint,
  fill = false,
  onReady,
  onUnavailable,
}: HtmlVisualFrameProps) {
  const actions = useChatPaneActions();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const callbacksRef = useRef({ actions, onReady, onUnavailable });
  useEffect(() => {
    callbacksRef.current = { actions, onReady, onUnavailable };
  }, [actions, onReady, onUnavailable]);
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(HTML_VISUAL_MIN_HEIGHT);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const controller = new AbortController();
    let view: HtmlVisualView | undefined;
    const unavailable = () => {
      if (controller.signal.aborted) return;
      controller.abort();
      callbacksRef.current.onUnavailable();
    };
    void import("@/shared/mcpApps/htmlVisualView").then(({ mountHtmlVisual }) => {
      if (controller.signal.aborted) return;
      view = mountHtmlVisual({
        frame,
        endpoint,
        html,
        theme: readHtmlVisualTheme(frame),
        signal: controller.signal,
        openLink: (url) => {
          void readBridge()
            .openExternal(url)
            .catch(() => undefined);
        },
        onReady: () => {
          if (controller.signal.aborted) return;
          setReady(true);
          callbacksRef.current.onReady?.();
        },
        onHeight: (next) => {
          if (controller.signal.aborted) return;
          setHeight(next);
          callbacksRef.current.actions?.onContentHeightChange?.();
        },
        onUnavailable: unavailable,
      });
    }, unavailable);
    const theme = new MutationObserver(() => view?.setTheme(readHtmlVisualTheme(frame)));
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme", "data-theme-preset"],
    });
    return () => {
      controller.abort();
      theme.disconnect();
      frame.removeAttribute("src");
      frame.removeAttribute("srcdoc");
    };
  }, [endpoint, html]);

  return (
    <iframe
      ref={frameRef}
      title={title}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      inert={!ready}
      className={`block w-full border-0 transition-opacity ${ready ? "opacity-100" : "opacity-0"} ${fill ? "min-h-0 flex-1" : ""}`}
      style={fill ? undefined : { height }}
    />
  );
}
