import { useEffect, useRef, useState } from "react";
import { usePlugins } from "@/renderer/state/pluginsStore";
import { readBridge } from "@/renderer/bridge";
import type { PluginArtworkTarget } from "@/shared/contracts/pluginCatalog";
import { Globe, Monitor, Network, TerminalSquare } from "lucide-react";
import appIcon from "../../../../build/icon.png";

/**
 * A plugin's identity mark.
 *
 * The wrapper is the icon box and the only thing callers size. Artwork fills
 * that box and carries a proportional corner radius so an authored square logo
 * reads as an app icon rather than a pasted bitmap; transparent marks keep
 * their own shape. The fallback monogram is sized from the box itself with a
 * container query, so one component renders correctly at 16px in a mention row
 * and at 44px on a detail page without per-call font sizes.
 */
export function PluginIcon(props: {
  pluginId: string;
  className?: string;
  target?: PluginArtworkTarget;
  pluginRoot?: string;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [artwork, setArtwork] = useState<{ key: string; dataUrl: string }>();
  const scope = usePlugins((state) =>
    props.pluginRoot
      ? Object.entries(state.pluginsByScope).find(([, plugins]) =>
          plugins.some(
            (plugin) => plugin.name === props.pluginId && plugin.root === props.pluginRoot,
          ),
        )?.[0]
      : undefined,
  );
  const target = props.target ?? {
    type: "plugin",
    pluginName: props.pluginId,
    ...(scope ? { projectFsPath: scope } : {}),
  };
  const key = JSON.stringify(target);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await readBridge().pluginCatalog({
          action: "artwork",
          version: 1,
          target: JSON.parse(key) as PluginArtworkTarget,
        });
        const dataUrl = result.artwork?.dataUrl;
        if (active && dataUrl?.startsWith("data:image/png;base64,")) setArtwork({ key, dataUrl });
      } catch {
        /* Older hosts reject the optional action; keep the local fallback. */
      }
    };
    const observer =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              observer?.disconnect();
              void load();
            }
          });
    if (observer && anchor.current) observer.observe(anchor.current);
    else void load();
    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [key]);
  const image = artwork?.key === key ? artwork.dataUrl : undefined;
  return (
    <span
      ref={anchor}
      aria-hidden="true"
      style={{ containerType: "size" }}
      className={`${props.className ?? "size-5"} inline-flex shrink-0 items-center justify-center`}
    >
      {image ? (
        <img
          src={image}
          alt=""
          draggable={false}
          decoding="async"
          className="size-full rounded-[15%] object-contain"
          onError={() => setArtwork(undefined)}
        />
      ) : (
        <PluginIconFallback
          pluginId={props.pluginId}
          {...(props.className ? { className: props.className } : {})}
        />
      )}
    </span>
  );
}

function PluginIconFallback(props: { pluginId: string; className?: string }) {
  const className = props.className ?? "size-5";
  switch (props.pluginId) {
    case "app-controls":
      return <img src={appIcon} alt="" className={`${className} rounded-[15%]`} />;
    case "terminal":
      return <TerminalSquare className={className} />;
    case "browser-tools":
      return <Globe className={className} />;
    case "chrome-tools":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="#4285f4">
          <path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728Z" />
        </svg>
      );
    case "computer-use":
      return <Monitor className={className} />;
    case "subagent-delegation":
      return <Network className={className} />;
    case "github":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
        </svg>
      );
    case "outlook":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="#0078d4">
          <path d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.31.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.5V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V10.85l1.24.72h.01q.1.07.18.18.07.12.07.25zm-6-8.25v3h3v-3zm0 4.5v3h3v-3zm0 4.5v1.83l3.05-1.83zm-5.25-9v3h3.75v-3zm0 4.5v3h3.75v-3zm0 4.5v2.03l2.41 1.5 1.34-.8v-2.73zM9 3.75V6h2l.13.01.12.04v-2.3zM5.98 15.98q.9 0 1.6-.3.7-.32 1.19-.86.48-.55.73-1.28.25-.74.25-1.61 0-.83-.25-1.55-.24-.71-.71-1.24t-1.15-.83q-.68-.3-1.55-.3-.92 0-1.64.3-.71.3-1.2.85-.5.54-.75 1.3-.25.74-.25 1.63 0 .85.26 1.56.26.72.74 1.23.48.52 1.17.81.69.3 1.56.3zM7.5 21h12.39L12 16.08V17q0 .41-.3.7-.29.3-.7.3H7.5zm15-.13v-7.24l-5.9 3.54Z" />
        </svg>
      );
    default:
      return (
        <span
          className="inline-flex size-full items-center justify-center font-semibold uppercase leading-none tracking-tight text-foreground/70"
          style={{ fontSize: "42cqi" }}
        >
          {props.pluginId
            .split(/[.-]/u)
            .map((part) => part[0])
            .slice(0, 2)
            .join("")}
        </span>
      );
  }
}
