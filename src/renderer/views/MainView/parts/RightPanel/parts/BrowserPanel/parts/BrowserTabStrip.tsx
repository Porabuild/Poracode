import { Globe, X } from "lucide-react";
import { useState } from "react";
import { readBridge } from "@/renderer/bridge";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";

function TabFavicon(props: { faviconUrl?: string; loading: boolean }) {
  if (props.loading) {
    return (
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        <span className="size-2 animate-pulse rounded-full bg-accent/70" />
      </span>
    );
  }
  if (props.faviconUrl) {
    return (
      <img
        src={props.faviconUrl}
        alt=""
        className="size-3.5 shrink-0 rounded-[2px]"
        loading="lazy"
        draggable={false}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  return <Globe className="size-3.5 shrink-0 text-foreground/50" />;
}

export function BrowserTabStrip() {
  const tabs = useBrowserPanelStore((s) => s.tabs);
  const activeTabId = useBrowserPanelStore((s) => s.activeTabId);
  const attentionTabId = useBrowserPanelStore((s) => s.attentionTabId);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-[var(--surface)] px-1 py-1">
      {tabs.map((tab) => {
        const active = tab.tabId === activeTabId;
        const attention = !active && tab.tabId === attentionTabId;
        const activate = () => {
          if (!active) {
            readBridge()
              .browserActivateTab({ tabId: tab.tabId })
              .catch(() => {});
          }
        };
        return (
          <div
            key={tab.tabId}
            role="button"
            tabIndex={0}
            draggable
            className={`group flex max-w-[180px] min-w-[80px] cursor-pointer items-center gap-1 rounded px-2 py-1 text-left text-[12px] ${
              active
                ? "bg-[var(--surface-tertiary)] font-medium text-foreground"
                : "bg-transparent text-foreground/60 hover:bg-[var(--surface-secondary)] hover:text-foreground/80"
            } ${attention ? "ring-1 ring-amber-400/60" : ""} ${draggingTabId === tab.tabId ? "opacity-50" : ""}`}
            onDragStart={(e) => {
              setDraggingTabId(tab.tabId);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", tab.tabId);
            }}
            onDragEnd={() => setDraggingTabId(null)}
            onDragOver={(e) => {
              if (!draggingTabId || draggingTabId === tab.tabId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              const sourceTabId = e.dataTransfer.getData("text/plain") || draggingTabId;
              setDraggingTabId(null);
              if (!sourceTabId || sourceTabId === tab.tabId) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const position = e.clientX > rect.left + rect.width / 2 ? "after" : "before";
              readBridge()
                .browserMoveTab({ tabId: sourceTabId, targetTabId: tab.tabId, position })
                .catch(() => {});
            }}
            onClick={activate}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                activate();
              }
            }}
            title={tab.url}
          >
            <TabFavicon
              loading={tab.loading}
              {...(tab.faviconUrl ? { faviconUrl: tab.faviconUrl } : {})}
            />
            <span className="flex-1 truncate">{tab.title || tab.url || "New tab"}</span>
            <button
              type="button"
              aria-label="Close tab"
              className="invisible flex h-4 w-4 items-center justify-center rounded text-foreground/50 hover:bg-[var(--row-hover)] hover:text-foreground group-hover:visible group-focus-within:visible"
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                readBridge()
                  .browserCloseTab({ tabId: tab.tabId })
                  .catch(() => {});
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  readBridge()
                    .browserCloseTab({ tabId: tab.tabId })
                    .catch(() => {});
                }
              }}
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
