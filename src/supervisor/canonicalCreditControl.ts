import type { SupervisorFlowControl } from "@/shared/ipc";
import type { SupervisorIpcSender } from "./supervisorIpcSender";

type CreditControl = Extract<SupervisorFlowControl, { control: "set-event-backpressure" }>;

/** Preserve the negotiated boot identity on host credit-window controls. */
export function canonicalCreditGrant(
  control: CreditControl,
): Parameters<SupervisorIpcSender["setCanonicalCredit"]>[0] | null {
  if (control.canonicalCreditBytes === undefined) return null;
  return {
    windowBytes: control.canonicalCreditBytes,
    ...(control.canonicalAckSeq !== undefined ? { ackSeq: control.canonicalAckSeq } : {}),
    ...(control.canonicalFlowGeneration !== undefined
      ? { generation: control.canonicalFlowGeneration }
      : {}),
  };
}
