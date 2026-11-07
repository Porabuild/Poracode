import { Link, Tooltip } from "@heroui/react";
import { Globe } from "lucide-react";
import { useState, type ReactNode } from "react";
import { GitHubMark } from "@/renderer/components/common/BrandIcons";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import { resolvedChatLinkLabel } from "./chatLinkLabel";
import { useChatLinkMetadata } from "./useChatLinkMetadata";

interface ChatExternalLinkProps {
  href: string;
  children: ReactNode;
  resolveTitle?: boolean;
}

export function ChatExternalLink({ href, children, resolveTitle = false }: ChatExternalLinkProps) {
  const destination = webDestination(href);
  const [previewRequested, setPreviewRequested] = useState(false);
  const metadata = useChatLinkMetadata(
    href,
    destination !== null && (resolveTitle || previewRequested),
  );
  const isGitHub = destination?.hostname.toLowerCase() === "github.com";
  const faviconUrls =
    destination && !isGitHub
      ? [
          new URL("/favicon.ico", destination.origin).href,
          `https://www.google.com/s2/favicons?domain=${encodeURIComponent(destination.host)}&sz=64`,
        ]
      : [];
  const [faviconAttempt, setFaviconAttempt] = useState<{ href: string; index: number } | null>(
    null,
  );
  const faviconIndex = faviconAttempt?.href === href ? faviconAttempt.index : 0;
  const faviconUrl = faviconUrls[faviconIndex];
  const previewTitle = resolvedChatLinkLabel(metadata?.title ?? null, href);

  return (
    <Tooltip delay={350} closeDelay={100}>
      <Tooltip.Trigger
        render={(props) => <span {...props} />}
        className="max-w-full align-baseline"
        tabIndex={-1}
        role="none"
      >
        <Link
          href={href}
          rel="noreferrer noopener"
          className="group inline max-w-full text-[length:inherit] font-normal text-accent no-underline [width:auto] [overflow-wrap:anywhere] [word-break:break-word] hover:underline hover:underline-offset-2"
          onMouseEnter={() => setPreviewRequested(true)}
          onFocus={() => setPreviewRequested(true)}
          onClick={(event) => {
            event.preventDefault();
            openExternalWithFeedback(href);
          }}
        >
          <span className="mr-[0.3em] inline-flex size-[1em] items-center justify-center align-[-0.125em]">
            {isGitHub ? (
              <GitHubMark className="size-full text-foreground" />
            ) : faviconUrl ? (
              <img
                src={faviconUrl}
                alt=""
                className="size-full rounded-[2px] bg-transparent object-contain"
                style={{
                  filter:
                    "drop-shadow(0 0 1px color-mix(in oklab, var(--foreground) 35%, transparent))",
                }}
                loading="lazy"
                draggable={false}
                referrerPolicy="no-referrer"
                onError={() => setFaviconAttempt({ href, index: faviconIndex + 1 })}
              />
            ) : (
              <Globe className="size-full text-accent/70" aria-hidden />
            )}
          </span>
          <span>{resolveTitle ? previewTitle : children}</span>
        </Link>
      </Tooltip.Trigger>
      <Tooltip.Content showArrow placement="top" className="pointer-events-none max-w-xs p-3">
        <Tooltip.Arrow />
        <div className="flex flex-col gap-1.5">
          <div className="text-sm font-medium text-foreground">{previewTitle}</div>
          {metadata?.description ? (
            <div className="line-clamp-3 text-xs leading-snug text-muted">
              {metadata.description}
            </div>
          ) : null}
          <div className="line-clamp-2 break-all text-[11px] leading-snug text-muted/70">
            {href}
          </div>
        </div>
      </Tooltip.Content>
    </Tooltip>
  );
}

function webDestination(href: string): URL | null {
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
