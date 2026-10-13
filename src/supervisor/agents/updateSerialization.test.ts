import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import { AGENT_UPDATE_QUEUE_WAIT_TIMEOUT_MS } from "@/shared/agents/updatePolicy";
import type { AgentEnvContext, AgentUpdaterCommand } from "./base";
import { runSerializedAgentUpdate, runSerializedUpdateCommand } from "./updateSerialization";

const native: AgentEnvContext = { envKind: "posix" };
const command: AgentUpdaterCommand = { binary: "npm", args: [], strategy: "npm-global" };
function status(kind: string, executablePath?: string): AgentStatus {
  return { kind, ...(executablePath ? { executablePath } : {}) } as AgentStatus;
}
function runCommand<T>(env: AgentEnvContext, run: () => Promise<T>, spec = command): Promise<T> {
  return runSerializedUpdateCommand(
    spec,
    env,
    Date.now() + AGENT_UPDATE_QUEUE_WAIT_TIMEOUT_MS,
    run,
  );
}

describe("agent update serialization", () => {
  afterEach(() => vi.useRealTimers());

  it("serializes package-manager writes while allowing independent managers and environments", async () => {
    let release!: () => void;
    const first = runCommand(
      native,
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const secondRun = vi.fn<() => Promise<void>>(async () => {});
    const second = runCommand(native, secondRun);
    const independentRun = vi.fn<() => Promise<void>>(async () => {});
    await Promise.all([
      runCommand(native, independentRun, { ...command, strategy: "brew" }),
      runCommand({ envKind: "wsl", wslDistro: "Ubuntu" }, independentRun),
    ]);
    expect(secondRun).not.toHaveBeenCalled();
    expect(independentRun).toHaveBeenCalledTimes(2);
    release();
    await Promise.all([first, second]);
    expect(secondRun).toHaveBeenCalledOnce();
  });

  it("releases failed writes and normalizes WSL distro names", async () => {
    let reject!: (error: Error) => void;
    const first = runCommand(
      { envKind: "wsl", wslDistro: "Ubuntu" },
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    const failure = first.catch((error: unknown) => error);
    const nextRun = vi.fn<() => Promise<void>>(async () => {});
    const next = runCommand({ envKind: "wsl", wslDistro: "ubuntu" }, nextRun);
    await vi.waitFor(() => expect(reject).toBeTypeOf("function"));
    expect(nextRun).not.toHaveBeenCalled();
    reject(new Error("failed"));
    expect(await failure).toEqual(new Error("failed"));
    await next;
    expect(nextRun).toHaveBeenCalledOnce();
  });

  it("lets independent installers overlap but protects shared executable aliases", async () => {
    let release!: () => void;
    const first = runSerializedAgentUpdate(
      status("a", "/bin/agent-a"),
      native,
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const aliasRun = vi.fn<() => Promise<void>>(async () => {});
    const alias = runSerializedAgentUpdate(status("a:profile", "/bin/agent-a"), native, aliasRun);
    const independentRun = vi.fn<() => Promise<void>>(async () => {});
    await runSerializedAgentUpdate(status("b", "/bin/agent-b"), native, independentRun);
    expect(independentRun).toHaveBeenCalledOnce();
    expect(aliasRun).not.toHaveBeenCalled();
    release();
    await Promise.all([first, alias]);
    expect(aliasRun).toHaveBeenCalledOnce();
  });

  it("retires an expired waiter without letting successors overtake the active write", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const first = runCommand(
      native,
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const expiredRun = vi.fn<() => Promise<void>>(async () => {});
    const expired = runCommand(native, expiredRun).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(AGENT_UPDATE_QUEUE_WAIT_TIMEOUT_MS);
    expect(await expired).toBeInstanceOf(Error);
    expect(expiredRun).not.toHaveBeenCalled();
    const nextRun = vi.fn<() => Promise<void>>(async () => {});
    const next = runCommand(native, nextRun);
    await vi.advanceTimersByTimeAsync(0);
    expect(nextRun).not.toHaveBeenCalled();
    release();
    await Promise.all([first, next]);
    expect(nextRun).toHaveBeenCalledOnce();
    expect(expiredRun).not.toHaveBeenCalled();
  });

  it("protects the stable launcher when an update repoints it to a new version", async () => {
    const launcher = status("native-agent", "/bin/native-agent");
    let release!: () => void;
    const first = runSerializedAgentUpdate(
      launcher,
      native,
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      "/share/native-agent/versions/1.0.0",
    );
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const repointedRun = vi.fn<() => Promise<void>>(async () => {});
    const repointed = runSerializedAgentUpdate(
      launcher,
      native,
      repointedRun,
      "/share/native-agent/versions/2.0.0",
    );
    const aliasRun = vi.fn<() => Promise<void>>(async () => {});
    const alias = runSerializedAgentUpdate(
      status("native-alias", "/bin/native-alias"),
      native,
      aliasRun,
      "/share/native-agent/versions/1.0.0",
    );
    await runSerializedAgentUpdate(
      status("independent", "/bin/other-agent"),
      native,
      async () => {},
    );
    expect(repointedRun).not.toHaveBeenCalled();
    expect(aliasRun).not.toHaveBeenCalled();
    release();
    await Promise.all([first, repointed, alias]);
    expect(repointedRun).toHaveBeenCalledOnce();
    expect(aliasRun).toHaveBeenCalledOnce();
  });

  it("completes three four-minute writes without a prematurely released lane", async () => {
    vi.useFakeTimers();
    let active = 0;
    let peak = 0;
    const write = async () => {
      peak = Math.max(peak, ++active);
      await new Promise<void>((resolve) => setTimeout(resolve, 4 * 60_000));
      active -= 1;
    };
    const batch = Promise.all([
      runCommand(native, write),
      runCommand(native, write),
      runCommand(native, write),
    ]);
    await vi.advanceTimersByTimeAsync(12 * 60_000);
    await batch;
    expect(peak).toBe(1);
    expect(active).toBe(0);
  });
});
