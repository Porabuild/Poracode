/** Tracks remote shell ownership and keeps routing stable across failed operations. */
export class RemoteTerminalOwnership<Owner> {
  private readonly owners = new Map<string, { readonly owner: Owner }>();

  owner(terminalId: string): Owner | undefined {
    return this.owners.get(terminalId)?.owner;
  }

  async start<Result>(
    terminalId: string,
    owner: Owner,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    // Each start has its own identity, even if the id and host are reused.
    const entry = { owner };
    this.owners.set(terminalId, entry);
    try {
      return await operation();
    } catch (error) {
      if (this.owners.get(terminalId) === entry) this.owners.delete(terminalId);
      throw error;
    }
  }

  async close<Result>(
    terminalId: string,
    operation: (owner: Owner) => Promise<Result>,
  ): Promise<{ readonly routed: false } | { readonly routed: true; readonly result: Result }> {
    const entry = this.owners.get(terminalId);
    if (!entry) return { routed: false };
    const result = await operation(entry.owner);
    if (this.owners.get(terminalId) === entry) this.owners.delete(terminalId);
    return { routed: true, result };
  }

  release(terminalId: string): void {
    this.owners.delete(terminalId);
  }

  releaseOwnedBy(owner: Owner): void {
    for (const [terminalId, candidate] of this.owners) {
      if (candidate.owner === owner) this.owners.delete(terminalId);
    }
  }

  clear(): void {
    this.owners.clear();
  }
}
