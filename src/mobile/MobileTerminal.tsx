import { useCallback } from "react";
import { XTermSurface } from "@/renderer/components/terminal/XTermSurface";
import { watchTerminal } from "./terminalFeed";

/**
 * Live terminal surface for the PWA: the reused desktop {@link XTermSurface}
 * driven by the WebSocket terminal feed instead of local supervisor IPC. Works
 * for both a CLI thread's PTY and a standalone dev shell — `terminalId` is the
 * thread id or the `shell:…` id respectively. Input (keystrokes/resize) already
 * flows back through the shimmed bridge to the paired desktop.
 */
export function MobileTerminal(props: {
  readonly terminalId: string;
  /** Scrollback to hydrate with (a CLI thread snapshot; "" for a fresh shell). */
  readonly initialScrollback: string;
  readonly readOnly?: boolean;
  readonly className?: string;
  readonly onExited?: (exitCode: number | null) => void;
}) {
  const { terminalId } = props;
  const outputSource = useCallback(
    (listener: {
      onOutput: (data: string) => void;
      onReset: () => void;
      onExited: (exitCode: number | null) => void;
    }) => watchTerminal(terminalId, listener),
    [terminalId],
  );

  return (
    <XTermSurface
      terminalId={terminalId}
      outputSource={outputSource}
      initialScrollback={props.initialScrollback}
      readOnly={props.readOnly ?? false}
      {...(props.className ? { className: props.className } : {})}
      {...(props.onExited ? { onExited: props.onExited } : {})}
    />
  );
}
