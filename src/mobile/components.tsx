import { useCallback, useEffect, useRef, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { Check, ChevronRight, Columns2, Loader2, Rows2, Wifi, WifiOff } from "lucide-react";
import type { ThreadStatus } from "@/shared/contracts";
import { CONNECTION_LABELS, type ConnectionState } from "./useRemoteDesktop";
import { THREAD_STATUS_LABELS, threadStatusTone } from "./presentation";

export function ConnectionPill(props: {
  readonly state: ConnectionState;
  /** Tapping the pill re-syncs with the desktop (replaces a refresh button). */
  readonly onPress?: () => void;
}) {
  const { t } = useLingui();
  const icon =
    props.state === "online" ? (
      <Wifi className="size-3.5" />
    ) : props.state === "pairing" || props.state === "booting" || props.state === "reconnecting" ? (
      <Loader2 className="size-3.5 m-spin" />
    ) : (
      <WifiOff className="size-3.5" />
    );
  return (
    <button
      className="m-connection"
      data-state={props.state}
      type="button"
      // Icon-only now: the state word is dropped from the header (color carries
      // the state), but it stays the accessible name so AT still announces
      // "Live" / "Reconnecting" / "Offline" / "Pair again".
      aria-label={t(CONNECTION_LABELS[props.state])}
      title={t`Sync with desktop`}
      onClick={props.onPress}
    >
      {icon}
    </button>
  );
}

/**
 * Persistent connection banner shown above the routed content whenever the
 * session needs attention: actively reconnecting, offline (serving cached
 * data), pairing-expired, or errored. Stays out of the way when "online".
 */
export function ConnectionBanner(props: {
  readonly state: ConnectionState;
  readonly message?: string;
  readonly onReconnect: () => void;
  readonly onPair?: () => void;
}) {
  const { t } = useLingui();
  if (props.state === "online" || props.state === "booting" || props.state === "pairing") {
    return null;
  }
  const reconnecting = props.state === "reconnecting";
  const unauthorized = props.state === "unauthorized";
  const tone = reconnecting || unauthorized ? "warn" : "danger";
  const text = reconnecting
    ? t`Reconnecting to your desktop…`
    : unauthorized
      ? t`Pairing expired — pair again to reconnect.`
      : props.state === "offline"
        ? t`Offline. Showing the last synced data.`
        : props.message || t`Connection error.`;
  return (
    <div className="m-banner" data-tone={tone} role="status" aria-live="polite">
      <span className="m-banner__icon">
        {reconnecting ? <Loader2 className="size-4 m-spin" /> : <WifiOff className="size-4" />}
      </span>
      <span className="m-banner__text">{text}</span>
      {unauthorized && props.onPair ? (
        <button className="m-banner__action" type="button" onClick={props.onPair}>
          <Trans>Pair again</Trans>
        </button>
      ) : (
        <button className="m-banner__action" type="button" onClick={props.onReconnect}>
          {reconnecting ? t`Retry now` : t`Reconnect`}
        </button>
      )}
    </div>
  );
}

/** Shimmer placeholder block; compose into list/detail loading states. */
export function Skeleton(props: { readonly className?: string }) {
  return (
    <span className={`m-skeleton${props.className ? ` ${props.className}` : ""}`} aria-hidden />
  );
}

export function StatusBadge(props: { readonly status: ThreadStatus }) {
  const { t } = useLingui();
  const tone = threadStatusTone(props.status);
  const label = t(THREAD_STATUS_LABELS[props.status]);
  // A colored dot only — the status word is dropped to free header space for
  // the thread title. The label is kept as the accessible name (role="img")
  // and pointer tooltip so nothing is lost for AT or on hover/long-press.
  return (
    <span className="m-status" data-tone={tone} role="img" aria-label={label} title={label}>
      <span className="m-status__dot" data-tone={tone} />
    </span>
  );
}

/** Tappable list row: icon + label/hint body + trailing chevron. Used by the
 * "More" tab and the mobile settings list. */
export function MoreRow(props: {
  readonly icon: ReactNode;
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly onPress: () => void;
}) {
  return (
    <button type="button" className="m-more-row" onClick={props.onPress}>
      <span className="m-more-row__icon">{props.icon}</span>
      <span className="m-more-row__body">
        <strong>{props.label}</strong>
        {props.hint != null && <span>{props.hint}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted" />
    </button>
  );
}

/** Diff view modes consumed by the renderer's diff components. */
export const DIFF_MODE = { Split: 1, Unified: 4 } as const;

/** Split/Unified diff-mode toggle shared by the git and PR change views. */
export function DiffModeToggle(props: {
  readonly mode: number;
  readonly onChange: (mode: number) => void;
}) {
  const { t } = useLingui();
  return (
    <>
      <button
        type="button"
        className="m-git-head__btn"
        data-active={props.mode === DIFF_MODE.Split || undefined}
        aria-label={t`Split view`}
        onClick={() => props.onChange(DIFF_MODE.Split)}
      >
        <Columns2 className="size-4" />
      </button>
      <button
        type="button"
        className="m-git-head__btn"
        data-active={props.mode === DIFF_MODE.Unified || undefined}
        aria-label={t`Unified view`}
        onClick={() => props.onChange(DIFF_MODE.Unified)}
      >
        <Rows2 className="size-4" />
      </button>
    </>
  );
}

export function EmptyState(props: {
  readonly icon: ReactNode;
  readonly title: ReactNode;
  readonly hint?: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <div className="m-empty">
      <span className="m-empty__icon">{props.icon}</span>
      <strong>{props.title}</strong>
      {props.hint ? <p>{props.hint}</p> : null}
      {props.action}
    </div>
  );
}

/**
 * How long the bottom-sheet slide-out runs before it is unmounted. Must match
 * the `m-sheet-out` animation duration in styles.css; the timer (not
 * `animationend`) drives the unmount so it still fires under reduced motion,
 * where the animation is disabled.
 */
const SHEET_EXIT_MS = 200;

/**
 * Open/close lifecycle for a bottom sheet with an exit animation. `open(target)`
 * shows the sheet for some target value; `close()` plays the slide-out, keeping
 * `target` (and so the sheet) mounted until it finishes, then clears it. Render
 * the sheet whenever `target` is set and forward `closing` to <BottomSheet/>.
 *
 * `target` holds a snapshot of what the sheet acts on (the thread, git file, …)
 * rather than an id, so the exit animation still plays when the action removes
 * that item from the list underneath.
 */
export function useSheet<T>() {
  const [target, setTarget] = useState<T | null>(null);
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useCallback((next: T) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setClosing(false);
    setTarget(next);
  }, []);

  const close = useCallback(() => {
    if (timer.current) return; // an exit is already in flight
    setClosing(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setClosing(false);
      setTarget(null);
    }, SHEET_EXIT_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { target, closing, open, close };
}

/**
 * Shared bottom-sheet chrome: a dimmed, tap-to-dismiss backdrop and the rounded
 * surface. Mounting slides it up; setting `closing` slides it back down — drive
 * both with useSheet. Callers supply the sheet head and body as children.
 */
export function BottomSheet(props: {
  /** Dialog accessible name. */
  readonly label: string;
  /** Scrim (dismiss) accessible name; defaults to "Close". */
  readonly closeLabel?: string;
  readonly closing?: boolean | undefined;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const { t } = useLingui();
  return (
    <div className="m-sheet-backdrop" data-closing={props.closing || undefined}>
      <button
        type="button"
        className="m-sheet-scrim"
        aria-label={props.closeLabel ?? t`Close`}
        onClick={props.onClose}
      />
      <div className="m-sheet" role="dialog" aria-label={props.label}>
        {props.children}
      </div>
    </div>
  );
}

/** One row in a {@link SheetMenu}. */
export interface SheetMenuItem {
  /** Stable id handed back to `onSelect`. */
  readonly id: string;
  readonly label: ReactNode;
  readonly icon?: ReactNode;
  /** Trailing muted text — e.g. a count next to a picker option. */
  readonly hint?: ReactNode;
  /** Marks the current choice in a picker with a trailing check. */
  readonly selected?: boolean;
  /** Tints destructive / cautionary actions. */
  readonly tone?: "warning" | "danger";
  readonly disabled?: boolean;
}

/**
 * A dropdown / select rendered as a bottom drawer — the mobile stand-in for a
 * popover menu. A full-width sheet gives roomy tap targets instead of a popover
 * cramped to the trigger's width, and matches the rest of the phone shell.
 *
 * Render the trigger through `trigger` and call its `open()` from the press
 * handler; the sheet owns its own open/close lifecycle (with the slide-out).
 * Route mobile menus through this rather than hand-rolling popovers.
 */
export function SheetMenu(props: {
  /** Drawer accessible name + heading. */
  readonly label: string;
  /** Scrim (dismiss) accessible name; defaults to "Close". */
  readonly closeLabel?: string;
  readonly items: readonly SheetMenuItem[];
  readonly onSelect: (id: string) => void;
  readonly trigger: (api: { readonly open: () => void; readonly isOpen: boolean }) => ReactNode;
}) {
  const sheet = useSheet<true>();
  const isOpen = sheet.target !== null;
  return (
    <>
      {props.trigger({ open: () => sheet.open(true), isOpen })}
      {sheet.target !== null ? (
        <BottomSheet
          label={props.label}
          {...(props.closeLabel ? { closeLabel: props.closeLabel } : {})}
          closing={sheet.closing}
          onClose={sheet.close}
        >
          <div className="m-sheet-head">
            <span className="truncate">{props.label}</span>
          </div>
          <div className="m-sheet-list">
            {props.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  item.tone === "danger"
                    ? "m-sheet-action text-danger"
                    : item.tone === "warning"
                      ? "m-sheet-action text-warning"
                      : "m-sheet-action"
                }
                disabled={item.disabled || undefined}
                aria-pressed={item.selected || undefined}
                onClick={() => {
                  props.onSelect(item.id);
                  sheet.close();
                }}
              >
                {item.icon}
                <span className="flex-1 truncate">{item.label}</span>
                {item.hint ? (
                  <span className="shrink-0 text-xs text-muted">{item.hint}</span>
                ) : null}
                {item.selected ? <Check className="size-4 shrink-0 text-accent" /> : null}
              </button>
            ))}
          </div>
        </BottomSheet>
      ) : null}
    </>
  );
}
