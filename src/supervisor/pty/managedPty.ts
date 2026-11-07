import type { IPty, IWindowsPtyForkOptions } from "node-pty";
import type { ProjectLocation } from "@/shared/contracts";

export type TerminalPtyFactory = (
  command: string,
  args: string[],
  options: IWindowsPtyForkOptions,
  location: ProjectLocation,
  controlled: boolean,
) => IPty;

export interface ManagedPtyCustody {
  readonly closed: Promise<void>;
  readonly exitConfirmed: boolean;
  close(): Promise<void>;
}

const custody = new WeakMap<IPty, ManagedPtyCustody>();

export function registerManagedPty(pty: IPty, owner: ManagedPtyCustody): void {
  custody.set(pty, owner);
}

export function managedPtyCustody(pty: IPty): ManagedPtyCustody | undefined {
  return custody.get(pty);
}
