import { agentStatusSchema } from "../../../src/shared/contracts.ts";
import { LabHttpError } from "./labAuth.ts";

/** A host-owned probe held by an explicit checkpoint, never by a device timer. */
export class AgentDiscoveryFixture {
  enabled = false;
  private scanned = false;
  private generation = 0;
  private released = false;
  private releaseWaiters: Array<() => void> = [];
  onStatus: ((status: Record<string, unknown>) => void) | undefined;
  startedCount = 0;

  reset(): void {
    this.generation++;
    this.enabled = false;
    this.scanned = false;
    this.released = false;
    this.startedCount = 0;
    this.releaseWaiters.splice(0).forEach((resolve) => resolve());
  }

  prepare(): void {
    this.reset();
    this.enabled = true;
  }
  release(): void {
    this.released = true;
    this.releaseWaiters.splice(0).forEach((resolve) => resolve());
  }

  cachedStatuses() {
    return {
      windows: this.scanned ? [this.status()] : [],
      wsl: [],
      updatedAt: "2026-11-16T12:00:00Z",
    };
  }

  async discover(payload: Record<string, unknown>) {
    this.startedCount++;
    const generation = this.generation;
    if (!this.released) await new Promise<void>((resolve) => this.releaseWaiters.push(resolve));
    if (generation !== this.generation)
      throw new LabHttpError("scenario_reset", "Discovery scenario changed.", 409);
    this.scanned = true;
    const windows = [this.status()];
    const wsl = (payload.wslDistros as string[]).map((distro) => ({
      ...this.status(),
      envKind: "wsl" as const,
      envDistro: distro,
    }));
    for (const status of [...windows, ...wsl]) this.onStatus?.(status);
    return { windows, wsl, fromCache: false };
  }

  private status() {
    return agentStatusSchema.parse({
      kind: "fixture-discovered",
      label: "Discovered Agent",
      installed: true,
      authState: "authenticated",
      envKind: "posix",
      capabilities: {
        presentationModes: ["gui", "terminal"],
        models: [{ id: "discovered-pro", label: "Discovered Pro" }],
      },
    });
  }
}
