import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";
import type { Plugin } from "@opencode/plugin/tui";
import { formatElapsed } from "../desktop/presentation";
import { turnStartedAt } from "./transcript/items";

/** Pause accounting for the live "Working for" clock, mirroring the desktop's LiveWorkingFor. */
export interface WorkingForClock {
  readonly now: number;
  readonly pausedMs: number;
  readonly pausedSince: number | undefined;
  readonly wasPending: boolean;
}

/** A new run starts with a clean slate: no carried-over pauses, clock re-anchored. */
export function workingForClockReset(now: number, pending: boolean): WorkingForClock {
  return {
    now,
    pausedMs: 0,
    pausedSince: pending ? now : undefined,
    wasPending: pending,
  };
}

/** One tick: a pending request freezes the clock, resolving it banks the paused span. */
export function workingForClockTick(
  clock: WorkingForClock,
  now: number,
  pending: boolean,
): WorkingForClock {
  let pausedMs = clock.pausedMs;
  let pausedSince = clock.pausedSince;
  if (pending && !clock.wasPending) pausedSince = now;
  else if (!pending && clock.wasPending && pausedSince !== undefined) {
    pausedMs += Math.max(0, now - pausedSince);
    pausedSince = undefined;
  }
  return { now, pausedMs, pausedSince, wasPending: pending };
}

/** Elapsed whole seconds for the footer; undefined while the turn start is unknown. */
export function workingForElapsedSeconds(
  clock: Pick<WorkingForClock, "now" | "pausedMs" | "pausedSince">,
  startedAt: number | undefined,
): number | undefined {
  if (startedAt === undefined) return undefined;
  const currentPause =
    clock.pausedSince === undefined ? 0 : Math.max(0, clock.now - clock.pausedSince);
  return Math.max(0, Math.floor((clock.now - startedAt - clock.pausedMs - currentPause) / 1000));
}

/**
 * The desktop `LiveWorkingFor` label in the prompt footer: `Working…` under a
 * second, then `Working for <elapsed>` while the session runs. The clock
 * freezes while a permission or form waits on the user, matching the desktop's
 * paused-interval accounting.
 */
export function WorkingForStatus(props: { context: Plugin.Context; sessionID: string }) {
  const theme = () => props.context.theme;
  const [clock, setClock] = createSignal<WorkingForClock>({
    now: 0,
    pausedMs: 0,
    pausedSince: undefined,
    wasPending: false,
  });
  const running = () => props.context.data.session.status(props.sessionID) === "running";
  const pending = () =>
    (props.context.data.session.permission.list(props.sessionID)?.length ?? 0) > 0 ||
    (props.context.data.session.form.list(props.sessionID)?.length ?? 0) > 0;

  // All clock reads stay inside the effect/tick so render stays pure. A run
  // starting resets pause accounting — pauses belong to their own turn.
  let wasRunning = false;
  createEffect(() => {
    const active = running();
    // oxlint-disable-next-line react/purity -- a Solid effect may read the clock; this is not a React render.
    if (active && !wasRunning) setClock(workingForClockReset(Date.now(), pending()));
    wasRunning = active;
    if (!active) return;
    const timer = setInterval(() => {
      setClock(workingForClockTick(clock(), Date.now(), pending()));
    }, 1000);
    onCleanup(() => clearInterval(timer));
  });

  // Anchor on the newest message of any type: at the top of a turn that is the
  // user message, so the clock measures this turn rather than the last
  // assistant's.
  const startedAt = createMemo(() => {
    const messages = props.context.data.session.message.list(props.sessionID);
    const last = messages.at(-1);
    return last ? turnStartedAt(messages, last.id) : undefined;
  });
  const text = createMemo(() => {
    if (!running()) return "";
    const elapsed = workingForElapsedSeconds(clock(), startedAt());
    if (elapsed === undefined || elapsed < 1) return "Working…";
    return `Working for ${formatElapsed(elapsed)}`;
  });

  return <Show when={text()}>{(value) => <text fg={theme().text.muted}>{value()}</text>}</Show>;
}
