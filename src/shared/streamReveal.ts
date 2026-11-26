export const INITIAL_STREAM_REVEAL_RATE = 60;

const MIN_CHARS_PER_SECOND = 25;
const MAX_CHARS_PER_SECOND = 2_500;
const DRAIN_WINDOW_SECONDS = 0.24;
const VELOCITY_LERP = 0.15;
const ARRIVAL_RATE_ALPHA = 0.35;

export function streamArrivalRate(previous: number, chars: number, elapsedSeconds: number) {
  if (elapsedSeconds <= 0.005 || elapsedSeconds >= 2) return previous;
  return Math.min(
    MAX_CHARS_PER_SECOND,
    Math.max(
      MIN_CHARS_PER_SECOND,
      previous * (1 - ARRIVAL_RATE_ALPHA) + (chars / elapsedSeconds) * ARRIVAL_RATE_ALPHA,
    ),
  );
}

export function streamRevealVelocity(velocity: number, arrivalRate: number, backlog: number) {
  const next =
    backlog > 0
      ? Math.min(MAX_CHARS_PER_SECOND, Math.max(arrivalRate, backlog / DRAIN_WINDOW_SECONDS))
      : 0;
  return velocity + (next - velocity) * VELOCITY_LERP;
}
