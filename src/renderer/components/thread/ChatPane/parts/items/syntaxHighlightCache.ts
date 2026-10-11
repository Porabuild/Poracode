const MAX_ENTRIES = 200;
// Account for both the source-bearing key and generated markup as two-byte
// UTF-16 strings. This bounds retained string content, not VM/object overhead.
const MAX_STRING_BYTES = 8 * 1024 * 1024;

/** Document-local, disposable highlight results; no persisted/wire format. */
export class SyntaxHighlightCache {
  private readonly entries = new Map<string, string>();
  private stringBytes = 0;

  constructor(
    private readonly maxEntries = MAX_ENTRIES,
    private readonly maxStringBytes = MAX_STRING_BYTES,
  ) {}

  get(key: string): string | undefined {
    const html = this.entries.get(key);
    if (html !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, html);
    }
    return html;
  }

  set(key: string, html: string): void {
    this.remove(key);
    const bytes = 2 * (key.length + html.length);
    // One large block must not displace the useful working set. It still
    // renders normally; only reuse is declined.
    if (bytes > this.maxStringBytes || this.maxEntries < 1) return;
    while (this.entries.size >= this.maxEntries || this.stringBytes + bytes > this.maxStringBytes) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.remove(oldest);
    }
    this.entries.set(key, html);
    this.stringBytes += bytes;
  }

  private remove(key: string): void {
    const html = this.entries.get(key);
    if (html === undefined) return;
    this.entries.delete(key);
    this.stringBytes -= 2 * (key.length + html.length);
  }
}
