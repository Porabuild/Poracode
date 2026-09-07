import type {
  ComputerUseDeliveryReport,
  ComputerUseInteractiveResult,
  ComputerUseObservation,
  ComputerUsePerformStep,
  ComputerUseWindow,
  ComputerUseWindowState,
} from "./types";

/**
 * Result-shaping rules shared by every tool. Tool results are billed to the
 * agent as tokens, so anything the caller already holds — the window it passed
 * in, a delivery target that only restates that window's id, the same window
 * repeated inside a nested observation — is dropped before the result is
 * serialized. Nothing here is provider- or platform-specific: the rules are
 * expressed as "does this field add information the caller does not have".
 */

/**
 * Window fields an agent acts on. `pid`, `displayName`, and `source` are stable
 * identity metadata that discovery tools already delivered, so a result that
 * only adds those is not worth echoing.
 */
const WINDOW_ECHO_FIELDS = ["app", "id", "title", "x", "y", "width", "height"] as const;

function isMinimized(window: ComputerUseWindow): boolean {
  return window.minimized === true;
}

/**
 * True when `actual` tells the caller nothing it does not already know from
 * `known` — same identity, same title, same geometry, same minimized state.
 */
export function windowAddsNothing(
  known: ComputerUseWindow | null | undefined,
  actual: ComputerUseWindow | null | undefined,
): boolean {
  if (!actual) return true;
  if (!known) return false;
  if (isMinimized(known) !== isMinimized(actual)) return false;
  return WINDOW_ECHO_FIELDS.every((field) => known[field] === actual[field]);
}

/**
 * Whether an interactive result should echo the window it acted on. Discovery
 * and takeover responses (`get_window`, `list_*`, `launch_app`,
 * `activate_window`) are the caller's source of truth for window state and
 * always echo; a plain input action echoes only when the window changed.
 */
export function shouldEchoWindow(
  requested: ComputerUseWindow | null | undefined,
  actual: ComputerUseWindow | null | undefined,
): boolean {
  if (!actual) return false;
  return !windowAddsNothing(requested, actual);
}

/**
 * A delivery target is worth its tokens only when it names the native target.
 * A target that carries no role or name and repeats the window's own id just
 * restates the window the action already identifies.
 */
export function deliveryTargetAddsNothing(
  target: ComputerUseDeliveryReport["target"] | undefined,
  window: ComputerUseWindow | null | undefined,
): boolean {
  if (!target) return true;
  if (target.role !== undefined || target.name !== undefined) return false;
  return window !== null && window !== undefined && target.id === String(window.id);
}

function trimDelivery(
  delivery: ComputerUseDeliveryReport,
  window: ComputerUseWindow | null | undefined,
): Record<string, unknown> {
  if (!deliveryTargetAddsNothing(delivery.target, window)) return { ...delivery };
  const { target: _target, ...rest } = delivery;
  return { ...rest };
}

/**
 * Drops an observation's window when it repeats a window the result already
 * states at the top level (or the one the caller passed in).
 */
export function trimObservation(
  observation: ComputerUseObservation,
  window: ComputerUseWindow | null | undefined,
): ComputerUseObservation {
  if (!observation.ok) return observation;
  if (!windowAddsNothing(window, observation.state.window)) return observation;
  const { window: _window, ...state } = observation.state;
  return { ok: true, state: state as ComputerUseWindowState };
}

export interface TrimInteractiveOptions {
  /** Window the caller supplied with the request, if any. */
  requestedWindow?: ComputerUseWindow | null;
  /** Discovery/takeover responses always echo the window they resolved. */
  alwaysEchoWindow?: boolean;
}

/**
 * Emits an interactive result with the redundant window echo, delivery target,
 * and nested observation window removed.
 */
export function trimInteractiveResult(
  result: ComputerUseInteractiveResult,
  options: TrimInteractiveOptions = {},
): Record<string, unknown> {
  const { window, ...rest } = result;
  const known = window ?? options.requestedWindow ?? undefined;
  const echo =
    options.alwaysEchoWindow === true
      ? window !== undefined
      : shouldEchoWindow(options.requestedWindow, window);
  const trimmed: Record<string, unknown> = {
    ...rest,
    ...(echo && window ? { window } : {}),
  };
  if (result.ok) {
    trimmed.delivery = trimDelivery(result.delivery, known);
    if (result.observation) {
      trimmed.observation = trimObservation(result.observation, known);
    }
  }
  return trimmed;
}

export interface PerformStepRecord {
  action: ComputerUsePerformStep["action"];
  index: number;
  result: ComputerUseInteractiveResult;
}

export interface PerformBatch {
  ok: boolean;
  mode: "batch";
  window: ComputerUseWindow;
  steps: PerformStepRecord[];
  failed?: Record<string, unknown>;
  observation?: ComputerUseObservation;
}

/**
 * Emits a batch result with the window stated once at the top level. Step
 * entries keep only what differs between steps: position, action, outcome, and
 * the delivery or refusal detail.
 */
export function trimPerformResult(batch: PerformBatch): Record<string, unknown> {
  const trimmed: Record<string, unknown> = {
    ok: batch.ok,
    mode: batch.mode,
    window: batch.window,
    steps: batch.steps.map(({ index, action, result }) => ({
      index,
      action,
      ok: result.ok,
      ...(result.ok
        ? { delivery: trimDelivery(result.delivery, result.window ?? batch.window) }
        : { refused: result.refused }),
    })),
  };
  if (batch.failed) trimmed.failed = batch.failed;
  if (batch.observation) trimmed.observation = trimObservation(batch.observation, batch.window);
  return trimmed;
}

/**
 * Capture backends describe a downscale in prose meant for a human log. The
 * screenshot metadata already carries the pixel dimensions, so only the
 * conversion rule and the scale factor need to reach the agent.
 */
const DOWNSCALE_NOTE_PATTERN =
  /^Screenshot (?:was downscaled|is)\b.*DIVIDE it by ([0-9]*\.?[0-9]+)/u;

export function compactScreenshotNote(note: string): string {
  const scale = DOWNSCALE_NOTE_PATTERN.exec(note)?.[1];
  if (!scale) return note;
  return `Screenshot downscaled: divide screenshot x/y by ${scale} for window coordinates.`;
}

export function compactStateNotes(notes: readonly string[] | undefined): string[] | undefined {
  return notes?.map(compactScreenshotNote);
}
