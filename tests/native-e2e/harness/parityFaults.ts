import type { ParityFault, ParityHostId } from "./parityValidation.ts";

export class ParityFaults {
  private readonly active = new Map<ParityHostId, Set<ParityFault>>();

  list(hostId: ParityHostId): readonly ParityFault[] {
    return [...(this.active.get(hostId) ?? [])].sort();
  }

  has(hostId: ParityHostId, fault: ParityFault): boolean {
    return this.active.get(hostId)?.has(fault) === true;
  }

  set(hostId: ParityHostId, fault: ParityFault): void {
    const faults = this.active.get(hostId) ?? new Set<ParityFault>();
    faults.add(fault);
    this.active.set(hostId, faults);
  }

  clear(hostId?: ParityHostId): void {
    if (hostId) this.active.delete(hostId);
    else this.active.clear();
  }
}
