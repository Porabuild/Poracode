import type { RenderProcessGoneDetails } from "electron";

export type RendererProcessGoneIntent = "app-shutdown" | "reload" | "window-close";

export type RendererProcessGoneDiagnostic = {
  bucket:
    | "abnormal-exit"
    | "crash"
    | "integrity-failure"
    | "launch-failure"
    | "memory-pressure"
    | "unexpected-kill"
    | "unknown";
  fingerprint: string[];
};

export function classifyRendererProcessGone(
  details: Pick<RenderProcessGoneDetails, "reason">,
  platform: NodeJS.Platform,
  intent?: RendererProcessGoneIntent,
): RendererProcessGoneDiagnostic | null {
  if (details.reason === "clean-exit") return null;
  if (details.reason === "killed" && intent) return null;

  const bucket = (() => {
    switch (details.reason) {
      case "abnormal-exit":
        return "abnormal-exit";
      case "crashed":
        return "crash";
      case "integrity-failure":
        return "integrity-failure";
      case "launch-failed":
        return "launch-failure";
      case "memory-eviction":
      case "oom":
        return "memory-pressure";
      case "killed":
        return "unexpected-kill";
      default:
        return "unknown";
    }
  })();

  return {
    bucket,
    fingerprint: ["poracode-renderer-process-gone", platform, bucket],
  };
}
