export interface RateLimitPromptInfo {
  suggestedModel: string;
  options: Array<{ index: number; label: string; description: string }>;
}

// Bulletproof rate limit prompt detection
// - Case-insensitive matching
// - Handles various whitespace and formatting
// - Handles different cursor prefixes (>, ❯, →, etc.)
// - Robust option parsing

const HEADER_RE = /approaching\s+rate\s+limits/i;
const MODEL_RE = /switch\s+to\s+(\S+)/i;
// Match numbered options regardless of prefix (>, ❯, →, spaces, cursor artifacts).
// \W* consumes any non-word prefix so word-starting lines (e.g. "Switch to gpt-5.1...")
// won't false-match on the embedded "5." digit.
const OPTION_RE = /^\W*[1-9]\.\s+(.+)/;

/**
 * Detect a Codex TUI "Approaching rate limits" interactive prompt from
 * ANSI-stripped PTY output. Returns structured info when the prompt is
 * present, or `null` otherwise.
 *
 * Bulletproof against:
 * - Case variations
 * - Different cursor prefixes (>, ❯, →, etc.)
 * - Extra whitespace and formatting
 * - Partial matches across chunks
 */
export function detectRateLimitPrompt(text: string): RateLimitPromptInfo | null {
  if (!HEADER_RE.test(text)) {
    return null;
  }

  const modelMatch = MODEL_RE.exec(text);
  if (!modelMatch) {
    return null;
  }

  const suggestedModel = modelMatch[1]!;
  const lines = text.split("\n");
  const options: RateLimitPromptInfo["options"] = [];

  for (const line of lines) {
    const optionMatch = OPTION_RE.exec(line);
    if (!optionMatch) {
      continue;
    }

    // The raw match is e.g. "Switch to gpt-5.1-codex-mini       Optimized for codex. ..."
    // Split label from description by finding a gap of 2+ spaces.
    const raw = optionMatch[1]!.trim();
    const gapIndex = raw.search(/\s{2,}/);
    const label = gapIndex > 0 ? raw.slice(0, gapIndex).trim() : raw;
    const description = gapIndex > 0 ? raw.slice(gapIndex).trim() : "";

    options.push({ index: options.length, label, description });
  }

  if (options.length === 0) {
    return null;
  }

  return { suggestedModel, options };
}
