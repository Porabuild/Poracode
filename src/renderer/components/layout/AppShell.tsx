import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";

const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 500;
const SIDEBAR_DEFAULT_WIDTH = 350;
const SIDEBAR_COLLAPSED_WIDTH = 48;

function readStoredNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

interface SidebarContextValue {
  isCollapsed: boolean;
  collapse: () => void;
  expand: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  isCollapsed: false,
  collapse: () => {},
  expand: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export function AppShell(props: { sidebar: ReactNode; content: ReactNode }) {
  const { sidebar, content } = props;

  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readStoredNumber("lightcode-sidebar-width", SIDEBAR_DEFAULT_WIDTH),
  );
  const [isCollapsed, setIsCollapsed] = useState(() =>
    readStoredBoolean("lightcode-sidebar-collapsed", false),
  );
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef({ startX: 0, startWidth: 0 });

  useEffect(() => {
    localStorage.setItem("lightcode-sidebar-width", String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem("lightcode-sidebar-collapsed", String(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    if (!isResizing) return;

    function onMouseMove(e: MouseEvent) {
      const delta = e.clientX - resizeRef.current.startX;
      const next = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, resizeRef.current.startWidth + delta),
      );
      setSidebarWidth(next);
    }

    function onMouseUp() {
      setIsResizing(false);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizing]);

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startWidth: sidebarWidth };
    setIsResizing(true);
  }

  const collapse = () => setIsCollapsed(true);
  const expand = () => setIsCollapsed(false);
  const displayWidth = isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth;

  return (
    <SidebarContext.Provider value={{ isCollapsed, collapse, expand }}>
      <div
        className={`lightcode-shell flex h-full min-h-0 overflow-hidden bg-background text-foreground ${isResizing ? "select-none" : ""}`}
      >
        <div aria-hidden="true" className="lightcode-drag-region" />

        <aside
          className={`relative min-h-0 border-r border-[color:var(--border)] -mt-5 h-[calc(100%+0.75rem)] overflow-hidden ${
            !isResizing ? "transition-[width,min-width] duration-200" : ""
          }`}
          style={{ width: displayWidth, minWidth: displayWidth }}
        >
          {sidebar}
        </aside>

        {!isCollapsed && (
          <div
            className="lightcode-resize-handle -mt-5 h-[calc(100%+0.75rem)]"
            onMouseDown={handleResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
          />
        )}

        <main className="relative h-full min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="relative h-full min-h-0">{content}</div>
        </main>

        {isResizing && <div className="fixed inset-0 z-50 cursor-col-resize" />}
      </div>
    </SidebarContext.Provider>
  );
}
