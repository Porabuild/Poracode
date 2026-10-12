/** Reads an exact per-command OSC marker without retaining terminal history.
 * Exit codes must end in BEL or ST; digits in a partial frame are not final. */
export class CommandCompletionParser {
  private readonly pattern: RegExp;
  private readonly carryLimit: number;
  private carry = "";

  constructor(marker: string) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    this.pattern = new RegExp(escaped + String.raw`(-?\d{1,10})(?:\x07|\x1b\\)`, "u");
    // Marker + optional minus + ten exit-code digits + ESC from a split ST.
    this.carryLimit = marker.length + 1 + 10 + 1;
  }

  push(data: string): number | null {
    const text = this.carry + data;
    const match = this.pattern.exec(text);
    this.carry = match ? "" : text.slice(-this.carryLimit);
    return match ? Number(match[1]) : null;
  }

  replace(data: string): number | null {
    this.reset();
    return this.push(data);
  }

  reset(): void {
    this.carry = "";
  }
}
