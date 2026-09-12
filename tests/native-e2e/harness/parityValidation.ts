import { LabHttpError } from "./labAuth.ts";
import { parityTapeCaseIds } from "./parityTape.ts";

export type ParityHostId = "primary" | "collision-b";
export type ParityFault = "apply-failure" | "stale-host";

export type ParityAction =
  | { readonly type: "reset"; readonly requestId?: string }
  | {
      readonly type: "emit-tape-case";
      readonly caseId: string;
      readonly hostId?: ParityHostId;
      readonly socketId: string;
      readonly sessionId?: string;
      readonly requestId?: string;
    }
  | {
      readonly type: "set-host-fault";
      readonly fault: ParityFault;
      readonly hostId?: ParityHostId;
      readonly requestId?: string;
    }
  | {
      readonly type: "clear-host-faults";
      readonly hostId?: ParityHostId;
      readonly requestId?: string;
    };

export function parseParityAction(value: unknown): ParityAction {
  if (!isRecord(value) || typeof value.type !== "string") invalidAction();
  const requestId = optionalString(value.requestId, /^[A-Za-z0-9._-]{1,80}$/);
  const hostId = optionalHostId(value.hostId);
  switch (value.type) {
    case "reset":
      return { type: "reset", ...(requestId ? { requestId } : {}) };
    case "emit-tape-case": {
      const caseId = optionalString(value.caseId, /^[A-Za-z0-9._-]{1,96}$/);
      const socketId = optionalString(value.socketId, /^socket-[0-9]{1,12}$/);
      const sessionId = optionalString(value.sessionId, /^session-[0-9]{1,12}$/);
      if (!caseId || !socketId || !parityTapeCaseIds().includes(caseId)) invalidAction();
      return {
        type: value.type,
        caseId,
        socketId,
        ...(hostId ? { hostId } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(requestId ? { requestId } : {}),
      };
    }
    case "set-host-fault":
      if (value.fault !== "apply-failure" && value.fault !== "stale-host") invalidAction();
      return {
        type: value.type,
        fault: value.fault,
        ...(hostId ? { hostId } : {}),
        ...(requestId ? { requestId } : {}),
      };
    case "clear-host-faults":
      return {
        type: value.type,
        ...(hostId ? { hostId } : {}),
        ...(requestId ? { requestId } : {}),
      };
    default:
      invalidAction();
  }
}

function optionalHostId(value: unknown): ParityHostId | undefined {
  if (value === undefined) return undefined;
  if (value !== "primary" && value !== "collision-b") invalidAction();
  return value;
}

function optionalString(value: unknown, pattern: RegExp): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !pattern.test(value)) invalidAction();
  return value;
}

function invalidAction(): never {
  throw new LabHttpError("invalid_parity_action", "Parity action is invalid.", 400);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
