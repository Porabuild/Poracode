import { useEffect, useRef, useState, type FormEvent, type Key } from "react";
import { createPortal } from "react-dom";
import { Button, Dropdown, Label, Separator } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  ArrowLeft,
  ArrowRight,
  MoreHorizontal,
  MousePointerSquareDashed,
  Plus,
  RotateCw,
  TerminalSquare,
} from "lucide-react";
import { useShallow } from "zustand/shallow";
import { readBridge } from "@/renderer/bridge";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { panelHeaderIconButtonClass } from "@/renderer/components/layout/sidebarChrome";
import type { PickDestination, PickerThreadTarget } from "../hooks/useElementPicker";

const LOCALHOST_PATTERN =
  /^(localhost|(?:\d{1,3}\.){3}\d{1,3}|\[(?:[0-9a-f:]+)\])(?::\d+)?(?:[/?#]|$)/i;

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^[a-z]+:\/\//i.test(trimmed) || trimmed.startsWith("about:")) {
    return trimmed;
  }
  if (LOCALHOST_PATTERN.test(trimmed)) {
    return `http://${trimmed}`;
  }
  if (/\s/.test(trimmed) || !/\./.test(trimmed)) {
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }
  return `https://${trimmed}`;
}

const toolbarButtonClass = `${panelHeaderIconButtonClass} disabled:pointer-events-none disabled:opacity-35`;
const toolbarDropdownButtonClass =
  "size-5 min-w-0 p-0 text-muted hover:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-35 [--button-bg-hover:transparent] [--button-bg-pressed:transparent]";

