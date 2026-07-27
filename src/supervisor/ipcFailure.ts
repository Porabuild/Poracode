import type { SupervisorReply } from "@/shared/ipc";
import { captureSupervisorIpcFailure } from "./diagnostics/sentry";

type CaptureSupervisorIpcFailure = (error: unknown, operation: string) => void;

export function handleSupervisorIpcFailure(
  error: unknown,
  operation: string,
  replyTo: string,
  capture: CaptureSupervisorIpcFailure = captureSupervisorIpcFailure,
): SupervisorReply {
  capture(error, operation);
  return {
    replyTo,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
}
