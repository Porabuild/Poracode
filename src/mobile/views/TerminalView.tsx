import { useEffect, useRef, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { AlertTriangle, ChevronLeft, Terminal } from "lucide-react";
import type { ProjectLocation } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import type { XTermSurfaceHandle } from "@/renderer/components/terminal/XTermSurface";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { normalizeShellScript } from "@/renderer/utils/shellUtils";
import { MobileTerminal } from "../MobileTerminal";
import { TerminalAccessory } from "../TerminalAccessory";

/**
 * Fullscreen dev terminal for the PWA: spawns a shell on the paired desktop in
 * a project (or worktree) directory and drives the reused XTermSurface over the
 * live terminal feed. One shell per mount — closed on unmount so PTYs don't
 * leak when the user backs out.
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
  // The id keys both the supervisor PTY and the output feed subscription.
  const [shellId, setShellId] = useState(() => `shell:${crypto.randomUUID()}`);
  const [exitCode, setExitCode] = useState<number | null | undefined>(undefined);
  const [startError, setStartError] = useState<string | null>(null);
  const terminalRef = useRef<XTermSurfaceHandle | null>(null);
  const terminalPanelFontSize = useSharedSettings((state) => state.terminalPanelFontSize);

  useEffect(() => {
    const bridge = readBridge();
    let cancelled = false;
    setStartError(null);
    void (async () => {
      await bridge.startShell({
        shellId,
        projectLocation,
        ...(worktreePath ? { worktreePath } : {}),
        initialSize: { cols: 80, rows: 24 },
      });
      const command = initialCommand ? normalizeShellScript(initialCommand) : "";
      if (command) {
        await bridge.writeTerminal({ threadId: shellId, data: `${command}\r` });
      }
    })().catch((error: unknown) => {
      if (!cancelled) setStartError(friendlyError(error));
    });
    return () => {
      cancelled = true;
      void bridge.closeThread({ threadId: shellId }).catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one shell per mount
  }, [shellId]);

  function reloadTerminal(): void {
    setExitCode(undefined);
    setStartError(null);
    setShellId(`shell:${crypto.randomUUID()}`);
  }

  return (
    <section className="m-git-overlay">
      <header className="m-git-head">
        <button className="m-back" type="button" aria-label={t`Back`} onClick={onClose}>
          <ChevronLeft className="size-5" />
        </button>
        <span className="m-git-head__title">
          <Terminal className="size-3.5 shrink-0 text-muted/60" />
          <span className="m-git-head__branch">{props.title}</span>
          {exitCode !== undefined ? (
            <span className="shrink-0 text-xs text-muted/70">
              {exitCode === null ? t`exited` : t`exited (${exitCode})`}
            </span>
          ) : null}
        </span>
      </header>
      <div className="m-terminal-panel">
        {startError ? (
          <div className="m-terminal-error" role="alert">
            <AlertTriangle className="size-4 shrink-0 text-danger" />
            <span className="m-terminal-error__body">
              <strong>
                <Trans>Unable to start terminal</Trans>
              </strong>
              <span>{startError}</span>
            </span>
            <button type="button" className="m-terminal-error__retry" onClick={reloadTerminal}>
              <Trans>Retry</Trans>
            </button>
          </div>
        ) : null}
        <div className="m-terminal-live m-terminal-live--full">
          <MobileTerminal
            ref={terminalRef}
            key={shellId}
            terminalId={shellId}
            initialScrollback=""
            baseFontSize={terminalPanelFontSize}
            onExited={setExitCode}
          />
        </div>
        <TerminalAccessory terminalId={shellId} onReload={reloadTerminal} />
      </div>
    </section>
  );
}
