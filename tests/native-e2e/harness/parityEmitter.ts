import { LabHttpError } from "./labAuth.ts";
import { parityTapeCase } from "./parityTape.ts";
import type { ParityHostId } from "./parityValidation.ts";
import type { WireLab } from "./wireLab.ts";

export interface ParityEmission {
  readonly caseId: string;
  readonly hostId: ParityHostId;
  readonly socketId: string;
  readonly disposition:
    | "ready"
    | "applied"
    | "duplicate"
    | "gap"
    | "resync-required"
    | "out-of-band";
  readonly sequence: number;
  readonly replaySequence: number;
}

export function emitParityCase(
  lab: WireLab,
  hostId: ParityHostId,
  socketId: string,
  sessionId: string | undefined,
  caseId: string,
): ParityEmission {
  const entry = parityTapeCase(caseId);
  const message = entry.message;
  lab.assertSocket(socketId, sessionId);
  const target = { socketId, ...(sessionId ? { sessionId } : {}) };
  if (entry.family !== "sequencing") {
    if (message.type !== "event")
      throw new LabHttpError("invalid_parity_case", "Parity case is not an event.", 400);
    const sequence = lab.publishEvent(message.event as Record<string, unknown>, target);
    return result(entry.id, hostId, socketId, "applied", sequence, lab.ring.seq);
  }

  switch (entry.id) {
    case "ready-does-not-advance": {
      const sequence = lab.ring.seq;
      lab.sendToSocket(socketId, { ...message, seq: sequence }, sessionId);
      return result(entry.id, hostId, socketId, "ready", sequence, lab.ring.seq);
    }
    case "contiguous-one":
    case "contiguous-two":
    case "post-resync-five": {
      const sequence = lab.publishEvent(message.event as Record<string, unknown>, target);
      return result(entry.id, hostId, socketId, "applied", sequence, lab.ring.seq);
    }
    case "duplicate-two": {
      const sequence = lab.ring.seq;
      lab.sendToSocket(socketId, { ...message, seq: sequence }, sessionId);
      return result(entry.id, hostId, socketId, "duplicate", sequence, lab.ring.seq);
    }
    case "gap-four": {
      const sequence = lab.publishEvent(message.event as Record<string, unknown>, {
        ...target,
        skipStore: true,
        sequenceGap: 1,
      });
      return result(entry.id, hostId, socketId, "gap", sequence, lab.ring.seq);
    }
    case "authoritative-resync-four": {
      const sequence = lab.ring.seq;
      lab.sendToSocket(socketId, { ...message, seq: sequence }, sessionId);
      return result(entry.id, hostId, socketId, "resync-required", sequence, lab.ring.seq);
    }
    default: {
      const sequence = lab.ring.seq;
      lab.sendToSocket(socketId, message, sessionId);
      return result(entry.id, hostId, socketId, "out-of-band", sequence, lab.ring.seq);
    }
  }
}

function result(
  caseId: string,
  hostId: ParityHostId,
  socketId: string,
  disposition: ParityEmission["disposition"],
  sequence: number,
  replaySequence: number,
): ParityEmission {
  return { caseId, hostId, socketId, disposition, sequence, replaySequence };
}
