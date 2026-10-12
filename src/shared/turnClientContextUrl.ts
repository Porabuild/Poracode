/**
 * Per-turn page identity only: omit credentials, query and fragment, and reject
 * non-web schemes. Each trust boundary calls this independently; callers own
 * input bounds and presentation escaping.
 */
export function normalizeTurnClientContextUrl(
  value: string,
): { origin: string; pageUrl: string } | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  return { origin: url.origin, pageUrl: `${url.origin}${url.pathname}` };
}
