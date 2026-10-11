import { TYPED_EXIT_CODES } from "./constants.mjs";

// ── Typed errors ────────────────────────────────────────────────────────────

export class LabError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "LabError";
    this.code = code;
  }
}

export class UsageError extends LabError {
  constructor(message) {
    super(TYPED_EXIT_CODES.USAGE, message);
    this.name = "UsageError";
  }
}

export class SubprocessError extends Error {
  constructor(label, code, stderrTail) {
    super(`subprocess failed: ${label} (exit ${code})${stderrTail ? `: ${stderrTail}` : ""}`);
    this.name = "SubprocessError";
    this.label = label;
    this.code = code;
    this.stderrTail = stderrTail;
  }
}
