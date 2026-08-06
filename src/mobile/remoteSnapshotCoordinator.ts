interface SnapshotPersistenceDecision {
  readonly saveShell: boolean;
  readonly persistReplayCursor: boolean;
}

interface PersistRemoteSnapshotOptions {
  readonly desktopId: string;
  readonly shellSeq: number;
  readonly replaySeq: number | null;
  readonly isCurrent: () => boolean;
  readonly saveShell: () => Promise<void>;
  readonly markConnected: () => Promise<void>;
}

/** Orders refreshes and persistence independently for each paired desktop. */
export class RemoteSnapshotCoordinator {
  private readonly refreshRequests = new Map<string, number>();
  private readonly liveSeq = new Map<string, number>();
  private readonly savedShellSeq = new Map<string, number>();
  private readonly durableReplaySeq = new Map<string, number>();
  private readonly persistence = new Map<string, Promise<void>>();

  nextRequest(desktopId: string): number {
    const request = (this.refreshRequests.get(desktopId) ?? 0) + 1;
    this.refreshRequests.set(desktopId, request);
    return request;
  }

  isLatest(desktopId: string, request: number, activeDesktopId: string | null): boolean {
    return activeDesktopId === desktopId && this.refreshRequests.get(desktopId) === request;
  }

  currentLiveSeq(desktopId: string): number {
    return this.liveSeq.get(desktopId) ?? 0;
  }

  advanceLiveSeq(desktopId: string, seq: number, reset: boolean): void {
    if (reset) {
      this.savedShellSeq.delete(desktopId);
      this.durableReplaySeq.delete(desktopId);
    }
    this.liveSeq.set(desktopId, reset ? seq : Math.max(this.currentLiveSeq(desktopId), seq));
  }

  private persistenceNeeded(
    desktopId: string,
    shellSeq: number,
    replaySeq: number | null,
  ): SnapshotPersistenceDecision {
    return {
      saveShell: this.savedShellSeq.get(desktopId) !== shellSeq,
      persistReplayCursor:
        replaySeq !== null && (this.durableReplaySeq.get(desktopId) ?? -1) < replaySeq,
    };
  }

  private async enqueuePersistence(desktopId: string, task: () => Promise<void>): Promise<void> {
    const prior = this.persistence.get(desktopId);
    const current = (prior ?? Promise.resolve()).catch(() => undefined).then(task);
    this.persistence.set(desktopId, current);
    try {
      await current;
    } finally {
      if (this.persistence.get(desktopId) === current) this.persistence.delete(desktopId);
    }
  }

  private markPersisted(
    desktopId: string,
    shellSeq: number,
    replaySeq: number | null,
    decision: SnapshotPersistenceDecision,
  ): void {
    if (decision.saveShell) this.savedShellSeq.set(desktopId, shellSeq);
    if (decision.persistReplayCursor && replaySeq !== null) {
      this.durableReplaySeq.set(desktopId, replaySeq);
    }
  }

  async persistSnapshot(options: PersistRemoteSnapshotOptions): Promise<boolean> {
    const initial = this.persistenceNeeded(options.desktopId, options.shellSeq, options.replaySeq);
    if (!initial.saveShell && !initial.persistReplayCursor) return false;
    let persisted = false;
    await this.enqueuePersistence(options.desktopId, async () => {
      if (!options.isCurrent()) return;
      const decision = this.persistenceNeeded(
        options.desktopId,
        options.shellSeq,
        options.replaySeq,
      );
      if (!decision.saveShell && !decision.persistReplayCursor) return;
      await Promise.all([
        decision.saveShell ? options.saveShell() : Promise.resolve(),
        options.markConnected(),
      ]);
      if (!options.isCurrent()) return;
      this.markPersisted(options.desktopId, options.shellSeq, options.replaySeq, decision);
      persisted = true;
    });
    return persisted;
  }

  resetPersistence(): void {
    this.savedShellSeq.clear();
    this.durableReplaySeq.clear();
  }
}
