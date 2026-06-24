/** Strip the `http(s)://` scheme and a leading `www.` from a URL, for display. */
export function stripScheme(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "");
}
