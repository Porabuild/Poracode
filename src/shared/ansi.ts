// OSC (`]…` terminated by BEL/ST) must be the first alternative: the
// single-char C1 class `[@-Z\\-_]` spans 0x5C-0x5F and so includes `]` (0x5D),
// which would otherwise consume just `]` and leave the OSC body (e.g. a
// `]0;title` window-title sequence) un-stripped.
const ANSI_PATTERN =
  // eslint-disable-next-line no-control-regex
  /\u001B(?:\][^\u0007]*(?:\u0007|\u001B\\)|[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

/** Cap CUF→spaces so hostile or buggy PTY output cannot force huge allocations. */
const MAX_CUF_SPACES = 8192;

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}

/**
 * Strip ANSI sequences while preserving the spatial layout implied by
 * cursor-positioning escapes.  TUI-style programs (e.g. Codex CLI) render
 * their first frame using CUP (`\x1b[row;colH`) and CUF (`\x1b[nC`)
 * instead of real newlines and spaces.  Plain `stripAnsi` removes those
 * sequences and collapses the text into a garbled blob.  This variant
 * first translates CUP → newline and CUF → spaces so the resulting
 * plain text retains approximate line structure that heuristic parsers
 * (e.g. interaction-hint detection) can work with.
 */
export function stripAnsiPreservingLayout(value: string): string {
  if (value.length === 0) {
    return "";
  }
  /** Hot path: most subprocess logs are plain text — skip regex work entirely. */
  if (value.indexOf("\u001B") < 0) {
    return value;
  }
  // CUP (Cursor Position) → newline  — each positioned write is a new line
  // eslint-disable-next-line no-control-regex
  let result = value.replace(/\u001B\[\d*(?:;\d*)*[Hf]/g, "\n");
  // CUF (Cursor Forward n) → equivalent spaces
  // eslint-disable-next-line no-control-regex
  result = result.replace(/\u001B\[(\d*)C/g, (_, n) => {
    const k = Math.min(MAX_CUF_SPACES, Number(n) || 1);
    return " ".repeat(k);
  });
  // Strip all remaining ANSI sequences (SGR colours, CUU/CUD/CUB, etc.)
  return stripAnsi(result);
}

export function takeTail(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(value.length - maxLength);
}
