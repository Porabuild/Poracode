import { describe, expect, it, vi } from "vitest";
import { ThreadSessionAbsenceRefusalError } from "@/shared/threadSessionRefusal";
import type { SupervisorEvent } from "@/shared/ipc";

// This suite exercises the absent-session refusal of `sendThreadInput`, not
// spawning. Stubbing the spawn pipeline keeps the focused test independent of
// provider launch wiring (and of unrelated in-flight edits in that module).
vi.mock("./threadSession/spawnPipeline", () => ({
  SpawnPipeline: class {},
}));
vi.mock("./threadSession/invalidSessionRecovery", () => ({
  InvalidSessionRecoveryCoordinator: class {},
}));

import { ThreadSessionManager } from "./threadSessionManager";

function makeManager() {
  const emit = vi.fn<(event: SupervisorEvent) => void>();
  const manager = new ThreadSessionManager({
    emit,
    isDev: false,
    logsDir: "",
    settingsPath: "",
    readDisableCliHookPlugin: () => false,
    adapters: new Map(),
    resolveWindowsShell: () => ({ shell: "cmd", kind: "cmd", args: [] }),
  });
  return { manager, emit };
}

function startLocksOf(manager: ThreadSessionManager): Map<string, Promise<void>> {
  return (manager as unknown as { startLocks: Map<string, Promise<void>> }).startLocks;
}

/** Drain pending microtasks and macrotasks without assuming how many awaits the send crosses. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("ThreadSessionManager sendThreadInput absent-session refusal", () => {
  it("refuses typed with the legacy message when no session and no pending start exists", async () => {
    const { manager } = makeManager();
    const outcome = manager
      .sendThreadInput({ threadId: "t1", prompt: "hello", config: { model: "test" } })
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    const error = (await outcome) as unknown;
    expect(error).toBeInstanceOf(ThreadSessionAbsenceRefusalError);
    expect((error as Error).message).toBe("Unknown thread session: t1");
  });

  it("joins a pending start before deciding absence — no premature typed refusal", async () => {
    const { manager } = makeManager();
    let releaseStart!: () => void;
    const pendingStart = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    startLocksOf(manager).set("t1", pendingStart);

    let settled: unknown;
    const send = manager
      .sendThreadInput({ threadId: "t1", prompt: "hello", config: { model: "test" } })
      .then(
        () => {
          settled = "resolved";
        },
        (error: unknown) => {
          settled = error;
        },
      );

    // The in-flight start is joined, not read as an absent session: the send
    // stays pending across every barrier and the first absence check.
    await settle();
    expect(settled).toBeUndefined();

    // The start settles without publishing a session: only NOW is the absence
    // proven, and it surfaces as the typed refusal with the legacy message.
    releaseStart();
    await send;
    expect(settled).toBeInstanceOf(ThreadSessionAbsenceRefusalError);
    expect((settled as Error).message).toBe("Unknown thread session: t1");
  });
});
