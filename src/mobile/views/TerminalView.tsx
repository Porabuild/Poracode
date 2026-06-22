import { useEffect, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { ChevronLeft, Terminal } from "lucide-react";
import type { ProjectLocation } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { MobileTerminal } from "../MobileTerminal";

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
  readonly onClose: () => void;
}) {
  const { projectLocation, worktreePath, onClose } = props;
  const { t } = useLingui();
  // The id keys both the supervisor PTY and the output feed subscription.
  const [shellId] = useState(() => `shell:${crypto.randomUUID()}`);
  const [exitCode, setExitCode] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    void readBridge()
      .startShell({
        shellId,
        projectLocation,
        ...(worktreePath ? { worktreePath } : {}),
        initialSize: { cols: 80, rows: 24 },
      })
      .catch(() => undefined);
    return () => {
      void readBridge()
        .closeThread({ threadId: shellId })
        .catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one shell per mount
  }, [shellId]);

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
      <div className="m-terminal-live m-terminal-live--full">
        <MobileTerminal terminalId={shellId} initialScrollback="" onExited={setExitCode} />
      </div>
    </section>
  );
}
