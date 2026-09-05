import { stripAnsi } from "@/shared/ansi";

const CLIXML_HEADER = "#< CLIXML";

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

/** CLIXML escapes control characters as `_xHHHH_` (e.g. `_x001B_` for ESC). */
function decodeClixmlEscapes(value: string): string {
  return value.replace(/_x([0-9a-f]{4})_/gi, (_, code: string) =>
    String.fromCharCode(parseInt(code, 16)),
  );
}

/**
 * When PowerShell runs with a redirected stderr it serializes its error stream
 * as CLIXML (`#< CLIXML` header followed by `<Objs>…<S S="Error">…</S>`), which
 * is unreadable when surfaced verbatim in an error message. This turns that
 * payload back into the plain text PowerShell would have printed to a console.
 * Text without the CLIXML header is returned unchanged.
 */
export function decodePowerShellClixml(text: string): string {
  const headerIndex = text.indexOf(CLIXML_HEADER);
  if (headerIndex < 0) return text;

  const before = text.slice(0, headerIndex);
  const payload = text.slice(headerIndex + CLIXML_HEADER.length);
  const strings: string[] = [];
  const stringPattern = /<S(?:\s+S="([^"]*)")?>([^<]*)<\/S>/g;
  for (const match of payload.matchAll(stringPattern)) {
    const decoded = stripAnsi(decodeClixmlEscapes(decodeXmlEntities(match[2] ?? "")));
    if (decoded.trim().length > 0) strings.push(decoded.replace(/\r?\n$/, ""));
  }
  if (strings.length === 0) return text;
  return `${before}${strings.join("\n")}`.trim();
}
