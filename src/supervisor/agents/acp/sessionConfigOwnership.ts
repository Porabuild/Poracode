import { msg } from "@/shared/messages";

export interface AcpConfigApplicationOwner {
  readonly sessionId: string | undefined;
  readonly generation: number;
  readonly disposed: boolean;
  readonly transportClosed: boolean;
}

export class AcpConfigApplicationRetiredError extends Error {
  constructor() {
    super(msg("thread.configSelectionRejected"));
    this.name = "AcpConfigApplicationRetiredError";
  }
}

/** Capture before queuing a config push; the same native id may belong to a newer incarnation. */
export function captureAcpConfigApplicationOwner(
  getOwner: () => AcpConfigApplicationOwner,
): () => void {
  const owner = { ...getOwner() };
  return () => {
    const current = getOwner();
    if (
      !owner.sessionId ||
      owner.disposed ||
      owner.transportClosed ||
      current.sessionId !== owner.sessionId ||
      current.generation !== owner.generation ||
      current.disposed ||
      current.transportClosed
    ) {
      throw new AcpConfigApplicationRetiredError();
    }
  };
}
