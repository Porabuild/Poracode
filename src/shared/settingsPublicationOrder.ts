import type { SettingsSnapshot } from "./settingsTransactions";

type Publication = Pick<SettingsSnapshot, "authorityId" | "sequence">;
export interface SettingsSnapshotRequest {
  readonly connection: number;
  readonly id: number;
}
export type SettingsPublicationDecision = "apply" | "ignore" | "resync" | "reconnect";

/** Ordering after schema validation. Capture reset's token in each connection's callbacks; never persist it. */
export class SettingsPublicationOrder {
  private connection = 0;
  private snapshotRequest = 0;
  private awaitingSnapshot = false;
  private current: Publication | undefined;
  private requiredFloor: Publication | undefined;
  private reconnectRequired = false;

  reset(): number {
    this.snapshotRequest++;
    this.awaitingSnapshot = false;
    this.current = undefined;
    this.requiredFloor = undefined;
    this.reconnectRequired = false;
    return ++this.connection;
  }

  beginSnapshot(connection: number): SettingsSnapshotRequest | undefined {
    if (connection !== this.connection || this.reconnectRequired) return undefined;
    this.awaitingSnapshot = true;
    return { connection, id: ++this.snapshotRequest };
  }

  /** resync means issue another read; reconnect means bind a new connection before reading again. */
  acceptSnapshot(
    request: SettingsSnapshotRequest,
    publication: Publication,
  ): SettingsPublicationDecision {
    if (
      request.connection !== this.connection ||
      !this.awaitingSnapshot ||
      request.id !== this.snapshotRequest
    )
      return "ignore";
    this.awaitingSnapshot = false;
    const expectedAuthority = this.requiredFloor?.authorityId ?? this.current?.authorityId;
    if (expectedAuthority && publication.authorityId !== expectedAuthority)
      return this.requireReconnect();
    if (this.requiredFloor && publication.sequence < this.requiredFloor.sequence) return "resync";
    if (this.current && publication.sequence < this.current.sequence) return "ignore";
    this.current = { ...publication };
    this.requiredFloor = undefined;
    return "apply";
  }

  acceptDelta(connection: number, publication: Publication): SettingsPublicationDecision {
    if (connection !== this.connection) return "ignore";
    if (this.reconnectRequired) return "reconnect";
    const expectedAuthority = this.requiredFloor?.authorityId ?? this.current?.authorityId;
    if (expectedAuthority && publication.authorityId !== expectedAuthority)
      return this.requireReconnect();
    if (this.current && publication.sequence <= this.current.sequence) return "ignore";
    if (this.requiredFloor) {
      this.requiredFloor.sequence = Math.max(this.requiredFloor.sequence, publication.sequence);
      return "resync";
    }
    if (this.current && publication.sequence === this.current.sequence + 1) {
      this.current = { ...publication };
      return "apply";
    }
    this.requiredFloor = { ...publication };
    return "resync";
  }

  private requireReconnect(): "reconnect" {
    this.reconnectRequired = true;
    this.awaitingSnapshot = false;
    return "reconnect";
  }
}