export function BrowserToolbar(props: {
  onPick: () => void;
  onCreateTab: () => void;
  pickerActive: boolean;
  pickerTargets: PickerThreadTarget[];
  hasPendingPick: boolean;
  pendingPickAnchor: { x: number; y: number } | null;
  onChoosePickTarget: (threadId: string, destination: PickDestination) => void;
  onCancelPendingPick: () => void;
  onMenuPreviewChange: (dataUrl: string | null) => void;
}) {
  const { onMenuPreviewChange } = props;
  const { t } = useLingui();
  const { activeTabId, activeTab } = useBrowserPanelStore(
    useShallow((s) => ({
      activeTabId: s.activeTabId,
      activeTab: s.activeTabId ? s.tabs.find((tab) => tab.tabId === s.activeTabId) : undefined,
    })),
  );
  const [urlInput, setUrlInput] = useState("");
  const [focused, setFocused] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const previewRequestRef = useRef(0);

  useEffect(() => {
    if (!focused) {
      setUrlInput(activeTab?.url ?? "");
    }
  }, [activeTab?.url, focused]);

  const disabled = !activeTab;
  const pickerButtonClass = `${toolbarButtonClass} ${
    props.pickerActive ? "text-foreground hover:text-foreground" : ""
  }`;
  const pickerDropdownButtonClass = `${toolbarDropdownButtonClass} ${
    props.pickerActive ? "text-foreground hover:text-foreground" : ""
  }`;
  const consoleButtonClass = `${toolbarButtonClass} ${
    activeTab?.devToolsOpen ? "text-accent hover:text-accent" : ""
  }`;
  const pickerLabel = props.pickerActive ? t`Cancel picker` : t`Pick element`;

  useEffect(() => {
    return () => onMenuPreviewChange(null);
  }, [onMenuPreviewChange]);

  const onMenuOpenChange = (open: boolean) => {
    if (!open) {
      previewRequestRef.current += 1;
      onMenuPreviewChange(null);
      return;
    }
    if (!activeTabId) return;
    const requestId = ++previewRequestRef.current;
    readBridge()
      .browserCapturePreview({ tabId: activeTabId })
      .then((result) => {
        if (requestId !== previewRequestRef.current) return;
        if (result?.dataUrl) onMenuPreviewChange(result.dataUrl);
      })
      .catch(() => {});
  };

  const onMenuAction = (key: Key) => {
    if (!activeTabId) return;
    previewRequestRef.current += 1;
    onMenuPreviewChange(null);
    const bridge = readBridge();
    if (key === "screenshot") {
      bridge.browserCopyScreenshot({ tabId: activeTabId }).catch(() => {});
    } else if (key === "hardReload") {
      bridge.browserHardReload({ tabId: activeTabId }).catch(() => {});
    } else if (key === "copyUrl") {
      navigator.clipboard.writeText(activeTab?.url ?? "").catch(() => {});
    } else if (key === "clearHistory") {
      bridge.browserClearHistory({ tabId: activeTabId }).catch(() => {});
    } else if (key === "clearCookies") {
      bridge.browserClearCookies({ tabId: activeTabId }).catch(() => {});
    } else if (key === "clearCache") {
      bridge.browserClearCache({ tabId: activeTabId }).catch(() => {});
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!activeTabId) return;
    const url = normalizeUrl(urlInput);
    if (!url) return;
    readBridge()
      .browserNavigate({ tabId: activeTabId, url })
      .catch(() => {});
  };

  // CLI targets offer Terminal vs Composer; everything else only has a
  // composer. The destination is encoded into the menu key as
  // `<destination>:<threadId>` and split on the first colon (thread ids such as
  // `draft:<projectId>` may themselves contain colons).
  const onChoosePickAction = (key: Key) => {
    const raw = String(key);
    const idx = raw.indexOf(":");
    const destination = raw.slice(0, idx) as PickDestination;
    props.onChoosePickTarget(raw.slice(idx + 1), destination);
  };
  const renderPickItems = () =>
    props.pickerTargets.flatMap((target) =>
      target.canRouteToTerminal
        ? [
            <Dropdown.Item
              key={`terminal:${target.threadId}`}
              id={`terminal:${target.threadId}`}
              textValue={t`${target.title} — Terminal`}
            >
              <Label>{target.title}</Label>
              <span className="ml-auto pl-3 text-muted">
                <Trans>Terminal</Trans>
              </span>
            </Dropdown.Item>,
            <Dropdown.Item
              key={`composer:${target.threadId}`}
              id={`composer:${target.threadId}`}
              textValue={t`${target.title} — Composer`}
            >
              <Label>{target.title}</Label>
              <span className="ml-auto pl-3 text-muted">
                <Trans>Composer</Trans>
              </span>
            </Dropdown.Item>,
          ]
        : [
            <Dropdown.Item
              key={`composer:${target.threadId}`}
              id={`composer:${target.threadId}`}
              textValue={target.title}
            >
              <Label>{target.title}</Label>
            </Dropdown.Item>,
          ],
    );

  return (
    <div className="flex items-center gap-1 border-b border-border bg-[var(--content-background)] px-1.5 py-1">
      <button
        type="button"
        className={toolbarButtonClass}
        title={t`Back`}
        disabled={disabled || !activeTab?.canGoBack}
        onClick={() =>
          activeTabId &&
          readBridge()
            .browserBack({ tabId: activeTabId })
            .catch(() => {})
        }
      >
        <ArrowLeft className="size-3.5" />
      </button>
      <button
        type="button"
        className={toolbarButtonClass}
        title={t`Forward`}
        disabled={disabled || !activeTab?.canGoForward}
        onClick={() =>
          activeTabId &&
          readBridge()
            .browserForward({ tabId: activeTabId })
            .catch(() => {})
        }
      >
        <ArrowRight className="size-3.5" />
      </button>
      <button
        type="button"
        className={toolbarButtonClass}
        title={t`Reload`}
        disabled={disabled}
        onClick={() =>
          activeTabId &&
          readBridge()
            .browserReload({ tabId: activeTabId })
            .catch(() => {})
        }
      >
        <RotateCw className="size-3.5" />
      </button>
      <form className="flex-1" onSubmit={onSubmit}>
        <input
          type="text"
          data-lightcode-browser-address=""
          className="h-7 w-full rounded border border-border bg-[var(--field-background)] px-2 text-[12px] text-foreground outline-none placeholder:text-[color:var(--field-placeholder)] focus:border-[color:var(--accent)]"
          placeholder={t`Search or enter address`}
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onFocus={(e) => {
            setFocused(true);
            e.currentTarget.select();
          }}
          onBlur={() => {
            setFocused(false);
            setUrlInput(activeTab?.url ?? "");
          }}
          disabled={disabled}
        />
      </form>
      {props.hasPendingPick && props.pendingPickAnchor ? (
        <>
          <button type="button" className={pickerButtonClass} title={pickerLabel} disabled>
            <MousePointerSquareDashed className="size-3.5" />
          </button>
          {createPortal(
            <Dropdown
              isOpen
              onOpenChange={(open) => {
                if (!open) props.onCancelPendingPick();
              }}
            >
              <Dropdown.Trigger
                className="fixed"
                style={{ left: props.pendingPickAnchor.x, top: props.pendingPickAnchor.y }}
              >
                <div className="size-0" />
              </Dropdown.Trigger>
              <Dropdown.Popover
                placement="bottom start"
                className="z-[1000] min-w-[220px]"
                isNonModal
              >
                <Dropdown.Menu aria-label={t`Attach to thread`} onAction={onChoosePickAction}>
                  {renderPickItems()}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>,
            document.body,
          )}
        </>
      ) : props.hasPendingPick ? (
        <Dropdown
          isOpen
          onOpenChange={(open) => {
            if (!open) props.onCancelPendingPick();
          }}
        >
          <Button
            isIconOnly
            aria-label={t`Choose thread to attach to`}
            size="sm"
            variant="ghost"
            className={pickerDropdownButtonClass}
          >
            <MousePointerSquareDashed className="size-3.5" />
          </Button>
          <Dropdown.Popover className="z-[1000] min-w-[220px]">
            <Dropdown.Menu aria-label={t`Attach to thread`} onAction={onChoosePickAction}>
              {renderPickItems()}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      ) : (
        <button
          type="button"
          className={pickerButtonClass}
          title={pickerLabel}
          disabled={disabled && !props.pickerActive}
          onClick={() => props.onPick()}
        >
          <MousePointerSquareDashed className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        className={consoleButtonClass}
        title={t`Console`}
        disabled={disabled}
        onClick={() =>
          activeTabId &&
          readBridge()
            .browserToggleDevTools({ tabId: activeTabId })
            .catch(() => {})
        }
      >
        <TerminalSquare className="size-3.5" />
      </button>
      <button
        type="button"
        className={toolbarButtonClass}
        title={t`New tab`}
        onClick={props.onCreateTab}
      >
        <Plus className="size-3.5" />
      </button>
      <Dropdown onOpenChange={onMenuOpenChange}>
        <Button
          isIconOnly
          aria-label={t`Browser menu`}
          ref={menuButtonRef}
          size="sm"
          variant="ghost"
          className={toolbarDropdownButtonClass}
          isDisabled={disabled}
        >
          <MoreHorizontal className="size-3.5" />
        </Button>
        <Dropdown.Popover placement="bottom end" className="z-[1000] min-w-[218px]">
          <Dropdown.Menu
            aria-label={t`Browser menu`}
            disabledKeys={["bookmarkBar"]}
            onAction={onMenuAction}
          >
            <Dropdown.Item id="screenshot" textValue={t`Take Screenshot`}>
              <Label>
                <Trans>Take Screenshot</Trans>
              </Label>
            </Dropdown.Item>
            <Dropdown.Item id="hardReload" textValue={t`Hard Reload`}>
              <Label>
                <Trans>Hard Reload</Trans>
              </Label>
            </Dropdown.Item>
            <Dropdown.Item id="copyUrl" textValue={t`Copy Current URL`}>
              <Label>
                <Trans>Copy Current URL</Trans>
              </Label>
            </Dropdown.Item>
            <Separator />
            <Dropdown.Item id="bookmarkBar" textValue={t`Show Bookmark Bar`}>
              <Label>
                <Trans>Show Bookmark Bar</Trans>
              </Label>
              <span className="ml-auto h-4 w-7 rounded-full bg-default after:block after:size-3 after:translate-x-0.5 after:translate-y-0.5 after:rounded-full after:bg-muted" />
            </Dropdown.Item>
            <Separator />
            <Dropdown.Item id="clearHistory" textValue={t`Clear Browsing History`}>
              <Label>
                <Trans>Clear Browsing History</Trans>
              </Label>
            </Dropdown.Item>
            <Dropdown.Item id="clearCookies" textValue={t`Clear Cookies`}>
              <Label>
                <Trans>Clear Cookies</Trans>
              </Label>
            </Dropdown.Item>
            <Dropdown.Item id="clearCache" textValue={t`Clear Cache`}>
              <Label>
                <Trans>Clear Cache</Trans>
              </Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </div>
  );
}
