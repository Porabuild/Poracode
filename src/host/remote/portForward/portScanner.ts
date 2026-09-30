import { request as httpRequest } from "node:http";
import type { DetectedPort } from "@/shared/remote";
import { probeLoopbackPort } from "./loopback";

/**
 * Curated dev-server ports probed by {@link scanPorts}, plus a framework guess
 * for well-known ones (see {@link PORT_LABELS}). Deliberately excludes
 * database ports (e.g. 5432 Postgres) — this is a discovery aid for local dev
 * *servers*, not a general port scanner.
 */
export const DEFAULT_PORT_FORWARD_CANDIDATE_PORTS: readonly number[] = [
  5173, 5174, 3000, 3001, 8081, 4200, 8000, 8080, 4321, 1420, 6006, 5000, 5001, 9000, 8888,
];

const PORT_LABELS: Readonly<Record<number, string>> = {
  5173: "Vite",
  5174: "Vite",
  3000: "Next.js / Node",
  3001: "Next.js / Node",
  8081: "Expo / Metro",
  4200: "Angular",
  8000: "Python",
  8080: "HTTP",
  4321: "Astro",
  1420: "Tauri",
  6006: "Storybook",
};

export const DEFAULT_PORT_PROBE_TIMEOUT_MS = 250;

/** Whether the port speaks enough HTTP to answer a HEAD request (any status
 * counts). Used only to distinguish `protocol: "http"` from `"unknown"` for an
 * already-detected port; never throws. */
function httpProbe(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      const req = httpRequest(
        { host, port, path: "/", method: "HEAD", timeout: timeoutMs },
        (res) => {
          res.resume();
          finish(true);
        },
      );
      req.once("timeout", () => {
        req.destroy();
        finish(false);
      });
      req.once("error", () => finish(false));
      req.end();
    } catch {
      finish(false);
    }
  });
}

/** Probes a single port on either loopback family (see
 * {@link probeLoopbackPort}); returns `null` when nothing accepted a
 * connection on either. */
export async function probePort(port: number, timeoutMs: number): Promise<DetectedPort | null> {
  const host = await probeLoopbackPort(port, timeoutMs);
  if (!host) return null;
  const isHttp = await httpProbe(host, port, timeoutMs);
  const label = PORT_LABELS[port];
  return { port, protocol: isHttp ? "http" : "unknown", ...(label ? { label } : {}) };
}

/** Probes every candidate port concurrently and returns the ones detected,
 * sorted ascending. */
export async function scanPorts(
  candidatePorts: readonly number[],
  timeoutMs: number,
): Promise<DetectedPort[]> {
  const results = await Promise.all(candidatePorts.map((port) => probePort(port, timeoutMs)));
  return results
    .filter((result): result is DetectedPort => result !== null)
    .sort((a, b) => a.port - b.port);
}
