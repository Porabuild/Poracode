/**
 * Slash gestures the MSP host implements as session commands rather than as
 * turn input. `session/compact` is the only one `muse serve` exposes (verified
 * against `muse` 1.0.3): there is no command-listing method and no goal API,
 * so every other TUI built-in has to stay out of the GUI command list.
 */

/** Whether a submitted prompt is the bare `/compact` gesture. */
export function isMuseCompactCommand(prompt: string): boolean {
  return prompt.trim().toLowerCase() === "/compact";
}
