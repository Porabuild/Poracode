import { useEffect, useRef, useState, type FormEvent, type Key } from "react";
import { createPortal } from "react-dom";
import { Button, Dropdown, Label, Separator } from "@heroui/react";
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
import type { PickerThreadTarget } from "../hooks/useElementPicker";

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
  onChoosePickTarget: (threadId: string) => void;
  onCancelPendingPick: () => void;
  onMenuPreviewChange: (dataUrl: string | null) => void;
}) {
  const { onMenuPreviewChange } = props;
  const { activeTabId, activeTab } = useBrowserPanelStore(
    useShallow((s) => ({
      activeTabId: s.activeTabId,
      activeTab: s.activeTabId ? s.tabs.find((t) => t.tabId === s.activeTabId) : undefined,
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
  const pickerLabel = props.pickerActive ? "Cancel picker" : "Pick element";

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

  return (
    <div className="flex items-center gap-1 border-b border-border bg-[var(--surface)] px-1.5 py-1">
      <button
        type="button"
        className={toolbarButtonClass}
        title="Back"
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
        title="Forward"
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
        title="Reload"
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
          className="h-7 w-full rounded border border-border bg-[var(--field-background)] px-2 text-[12px] text-foreground outline-none placeholder:text-[color:var(--field-placeholder)] focus:border-[color:var(--accent)]"
          placeholder="Search or enter address"
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
                <Dropdown.Menu
                  aria-label="Attach to thread"
                  onAction={(key) => props.onChoosePickTarget(String(key))}
                >
                  {props.pickerTargets.map((target) => (
                    <Dropdown.Item
                      key={target.threadId}
                      id={target.threadId}
                      textValue={target.title}
                    >
                      <Label>{target.title}</Label>
                    </Dropdown.Item>
                  ))}
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
            aria-label="Choose thread to attach to"
            size="sm"
            variant="ghost"
            className={pickerDropdownButtonClass}
          >
            <MousePointerSquareDashed className="size-3.5" />
          </Button>
          <Dropdown.Popover className="z-[1000] min-w-[220px]">
            <Dropdown.Menu
              aria-label="Attach to thread"
              onAction={(key) => props.onChoosePickTarget(String(key))}
            >
              {props.pickerTargets.map((target) => (
                <Dropdown.Item key={target.threadId} id={target.threadId} textValue={target.title}>
                  <Label>{target.title}</Label>
                </Dropdown.Item>
              ))}
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
        title="Console"
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
        title="New tab"
        onClick={props.onCreateTab}
      >
        <Plus className="size-3.5" />
      </button>
      <Dropdown onOpenChange={onMenuOpenChange}>
        <Button
          isIconOnly
          aria-label="Browser menu"
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
            aria-label="Browser menu"
            disabledKeys={["bookmarkBar"]}
            onAction={onMenuAction}
          >
            <Dropdown.Item id="screenshot" textValue="Take Screenshot">
              <Label>Take Screenshot</Label>
            </Dropdown.Item>
            <Dropdown.Item id="hardReload" textValue="Hard Reload">
              <Label>Hard Reload</Label>
            </Dropdown.Item>
            <Dropdown.Item id="copyUrl" textValue="Copy Current URL">
              <Label>Copy Current URL</Label>
            </Dropdown.Item>
            <Separator />
            <Dropdown.Item id="bookmarkBar" textValue="Show Bookmark Bar">
              <Label>Show Bookmark Bar</Label>
              <span className="ml-auto h-4 w-7 rounded-full bg-default after:block after:size-3 after:translate-x-0.5 after:translate-y-0.5 after:rounded-full after:bg-muted" />
            </Dropdown.Item>
            <Separator />
            <Dropdown.Item id="clearHistory" textValue="Clear Browsing History">
              <Label>Clear Browsing History</Label>
            </Dropdown.Item>
            <Dropdown.Item id="clearCookies" textValue="Clear Cookies">
              <Label>Clear Cookies</Label>
            </Dropdown.Item>
            <Dropdown.Item id="clearCache" textValue="Clear Cache">
              <Label>Clear Cache</Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </div>
  );
}
