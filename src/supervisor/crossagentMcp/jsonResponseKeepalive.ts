import type { ServerResponse } from "node:http";

export const JSON_KEEPALIVE_INTERVAL_MS = 30_000;

/**
 * Flush headers and legal JSON whitespace while a tool is pending. Fetch clients
 * otherwise hit their headers/body idle limits before an eight-minute wait ends.
 * The response remains one JSON value, with no model-visible progress messages.
 */
export function keepJsonResponseAlive(res: ServerResponse): () => void {
  if (res.destroyed || res.writableEnded) return () => {};
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.write("\n");
  const timer = setInterval(() => {
    if (!res.destroyed && !res.writableEnded) res.write("\n");
  }, JSON_KEEPALIVE_INTERVAL_MS);
  timer.unref();
  const stop = () => {
    clearInterval(timer);
    res.off("close", stop);
  };
  res.once("close", stop);
  return stop;
}
