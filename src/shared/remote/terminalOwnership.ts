/** Tracks remote shell ownership and keeps routing stable across failed operations. */
export class RemoteTerminalOwnership<Owner> {
  private readonly owners = new Map<string, Owner>();

  owner(terminalId: string): Owner | undefined {
    return this.owners.get(terminalId);
  }

  async start<Result>(
    terminalId: string,
    owner: Owner,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    this.owners.set(terminalId, owner);
    try {
      return await operation();
    } catch (error) {
      this.owners.delete(terminalId);
      throw error;
    }
  }

  async close<Result>(
    terminalId: string,
    operation: (owner: Owner) => Promise<Result>,
  ): Promise<{ readonly routed: false } | { readonly routed: true; readonly result: Result }> {
    const owner = this.owners.get(terminalId);
    if (owner === undefined) return { routed: false };
    const result = await operation(owner);
    this.owners.delete(terminalId);
    return { routed: true, result };
  }

  release(terminalId: string): void {
    this.owners.delete(terminalId);
  }

  releaseOwnedBy(owner: Owner): void {
    for (const [terminalId, candidate] of this.owners) {
      if (candidate === owner) this.owners.delete(terminalId);
    }
  }

  clear(): void {
    this.owners.clear();
  }
}
