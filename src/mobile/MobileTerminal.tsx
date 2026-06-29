import { forwardRef, useCallback } from "react";
import { XTermSurface, type XTermSurfaceHandle } from "@/renderer/components/terminal/XTermSurface";
import type { TerminalSize } from "@/shared/contracts";
import { watchTerminal } from "./terminalFeed";

/**
 * Live terminal surface for the PWA: the reused desktop {@link XTermSurface}
 * driven by the WebSocket terminal feed instead of local supervisor IPC. Works
 * for both a CLI thread's PTY and a standalone dev shell — `terminalId` is the
 * thread id or the `shell:…` id respectively. Input (keystrokes/resize) already
 * flows back through the shimmed bridge to the paired desktop.
 */
export const MobileTerminal = forwardRef<
  XTermSurfaceHandle,
  {
    readonly terminalId: string;
    /** Scrollback to hydrate with (a CLI thread snapshot; "" for a fresh shell). */
    readonly initialScrollback: string;
    readonly readOnly?: boolean;
    readonly className?: string;
    readonly baseFontSize?: number;
    readonly onExited?: (exitCode: number | null) => void;
    readonly onTerminalResize?: (size: TerminalSize) => void;
    readonly fixedTerminalSize?: TerminalSize;
    readonly resizeTerminalOnFit?: boolean;
  }
>(function MobileTerminal(props, ref) {
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
      ref={ref}
      terminalId={terminalId}
      outputSource={outputSource}
      initialScrollback={props.initialScrollback}
      preferDomRenderer
      resizeTerminalOnFit={props.resizeTerminalOnFit ?? true}
      suppressTouchKeyboard
      touchScrollEnabled
      readOnly={props.readOnly ?? false}
      {...(props.baseFontSize ? { baseFontSize: props.baseFontSize } : {})}
      {...(props.fixedTerminalSize ? { fixedTerminalSize: props.fixedTerminalSize } : {})}
      {...(props.className ? { className: props.className } : {})}
      {...(props.onExited ? { onExited: props.onExited } : {})}
      {...(props.onTerminalResize ? { onTerminalResize: props.onTerminalResize } : {})}
    />
  );
});
