import { describe, expect, it, vi } from "vitest";
import { SingleFlight } from "./singleFlight";

interface Gate {
  promise: Promise<void>;
  release: () => void;
}

function gate(): Gate {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("SingleFlight successor custody", () => {
  it("does not start a successor task until the aborted predecessor task actually settles", async () => {
    const flights = new SingleFlight();
    let starts = 0;
    let settles = 0;
    let concurrent = 0;
    let maxConcurrent = 0;
    const firstWork = gate();

    const firstTask = async (signal: AbortSignal): Promise<string> => {
      starts += 1;
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      try {
        signal.throwIfAborted();
        await firstWork.promise;
        return "first";
      } finally {
        concurrent -= 1;
        settles += 1;
      }
    };

    const controller = new AbortController();
    const first = flights.run("distro", firstTask, { signal: controller.signal });
    const firstOutcome = first.then(
      () => "resolved" as const,
      () => "rejected" as const,
    );
    await vi.waitFor(() => expect(starts).toBe(1));

    controller.abort(new Error("all callers left"));
    await expect(firstOutcome).resolves.toBe("rejected");
    // The predecessor is uncooperative: its task is still inside its await.
    expect(settles).toBe(0);
    expect(concurrent).toBe(1);

    let successorStarts = 0;
    const successor = flights.run("distro", async (signal) => {
      successorStarts += 1;
      signal.throwIfAborted();
      return "successor";
    });

    // The successor must wait for the actual settlement, not run alongside.
    await sleep(30);
    expect(successorStarts).toBe(0);
    expect(settles).toBe(0);

    firstWork.release();
    await expect(successor).resolves.toBe("successor");
    expect(settles).toBe(1);
    expect(successorStarts).toBe(1);
    expect(maxConcurrent).toBe(1);
  });

  it("rejects a waiting successor whose own signal aborts without starting a task", async () => {
    const flights = new SingleFlight();
    const firstWork = gate();
    const controller = new AbortController();
    const first = flights.run(
      "distro",
      async () => {
        await firstWork.promise;
        return "first";
      },
      { signal: controller.signal },
    );
    const firstOutcome = first.then(
      () => undefined,
      () => undefined,
    );
    controller.abort(new Error("all callers left"));
    await firstOutcome;

    let successorStarts = 0;
    const waiting = new AbortController();
    const successor = flights.run(
      "distro",
      async () => {
        successorStarts += 1;
        return "successor";
      },
      { signal: waiting.signal },
    );
    await sleep(10);
    expect(successorStarts).toBe(0);

    waiting.abort(new Error("second caller left"));
    await expect(successor).rejects.toThrow("second caller left");

    firstWork.release();
    await vi.waitFor(() => expect(flights.size).toBe(0));
    expect(successorStarts).toBe(0);
  });

  it("shares one successor task between concurrent callers that waited out a predecessor", async () => {
    const flights = new SingleFlight();
    const firstWork = gate();
    const successorWork = gate();
    let starts = 0;
    const task = async (signal: AbortSignal): Promise<string> => {
      starts += 1;
      signal.throwIfAborted();
      await (starts === 1 ? firstWork.promise : successorWork.promise);
      return `task-${starts}`;
    };

    const controller = new AbortController();
    const first = flights.run("distro", task, { signal: controller.signal });
    const firstOutcome = first.then(
      () => undefined,
      () => undefined,
    );
    controller.abort(new Error("all callers left"));
    await firstOutcome;

    const a = flights.run("distro", task);
    const b = flights.run("distro", task);
    firstWork.release();
    await vi.waitFor(() => expect(starts).toBe(2));
    successorWork.release();

    await expect(a).resolves.toBe("task-2");
    await expect(b).resolves.toBe("task-2");
    expect(starts).toBe(2);
  });

  it("still runs the uncooperative task to completion after the last caller aborts", async () => {
    const flights = new SingleFlight();
    const work = gate();
    let settles = 0;
    const controller = new AbortController();
    const pending = flights.run(
      "distro",
      async () => {
        try {
          await work.promise;
          return "done";
        } finally {
          settles += 1;
        }
      },
      { signal: controller.signal },
    );
    const pendingOutcome = pending.then(
      () => undefined,
      () => undefined,
    );

    controller.abort(new Error("all callers left"));
    await pendingOutcome;
    expect(settles).toBe(0);

    work.release();
    await vi.waitFor(() => expect(settles).toBe(1));
  });

  it("rejects an already-aborted caller before any task starts", async () => {
    const flights = new SingleFlight();
    let starts = 0;
    const controller = new AbortController();
    controller.abort(new Error("already cancelled"));

    await expect(
      flights.run(
        "distro",
        async () => {
          starts += 1;
          return "never";
        },
        { signal: controller.signal },
      ),
    ).rejects.toThrow("already cancelled");
    expect(starts).toBe(0);
    expect(flights.size).toBe(0);
  });

  it("still lets one caller abort without sabotaging a joined caller", async () => {
    const flights = new SingleFlight();
    const work = gate();
    const controller = new AbortController();

    const aborting = flights.run("distro", async () => work.promise.then(() => "shared"), {
      signal: controller.signal,
    });
    const joined = flights.run("distro", async () => work.promise.then(() => "shared"));
    controller.abort(new Error("one caller cancelled"));
    await expect(aborting).rejects.toThrow("one caller cancelled");
    work.release();
    await expect(joined).resolves.toBe("shared");
  });
});
