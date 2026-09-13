import { joinRuntimeShutdown } from "@/backend/joinRuntimeShutdown";
import { AsyncWorkTracker } from "@/shared/asyncWorkTracker";
import { toErrorMessage } from "@/shared/errorMessage";
import type { PortForwarding } from "./portForward/portForwarding";
import type { PushCoordinator } from "./push";
import type { RemoteAccessServer, RemoteAccessServerInfo } from "./RemoteAccessServer";

export interface RemoteAccessStartAttempt {
  readonly generation: number;
  readonly promise: Promise<RemoteAccessServerInfo>;
  cancelled: boolean;
  server: RemoteAccessServer | null;
  serverStartPromise: Promise<RemoteAccessServerInfo> | null;
  serverDisposalPromise: Promise<void> | null;
  forwarding: PortForwarding | null;
  coordinator: PushCoordinator | null;
  tailscaleServeUrl: string | null;
  tailscaleTeardownPromise: Promise<void> | null;
}

/** Retain disabled/replaced generations until their actual work has settled.
 * A failed join also remains visible after its promise leaves the active set. */
export class RemoteAccessRetirements {
  private readonly work = new AsyncWorkTracker();
  private failure: { error: unknown } | undefined;

  run(stops: readonly (() => void | Promise<void>)[]): Promise<void> {
    return this.work.run(async () => {
      try {
        await joinRuntimeShutdown(stops);
      } catch (error) {
        this.failure ??= { error };
        throw error;
      }
    });
  }

  async drain(): Promise<void> {
    await this.work.drain();
    if (this.failure) throw this.failure.error;
  }
}

/** Close immediately, then join startup and close again if it became live. */
export function disposeAttemptServer(attempt: RemoteAccessStartAttempt): Promise<void> {
  if (attempt.serverDisposalPromise) return attempt.serverDisposalPromise;
  const server = attempt.server;
  if (!server) return Promise.resolve();

  attempt.serverDisposalPromise = (async () => {
    let disposalError: unknown;
    try {
      await server.dispose();
    } catch (error) {
      disposalError = error;
    }
    await attempt.serverStartPromise?.catch(() => {});
    if (server.getInfo()) {
      try {
        await server.dispose();
      } catch (error) {
        disposalError ??= error;
      }
    }
    if (disposalError) {
      throw disposalError instanceof Error
        ? disposalError
        : new Error(toErrorMessage(disposalError), { cause: disposalError });
    }
  })();
  return attempt.serverDisposalPromise;
}
