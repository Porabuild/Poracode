import { describe, expect, it } from "vitest";
import {
  ENVIRONMENT_OPERATION_MAX_PENDING_PER_ENVIRONMENT,
  ENVIRONMENT_OPERATION_MAX_WAITERS_PER_ENVIRONMENT,
  EnvironmentOperationCoordinator,
} from "./environmentOperationCoordinator";
import { environmentAbortError, isEnvironmentAbortError } from "./environmentRuntimeErrors";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("EnvironmentOperationCoordinator", () => {
  it("coalesces identical work and joins the same operation for a second caller", async () => {
    const coordinator = new EnvironmentOperationCoordinator();
    const gate = deferred<string>();
    let runs = 0;
    const work = async (): Promise<string> => {
      runs += 1;
      return gate.promise;
    };

    const first = coordinator.run("env", { kind: "connect", coalesceKey: "connect:env" }, work);
    const second = coordinator.run("env", { kind: "connect", coalesceKey: "connect:env" }, work);
    gate.resolve("ready");

    await expect(first).resolves.toBe("ready");
    await expect(second).resolves.toBe("ready");
    expect(runs).toBe(1);
  });

  it("aborting one caller does not cancel another caller of the same operation", async () => {
    const coordinator = new EnvironmentOperationCoordinator();
    const gate = deferred<string>();
    const controller = new AbortController();
    const first = coordinator.run(
      "env",
      { kind: "connect", coalesceKey: "connect:env", signal: controller.signal },
      async () => gate.promise,
    );
    const second = coordinator.run(
      "env",
      { kind: "connect", coalesceKey: "connect:env" },
      async () => gate.promise,
    );
    await Promise.resolve();
    controller.abort("client closed");
    await expect(first).rejects.toSatisfy(isEnvironmentAbortError);
    gate.resolve("ready");
    await expect(second).resolves.toBe("ready");
  });

  it("cancels the underlying operation only when the last waiter aborts", async () => {
    const coordinator = new EnvironmentOperationCoordinator();
    const gate = deferred<string>();
    const started = deferred<void>();
    let aborted = false;
    const controllerA = new AbortController();
    const controllerB = new AbortController();
    const work = async (context: { signal: AbortSignal }): Promise<string> => {
      context.signal.addEventListener("abort", () => {
        aborted = true;
      });
      started.resolve();
      return gate.promise;
    };
    const first = coordinator.run(
      "env",
      { kind: "connect", coalesceKey: "connect:env", signal: controllerA.signal },
      work,
    );
    const second = coordinator.run(
      "env",
      { kind: "connect", coalesceKey: "connect:env", signal: controllerB.signal },
      work,
    );
    await started.promise;
    controllerA.abort("one client closed");
    await expect(first).rejects.toSatisfy(isEnvironmentAbortError);
    expect(aborted).toBe(false);
    controllerB.abort("last client closed");
    await expect(second).rejects.toSatisfy(isEnvironmentAbortError);
    expect(aborted).toBe(true);
    gate.resolve("late");
  });

  it("serializes a mutation behind a cancelled operation and joins it first", async () => {
    const coordinator = new EnvironmentOperationCoordinator();
    const order: string[] = [];
    const gate = deferred<void>();
    const started = deferred<void>();
    const connect = coordinator.run(
      "env",
      { kind: "connect", coalesceKey: "connect:env" },
      async (context) => {
        order.push("connect:start");
        started.resolve();
        await new Promise<void>((resolve, reject) => {
          const onAbort = (): void => {
            order.push("connect:aborted");
            reject(environmentAbortError("superseded"));
          };
          if (context.signal.aborted) {
            onAbort();
            return;
          }
          context.signal.addEventListener("abort", onAbort, { once: true });
          void gate.promise.then(() => {
            context.signal.removeEventListener("abort", onAbort);
            resolve();
          });
        });
        order.push("connect:end");
      },
    );
    void connect.catch(() => undefined);
    await started.promise;
    const mutation = coordinator.runExclusive("env", environmentAbortError("changed"), async () => {
      order.push("mutation");
      return "done";
    });
    gate.resolve();
    await expect(mutation).resolves.toBe("done");
    await expect(connect).rejects.toSatisfy(isEnvironmentAbortError);
    expect(order).toEqual(["connect:start", "connect:aborted", "mutation"]);
  });

  it("cancels queued operations too, so a mutation never waits on stale queued work", async () => {
    const coordinator = new EnvironmentOperationCoordinator();
    const gate = deferred<void>();
    const first = coordinator.run(
      "env",
      { kind: "connect", coalesceKey: "connect:env" },
      async () => {
        await gate.promise;
      },
    );
    const queued = coordinator.run(
      "env",
      { kind: "upgrade", coalesceKey: "upgrade:env" },
      async () => {
        throw new Error("queued work must not run");
      },
    );
    void first.catch(() => undefined);
    void queued.catch(() => undefined);
    const mutation = coordinator.runExclusive(
      "env",
      environmentAbortError("changed"),
      async () => "ok",
    );
    gate.resolve();
    await expect(mutation).resolves.toBe("ok");
    await expect(queued).rejects.toSatisfy(isEnvironmentAbortError);
  });

  it("dispose aborts and joins everything and refuses later admission", async () => {
    const coordinator = new EnvironmentOperationCoordinator();
    const gate = deferred<void>();
    const running = coordinator.run(
      "env",
      { kind: "connect", coalesceKey: "connect:env" },
      async () => {
        await gate.promise;
      },
    );
    void running.catch(() => undefined);
    await coordinator.dispose();
    await expect(running).rejects.toSatisfy(isEnvironmentAbortError);
    await expect(
      coordinator.run("env", { kind: "connect", coalesceKey: "connect:env" }, async () => "late"),
    ).rejects.toSatisfy(isEnvironmentAbortError);
    await coordinator.dispose();
  });

  it("validates before aborting: a rejected mutation leaves in-flight work untouched", async () => {
    const coordinator = new EnvironmentOperationCoordinator();
    const gate = deferred<void>();
    let aborted = false;
    let workRan = false;
    const connect = coordinator.run(
      "env",
      { kind: "connect", coalesceKey: "connect:env" },
      async (context) => {
        context.signal.addEventListener("abort", () => {
          aborted = true;
        });
        await gate.promise;
      },
    );
    void connect.catch(() => undefined);
    await Promise.resolve();
    const mutation = coordinator.runExclusive(
      "env",
      environmentAbortError("changed"),
      async () => {
        workRan = true;
      },
      () => {
        throw new Error("stale revision");
      },
    );
    await expect(mutation).rejects.toThrow("stale revision");
    expect(aborted).toBe(false);
    expect(workRan).toBe(false);
    gate.resolve();
    await connect;
  });

  it("bounds pending operations per environment without affecting other environments", async () => {
    const coordinator = new EnvironmentOperationCoordinator();
    const gate = deferred<void>();
    const running = Array.from(
      { length: ENVIRONMENT_OPERATION_MAX_PENDING_PER_ENVIRONMENT },
      (_, index) =>
        coordinator.run("env", { kind: "connect", coalesceKey: `key:${index}` }, async () => {
          await gate.promise;
        }),
    );
    for (const promise of running) void promise.catch(() => undefined);
    await expect(
      coordinator.run("env", { kind: "connect", coalesceKey: "overflow" }, async () => "late"),
    ).rejects.toMatchObject({ code: "environment/store-busy" });
    await expect(
      coordinator.run("other", { kind: "connect", coalesceKey: "other" }, async () => "ok"),
    ).resolves.toBe("ok");
    gate.resolve();
    await Promise.allSettled(running);
  });

  it("bounds attached waiters per environment", async () => {
    const coordinator = new EnvironmentOperationCoordinator();
    const gate = deferred<void>();
    const first = coordinator.run(
      "env",
      { kind: "connect", coalesceKey: "connect:env" },
      async () => gate.promise,
    );
    void first.catch(() => undefined);
    const waiters: Promise<void>[] = [];
    for (let index = 1; index < ENVIRONMENT_OPERATION_MAX_WAITERS_PER_ENVIRONMENT; index += 1) {
      waiters.push(
        coordinator.run(
          "env",
          { kind: "connect", coalesceKey: "connect:env" },
          async () => gate.promise,
        ),
      );
    }
    for (const promise of waiters) void promise.catch(() => undefined);
    await expect(
      coordinator.run("env", { kind: "connect", coalesceKey: "connect:env" }, async () => "late"),
    ).rejects.toMatchObject({ code: "environment/store-busy" });
    gate.resolve();
    await Promise.all(waiters);
    await first;
  });

  it("fences generations: a later operation gets a higher generation", async () => {
    const coordinator = new EnvironmentOperationCoordinator();
    const generations: number[] = [];
    await coordinator.run("env", { kind: "connect", coalesceKey: "a" }, async (context) => {
      generations.push(context.generation);
    });
    await coordinator.run("env", { kind: "connect", coalesceKey: "b" }, async (context) => {
      generations.push(context.generation);
    });
    expect(generations[1]).toBeGreaterThan(generations[0]!);
    expect(coordinator.generation).toBeGreaterThanOrEqual(generations[1]!);
  });
});
