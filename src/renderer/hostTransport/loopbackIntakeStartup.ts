export class LoopbackIntakeStartup {
  private generation = 0;
  private pending: Promise<void> | null = null;

  invalidate(): void {
    this.generation += 1;
    this.pending = null;
  }

  run(operation: (isCurrent: () => boolean) => Promise<void>): Promise<void> {
    if (this.pending) return this.pending;
    const generation = this.generation;
    const isCurrent = () => this.generation === generation;
    const pending = Promise.resolve()
      .then(() => operation(isCurrent))
      .then(
        () => {
          if (this.pending === pending) this.pending = null;
        },
        (error: unknown) => {
          if (this.pending === pending) this.pending = null;
          console.error(error);
        },
      );
    this.pending = pending;
    return pending;
  }
}
