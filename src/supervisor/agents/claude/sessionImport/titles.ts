import { readSuffix } from "@/shared/sessionImport/io";
const CLAUDE_TITLE_TAIL_BYTES = 128 * 1024;
import { stripInjectedContext } from "./text";
const TITLE_MAX_CHARS = 200;
function cleanTitle(raw: string): string | undefined {
  const text = stripInjectedContext(raw).replace(/\s+/gu, " ").trim();
  if (text.length === 0) return undefined;
  return text.length > TITLE_MAX_CHARS ? `${text.slice(0, TITLE_MAX_CHARS)}…` : text;
}

export function readClaudeTitle(path: string): string | undefined {
  const tail = readSuffix(path, CLAUDE_TITLE_TAIL_BYTES);
  if (!tail.includes('"custom-title"')) return undefined;
  const lines = tail.split(/\r?\n/u);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;
    if (!line.includes('"custom-title"')) continue;
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      if (entry["type"] !== "custom-title") continue;
      const title = entry["customTitle"];
      if (typeof title === "string") {
        const cleaned = cleanTitle(title);
        if (cleaned) return cleaned;
      }
    } catch {
      // A cut or corrupt line; keep looking at older records.
    }
  }
  return undefined;
}
