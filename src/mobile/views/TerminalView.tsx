import { useEffect, useRef, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { AlertTriangle, ChevronLeft, Plus, Terminal, X } from "lucide-react";
import type { CSSProperties } from "react";
import type { ProjectLocation } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import type { XTermSurfaceHandle } from "@/renderer/components/terminal/XTermSurface";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { normalizeShellScript } from "@/renderer/utils/shellUtils";
import { MobileTerminal } from "../MobileTerminal";
import { TerminalAccessory } from "../TerminalAccessory";
import { useKeyboardOffset } from "../useKeyboardOffset";

interface TerminalTab {
  readonly id: string;
  readonly shellId: string;
  readonly title: string;
  readonly initialCommand?: string | undefined;
  readonly startError: string | null;
  readonly exitCode: number | null | undefined;
}

function createTerminalTab(title: string, initialCommand?: string | undefined): TerminalTab {
  const id = crypto.randomUUID();
  return {
    id,
    shellId: `shell:${id}`,
    title,
    ...(initialCommand ? { initialCommand } : {}),
    startError: null,
    exitCode: undefined,
  };
}

function TerminalTabPane(props: {
  readonly tab: TerminalTab;
  readonly active: boolean;
  readonly projectLocation: ProjectLocation;
  readonly worktreePath?: string | undefined;
  readonly baseFontSize: number;
  readonly onStartError: (tabId: string, error: string | null) => void;
  readonly onExited: (tabId: string, exitCode: number | null) => void;
}) {
  const terminalRef = useRef<XTermSurfaceHandle | null>(null);

  useEffect(() => {
    const bridge = readBridge();
    let cancelled = false;
    props.onStartError(props.tab.id, null);
    void (async () => {
      await bridge.startShell({
        shellId: props.tab.shellId,
        projectLocation: props.projectLocation,
        ...(props.worktreePath ? { worktreePath: props.worktreePath } : {}),
        initialSize: { cols: 80, rows: 24 },
      });
      const command = props.tab.initialCommand
        ? normalizeShellScript(props.tab.initialCommand)
        : "";
      if (command) {
        await bridge.writeTerminal({ threadId: props.tab.shellId, data: `${command}\r` });
      }
    })().catch((error: unknown) => {
      if (!cancelled) props.onStartError(props.tab.id, friendlyError(error));
    });
    return () => {
      cancelled = true;
      void bridge.closeThread({ threadId: props.tab.shellId }).catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one shell lifecycle per shell id
  }, [props.tab.shellId]);

  return (
    <div className="m-terminal-tab-pane" data-active={props.active} aria-hidden={!props.active}>
      <MobileTerminal
        ref={terminalRef}
        key={props.tab.shellId}
        terminalId={props.tab.shellId}
        initialScrollback=""
        baseFontSize={props.baseFontSize}
        themeBackgroundVar="--background"
        onExited={(exitCode) => props.onExited(props.tab.id, exitCode)}
      />
    </div>
  );
}

/**
 * Fullscreen dev terminal for the PWA: spawns a shell on the paired desktop in
 * a project (or worktree) directory and drives the reused XTermSurface over the
 * live terminal feed. Tabs keep one PTY each and are closed on tab close or
 * route unmount so shells don't leak when the user backs out.
 */
export function TerminalView(props: {
  readonly title: string;
  readonly projectLocation: ProjectLocation;
  readonly worktreePath?: string | undefined;
  readonly initialCommand?: string | undefined;
  readonly onClose: () => void;
}) {
  const { projectLocation, worktreePath, initialCommand, onClose } = props;
  const { t } = useLingui();
  const [tabs, setTabs] = useState<readonly TerminalTab[]>(() => [
    createTerminalTab(props.title, initialCommand),
  ]);
  const [activeTabId, setActiveTabId] = useState(() => tabs[0]!.id);
  const terminalPanelFontSize = useSharedSettings((state) => state.terminalPanelFontSize);
  const keyboardOffset = useKeyboardOffset();
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]!;

  function updateTab(tabId: string, update: (tab: TerminalTab) => TerminalTab): void {
    setTabs((current) => current.map((tab) => (tab.id === tabId ? update(tab) : tab)));
  }

  function reloadTerminal(): void {
    updateTab(activeTab.id, (tab) => ({
      ...tab,
      shellId: `shell:${crypto.randomUUID()}`,
      startError: null,
      exitCode: undefined,
      initialCommand: undefined,
    }));
  }

  function addTerminal(): void {
    const tab = createTerminalTab(`${props.title} ${tabs.length + 1}`);
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
  }

  function closeTerminalTab(tabId: string): void {
    if (tabs.length === 1) {
      onClose();
      return;
    }
    const index = tabs.findIndex((tab) => tab.id === tabId);
    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    setTabs(nextTabs);
    if (activeTabId === tabId) {
      setActiveTabId(nextTabs[Math.max(0, index - 1)]?.id ?? nextTabs[0]!.id);
    }
  }

  return (
    <section
      className="m-git-overlay"
      style={{ "--m-keyboard-offset": `${keyboardOffset}px` } as CSSProperties}
    >
      <header className="m-git-head">
        <button className="m-back" type="button" aria-label={t`Back`} onClick={onClose}>
          <ChevronLeft className="size-5" />
        </button>
        <span className="m-git-head__title">
          <Terminal className="size-3.5 shrink-0 text-muted/60" />
          <span className="m-git-head__branch">{activeTab.title}</span>
          {activeTab.exitCode !== undefined ? (
            <span className="shrink-0 text-xs text-muted/70">
              {activeTab.exitCode === null ? t`exited` : t`exited (${activeTab.exitCode})`}
            </span>
          ) : null}
        </span>
      </header>
      <div className="m-terminal-panel m-terminal-panel--tabbed">
        {activeTab.startError ? (
          <div className="m-terminal-error" role="alert">
            <AlertTriangle className="size-4 shrink-0 text-danger" />
            <span className="m-terminal-error__body">
              <strong>
                <Trans>Unable to start terminal</Trans>
              </strong>
              <span>{activeTab.startError}</span>
            </span>
            <button type="button" className="m-terminal-error__retry" onClick={reloadTerminal}>
              <Trans>Retry</Trans>
            </button>
          </div>
        ) : null}
        <div className="m-terminal-live m-terminal-live--full">
          {tabs.map((tab) => (
            <TerminalTabPane
              key={tab.id}
              tab={tab}
              active={tab.id === activeTab.id}
              projectLocation={projectLocation}
              {...(worktreePath ? { worktreePath } : {})}
              baseFontSize={terminalPanelFontSize}
              onStartError={(tabId, error) =>
                updateTab(tabId, (current) => ({ ...current, startError: error }))
              }
              onExited={(tabId, exitCode) =>
                updateTab(tabId, (current) => ({ ...current, exitCode }))
              }
            />
          ))}
        </div>
        <div className="m-terminal-bottom-dock">
          <TerminalAccessory terminalId={activeTab.shellId} onReload={reloadTerminal} />
          <div className="m-terminal-tabs" role="tablist">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className="m-terminal-tab"
                data-active={tab.id === activeTab.id || undefined}
              >
                <button
                  className="m-terminal-tab__main"
                  type="button"
                  role="tab"
                  aria-selected={tab.id === activeTab.id}
                  onClick={() => setActiveTabId(tab.id)}
                >
                  <span className="m-terminal-tab__title">{tab.title}</span>
                  {tab.exitCode !== undefined ? (
                    <span className="m-terminal-tab__status">
                      {tab.exitCode === null ? t`exited` : t`exited (${tab.exitCode})`}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="m-terminal-tab__close"
                  aria-label={t`Close`}
                  onClick={() => closeTerminalTab(tab.id)}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            <button
              className="m-terminal-tab m-terminal-tab--add"
              type="button"
              aria-label={t`Open terminal`}
              onClick={addTerminal}
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
