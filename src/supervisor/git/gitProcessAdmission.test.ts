import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGitProcessAdmissionScheduler,
  classifyGitProcess,
  GIT_ADMISSION_CANCELLED_CODE,
  GIT_ADMISSION_QUEUE_FULL_CODE,
  GIT_ADMISSION_WAIT_TIMEOUT_CODE,
  GIT_PROCESS_ADMISSION_DEFAULT_POLICY,
  GIT_SLOW_FETCH_EXECUTION_MS,
  type GitProcessAdmissionTicket,
} from "./gitProcessAdmission";

function makeScheduler() {
  return createGitProcessAdmissionScheduler({
    shortPermits: 2,
    longPermits: 1,
    maxQueuedEntries: 8,
    admissionWaitTimeoutMs: 1_000,
  });
}

/** Deterministic monotonic clock for the timing split; advance by hand. */
function makeClock(startMs = 1_000) {
  let value = startMs;
  return {
    now: (): number => value,
    advance: (ms: number): void => {
      value += ms;
    },
  };
}

/** Drain admission microtasks deterministically without real delays. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.useRealTimers();
});

describe("GitProcessAdmissionScheduler aggregate caps", () => {
  it("caps concurrent short units at the class limit and admits strictly FIFO", async () => {
    const scheduler = makeScheduler();
    const admissionOrder: number[] = [];
    const tickets: GitProcessAdmissionTicket[] = [];
    const admissions = [1, 2, 3, 4, 5].map(async (index) => {
      const ticket = await scheduler.admit("short");
      admissionOrder.push(index);
      tickets.push(ticket);
    });

    await settle();
    expect(admissionOrder).toEqual([1, 2]);
    expect(scheduler.usage().short).toMatchObject({ active: 2, queued: 3, maxActive: 2 });

    tickets[0]!.release();
    await settle();
    expect(admissionOrder).toEqual([1, 2, 3]);
    tickets[1]!.release();
    await settle();
    expect(admissionOrder).toEqual([1, 2, 3, 4]);
    tickets[2]!.release();
    tickets[3]!.release();
    await settle();
    expect(admissionOrder).toEqual([1, 2, 3, 4, 5]);
    await Promise.all(admissions);
    tickets[4]!.release();

    expect(scheduler.usage().short.maxActive).toBe(2);
    expect(scheduler.usage().short.active).toBe(0);
    expect(scheduler.usage().admitted).toBe(5);
  });

  it("never lets a fitting newcomer bypass an older queued entry", async () => {
    const scheduler = createGitProcessAdmissionScheduler({
      shortPermits: 3,
      longPermits: 1,
      maxQueuedEntries: 8,
      admissionWaitTimeoutMs: 100,
    });
    const order: string[] = [];
    const holder = await scheduler.admit("short", { units: 2 });
    // Occupies 2 of 3 permits; one slot is free.
    const older = scheduler.admit("short", { units: 2 }).then((ticket) => {
      order.push("older");
      return ticket;
    });
    await settle();
    // The 2-unit entry cannot fit the one free slot, so it queues…
    expect(scheduler.usage().short.queued).toBe(1);

    // …and a 1-unit newcomer that WOULD fit must still queue behind it.
    const newcomer = scheduler.admit("short").then((ticket) => {
      order.push("newcomer");
      return ticket;
    });
    await settle();
    expect(order).toEqual([]);
    expect(scheduler.usage().short.queued).toBe(2);

    holder.release();
    const [olderTicket, newcomerTicket] = await Promise.all([older, newcomer]);
    // Strict FIFO release order: the older, larger entry first.
    expect(order).toEqual(["older", "newcomer"]);
    expect(scheduler.usage().short.maxActive).toBe(3);
    olderTicket.release();
    newcomerTicket.release();
    expect(scheduler.usage().short.active).toBe(0);
  });

  it("admits multi-unit batches atomically under head-of-line blocking", async () => {
    const scheduler = createGitProcessAdmissionScheduler({
      shortPermits: 4,
      longPermits: 1,
      maxQueuedEntries: 8,
      admissionWaitTimeoutMs: 1_000,
    });
    const order: string[] = [];
    const batch = scheduler.admit("short", { units: 3 }).then((ticket) => {
      order.push("batch");
      return ticket;
    });
    const single = scheduler.admit("short").then((ticket) => {
      order.push("single");
      return ticket;
    });
    await settle();
    expect(order).toEqual(["batch", "single"]);
    expect(scheduler.usage().short).toMatchObject({ active: 4, queued: 0 });

    const queuedBatch = scheduler.admit("short", { units: 2 });
    const queuedSingle = scheduler.admit("short");
    await settle();
    expect(scheduler.usage().short.queued).toBe(2);

    (await single).release();
    await settle();
    // Strict FIFO: the 2-unit batch head blocks the 1-unit follower even
    // though one slot is free.
    expect(order).toEqual(["batch", "single"]);

    (await batch).release();
    await Promise.all([queuedBatch, queuedSingle]).then(async ([batchTicket, singleTicket]) => {
      batchTicket.release();
      singleTicket.release();
    });
    await settle();
    expect(scheduler.usage().short.maxActive).toBe(4);
    expect(scheduler.usage().short.active).toBe(0);
  });

  it("refuses units that can never fit the class limit without queueing", async () => {
    const scheduler = makeScheduler();
    await expect(scheduler.admit("long", { units: 2 })).rejects.toMatchObject({
      code: GIT_ADMISSION_QUEUE_FULL_CODE,
    });
    expect(scheduler.usage().queueFullRefusals).toBe(1);
    expect(scheduler.usage().long.queued).toBe(0);
  });

  it("bounds the queue and refuses overflow with a typed error", async () => {
    const scheduler = createGitProcessAdmissionScheduler({
      shortPermits: 1,
      longPermits: 1,
      maxQueuedEntries: 2,
      admissionWaitTimeoutMs: 100,
    });
    const holder = await scheduler.admit("short");
    scheduler.admit("short").catch(() => undefined);
    scheduler.admit("short").catch(() => undefined);
    await settle();
    expect(scheduler.usage().short.queued).toBe(2);
    await expect(scheduler.admit("short")).rejects.toMatchObject({
      code: GIT_ADMISSION_QUEUE_FULL_CODE,
    });
    expect(scheduler.usage().queueFullRefusals).toBe(1);
    holder.release();
  });

  it("enforces the queue cap across short and long classes together", async () => {
    const scheduler = createGitProcessAdmissionScheduler({
      shortPermits: 1,
      longPermits: 1,
      maxQueuedEntries: 2,
      admissionWaitTimeoutMs: 100,
    });
    const shortHolder = await scheduler.admit("short");
    const longHolder = await scheduler.admit("long");
    scheduler.admit("short").catch(() => undefined);
    scheduler.admit("long").catch(() => undefined);
    await settle();
    expect(scheduler.usage().short.queued + scheduler.usage().long.queued).toBe(2);
    await expect(scheduler.admit("short")).rejects.toMatchObject({
      code: GIT_ADMISSION_QUEUE_FULL_CODE,
    });
    shortHolder.release();
    longHolder.release();
  });
});

describe("GitProcessAdmissionScheduler bounded wait and cancellation", () => {
  it("times out queued admission on its own deadline, independent of command timeouts", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const scheduler = createGitProcessAdmissionScheduler({
      shortPermits: 1,
      longPermits: 1,
      maxQueuedEntries: 8,
      admissionWaitTimeoutMs: 500,
    });
    const holder = await scheduler.admit("short");
    const queued = scheduler.admit("short");
    // Attach the handler up front so the rejection is never unhandled.
    const failure = queued.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(500);
    expect(await failure).toMatchObject({ code: GIT_ADMISSION_WAIT_TIMEOUT_CODE });

    expect(scheduler.usage().waitTimeoutRefusals).toBe(1);
    expect(scheduler.usage().short).toMatchObject({ active: 1, queued: 0 });
    holder.release();
    expect(scheduler.usage().short.active).toBe(0);
  });

  it("cancels a queued entry before spawn without disturbing the holder", async () => {
    const scheduler = makeScheduler();
    const holderA = await scheduler.admit("short");
    const holderB = await scheduler.admit("short");
    const controller = new AbortController();
    // Pool is full (2 of 2): this request queues before it can be cancelled.
    const queued = scheduler.admit("short", { signal: controller.signal });
    await settle();
    expect(scheduler.usage().short.queued).toBe(1);
    controller.abort();
    await expect(queued).rejects.toMatchObject({ code: GIT_ADMISSION_CANCELLED_CODE });
    expect(scheduler.usage().cancellations).toBe(1);
    expect(scheduler.usage().short).toMatchObject({ active: 2, queued: 0 });

    holderA.release();
    holderB.release();
    expect(scheduler.usage().short.active).toBe(0);
  });

  it("repumps immediately when a blocked queue head is cancelled", async () => {
    const scheduler = createGitProcessAdmissionScheduler({
      shortPermits: 3,
      longPermits: 1,
      maxQueuedEntries: 8,
      admissionWaitTimeoutMs: 1_000,
    });
    const holder = await scheduler.admit("short", { units: 2 });
    const controller = new AbortController();
    const blockedHead = scheduler.admit("short", { units: 2, signal: controller.signal });
    const follower = scheduler.admit("short");
    await settle();
    expect(scheduler.usage().short.queued).toBe(2);

    controller.abort();
    await expect(blockedHead).rejects.toMatchObject({ code: GIT_ADMISSION_CANCELLED_CODE });
    const followerTicket = await follower;
    expect(scheduler.usage().short).toMatchObject({ active: 3, queued: 0 });
    followerTicket.release();
    holder.release();
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const scheduler = makeScheduler();
    const controller = new AbortController();
    controller.abort();
    await expect(scheduler.admit("short", { signal: controller.signal })).rejects.toMatchObject({
      code: GIT_ADMISSION_CANCELLED_CODE,
    });
  });
});

describe("GitProcessAdmissionScheduler release and isolation", () => {
  it("releases exactly once on repeated release calls", async () => {
    const scheduler = makeScheduler();
    const ticket = await scheduler.admit("short");
    ticket.release();
    ticket.release();
    ticket.release();
    expect(scheduler.usage().short.active).toBe(0);
    const next = await scheduler.admit("short", { units: 2 });
    expect(scheduler.usage().short.active).toBe(2);
    next.release();
  });

  it("isolates long operations: a stalled long permit never blocks short work", async () => {
    const scheduler = makeScheduler();
    const stalledLong = await scheduler.admit("long", { units: 1 });
    const shortTicket = await scheduler.admit("short");
    expect(scheduler.usage().long.active).toBe(1);
    expect(scheduler.usage().short.active).toBe(1);
    shortTicket.release();
    stalledLong.release();
  });

  it("isolates short reads: saturated short permits never block long work", async () => {
    const scheduler = createGitProcessAdmissionScheduler({
      shortPermits: 2,
      longPermits: 1,
      maxQueuedEntries: 8,
      admissionWaitTimeoutMs: 1_000,
    });
    const shortA = await scheduler.admit("short");
    const shortB = await scheduler.admit("short");
    const longTicket = await scheduler.admit("long");
    expect(scheduler.usage().long.active).toBe(1);
    shortA.release();
    shortB.release();
    longTicket.release();
  });

  it("applies configuration changes live without killing active work", async () => {
    const scheduler = makeScheduler();
    const first = await scheduler.admit("short");
    const second = await scheduler.admit("short");
    scheduler.configure({ shortPermits: 1 });
    const queued = scheduler.admit("short");
    await settle();
    expect(scheduler.usage().short.queued).toBe(1);

    first.release();
    await settle();
    expect(scheduler.usage().short.queued).toBe(1);

    second.release();
    const queuedTicket = await queued;
    expect(scheduler.usage().short.active).toBe(1);

    scheduler.configure({ shortPermits: 4 });
    const raised = await scheduler.admit("short", { units: 2 });
    expect(scheduler.usage().short.active).toBe(3);
    raised.release();
    queuedTicket.release();
  });

  it("resets pools, counters and waiters for tests", async () => {
    const scheduler = makeScheduler();
    await scheduler.admit("short");
    await scheduler.admit("short");
    const queued = scheduler.admit("short");
    await settle();
    scheduler.resetForTests();
    await expect(queued).rejects.toMatchObject({ code: GIT_ADMISSION_CANCELLED_CODE });
    expect(scheduler.usage()).toMatchObject({
      short: { active: 0, queued: 0, maxActive: 0 },
      admitted: 0,
    });
  });

  it("ignores a stale ticket released after a test reset", async () => {
    const scheduler = makeScheduler();
    const stale = await scheduler.admit("short");
    scheduler.resetForTests();
    stale.release();
    expect(scheduler.usage().short.active).toBe(0);
    const current = await scheduler.admit("short", { units: 2 });
    expect(scheduler.usage().short.active).toBe(2);
    current.release();
  });
});

describe("GitProcessAdmissionScheduler timing split", () => {
  it("records zero wait for immediate grants and the exact execution span", async () => {
    const clock = makeClock();
    const scheduler = createGitProcessAdmissionScheduler(
      { shortPermits: 2, longPermits: 1, maxQueuedEntries: 8, admissionWaitTimeoutMs: 1_000 },
      { now: clock.now },
    );
    const ticket = await scheduler.admit("short");
    clock.advance(250);
    ticket.release();
    expect(scheduler.usage().short).toMatchObject({
      queueWaitMs: 0,
      maxQueueWaitMs: 0,
      executionMs: 250,
      maxExecutionMs: 250,
    });
  });

  it("splits queued admission wait from execution duration deterministically", async () => {
    const clock = makeClock();
    const scheduler = createGitProcessAdmissionScheduler(
      { shortPermits: 1, longPermits: 1, maxQueuedEntries: 8, admissionWaitTimeoutMs: 1_000 },
      { now: clock.now },
    );
    const holder = await scheduler.admit("short"); // granted at t=1000
    clock.advance(40);
    const queued = scheduler.admit("short"); // enqueued at t=1040
    await settle();
    clock.advance(210); // t=1250
    holder.release(); // queued head grants: wait 1040→1250 = 210
    const queuedTicket = await queued;
    clock.advance(90); // t=1340
    queuedTicket.release(); // executed 1250→1340 = 90
    expect(scheduler.usage().short).toMatchObject({
      queueWaitMs: 210,
      maxQueueWaitMs: 210,
      executionMs: 340, // holder 1000→1250 = 250, queued 90
      maxExecutionMs: 250,
    });
  });

  it("counts no wait or execution for a timed-out queue entry", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const clock = makeClock();
    const scheduler = createGitProcessAdmissionScheduler(
      { shortPermits: 1, longPermits: 1, maxQueuedEntries: 8, admissionWaitTimeoutMs: 500 },
      { now: clock.now },
    );
    const holder = await scheduler.admit("short");
    clock.advance(40);
    const queued = scheduler.admit("short");
    const failure = queued.catch((error: unknown) => error);
    clock.advance(500);
    await vi.advanceTimersByTimeAsync(500);
    expect(await failure).toMatchObject({ code: GIT_ADMISSION_WAIT_TIMEOUT_CODE });
    expect(scheduler.usage().waitTimeoutRefusals).toBe(1);
    expect(scheduler.usage().short).toMatchObject({
      queueWaitMs: 0,
      maxQueueWaitMs: 0,
      executionMs: 0,
    });
    clock.advance(100);
    holder.release(); // grant t=1000 → release t=1640
    expect(scheduler.usage().short.executionMs).toBe(640);
  });

  it("counts no wait or execution for a cancelled queue entry", async () => {
    const clock = makeClock();
    const scheduler = createGitProcessAdmissionScheduler(
      { shortPermits: 1, longPermits: 1, maxQueuedEntries: 8, admissionWaitTimeoutMs: 1_000 },
      { now: clock.now },
    );
    const holder = await scheduler.admit("short");
    clock.advance(30);
    const controller = new AbortController();
    const queued = scheduler.admit("short", { signal: controller.signal });
    await settle();
    controller.abort();
    await expect(queued).rejects.toMatchObject({ code: GIT_ADMISSION_CANCELLED_CODE });
    expect(scheduler.usage().cancellations).toBe(1);
    expect(scheduler.usage().short).toMatchObject({
      queueWaitMs: 0,
      executionMs: 0,
      active: 1,
      queued: 0,
    });
    clock.advance(120);
    holder.release(); // grant t=1000 → release t=1150
    expect(scheduler.usage().short.executionMs).toBe(150);
  });

  it("counts execution exactly once across repeated releases", async () => {
    const clock = makeClock();
    const scheduler = createGitProcessAdmissionScheduler(
      { shortPermits: 2, longPermits: 1, maxQueuedEntries: 8, admissionWaitTimeoutMs: 1_000 },
      { now: clock.now },
    );
    const ticket = await scheduler.admit("short");
    clock.advance(100);
    ticket.release();
    clock.advance(500);
    ticket.release();
    ticket.release();
    expect(scheduler.usage().short.executionMs).toBe(100);
  });

  it("tracks the timing split per class", async () => {
    const clock = makeClock();
    const scheduler = createGitProcessAdmissionScheduler(
      { shortPermits: 1, longPermits: 1, maxQueuedEntries: 8, admissionWaitTimeoutMs: 1_000 },
      { now: clock.now },
    );
    const shortTicket = await scheduler.admit("short");
    const longTicket = await scheduler.admit("long");
    clock.advance(500);
    longTicket.release();
    clock.advance(100);
    shortTicket.release();
    expect(scheduler.usage().short.executionMs).toBe(600);
    expect(scheduler.usage().long.executionMs).toBe(500);
    expect(scheduler.usage().long.queueWaitMs).toBe(0);
  });

  it("counts slow fetches strictly past the declared threshold", async () => {
    const clock = makeClock();
    const scheduler = createGitProcessAdmissionScheduler(
      { shortPermits: 2, longPermits: 1, maxQueuedEntries: 8, admissionWaitTimeoutMs: 1_000 },
      { now: clock.now },
    );
    // Exactly at the threshold is not slow; one millisecond past it is.
    const fetchA = await scheduler.admit("long", { subcommand: "fetch" });
    clock.advance(GIT_SLOW_FETCH_EXECUTION_MS);
    fetchA.release();
    expect(scheduler.usage().slowFetches).toBe(0);

    const fetchB = await scheduler.admit("long", { subcommand: "fetch" });
    clock.advance(GIT_SLOW_FETCH_EXECUTION_MS + 1);
    fetchB.release();
    expect(scheduler.usage().slowFetches).toBe(1);
    expect(scheduler.usage().long.maxExecutionMs).toBe(GIT_SLOW_FETCH_EXECUTION_MS + 1);

    // The same span is not a slow fetch for other subcommands or untagged work.
    const commit = await scheduler.admit("long", { subcommand: "commit" });
    clock.advance(GIT_SLOW_FETCH_EXECUTION_MS + 1);
    commit.release();
    expect(scheduler.usage().slowFetches).toBe(1);

    const untagged = await scheduler.admit("long");
    clock.advance(GIT_SLOW_FETCH_EXECUTION_MS + 1);
    untagged.release();
    expect(scheduler.usage().slowFetches).toBe(1);
  });

  it("resets timing totals, slow fetches and environment gauges with the pools", async () => {
    const clock = makeClock();
    const scheduler = createGitProcessAdmissionScheduler(
      { shortPermits: 2, longPermits: 1, maxQueuedEntries: 8, admissionWaitTimeoutMs: 1_000 },
      { now: clock.now },
    );
    const ticket = await scheduler.admit("short", { environment: "wsl" });
    clock.advance(50);
    ticket.release();
    scheduler.resetForTests();
    expect(scheduler.usage()).toMatchObject({
      short: { queueWaitMs: 0, maxQueueWaitMs: 0, executionMs: 0, maxExecutionMs: 0 },
      slowFetches: 0,
      environments: {
        posix: { active: 0, queued: 0 },
        windows: { active: 0, queued: 0 },
        wsl: { active: 0, queued: 0 },
      },
    });
  });
});

describe("GitProcessAdmissionScheduler environment gauges", () => {
  it("reports every environment with zero gauges before any admission", () => {
    const scheduler = makeScheduler();
    expect(scheduler.usage().environments).toEqual({
      posix: { active: 0, queued: 0 },
      windows: { active: 0, queued: 0 },
      wsl: { active: 0, queued: 0 },
    });
  });

  it("tracks active and queued permit units per environment", async () => {
    const scheduler = makeScheduler();
    const wsl = await scheduler.admit("short", { environment: "wsl" });
    // Two posix units queue behind the single wsl unit (pool limit is 2).
    const posix = scheduler.admit("short", { environment: "posix", units: 2 });
    await settle();
    expect(scheduler.usage().environments).toEqual({
      posix: { active: 0, queued: 2 },
      windows: { active: 0, queued: 0 },
      wsl: { active: 1, queued: 0 },
    });

    wsl.release();
    const posixTicket = await posix;
    expect(scheduler.usage().environments).toMatchObject({
      posix: { active: 2, queued: 0 },
      wsl: { active: 0, queued: 0 },
    });
    posixTicket.release();
    expect(scheduler.usage().environments).toEqual({
      posix: { active: 0, queued: 0 },
      windows: { active: 0, queued: 0 },
      wsl: { active: 0, queued: 0 },
    });
  });

  it("returns queued gauges on cancellation without disturbing active work", async () => {
    const scheduler = makeScheduler();
    const holderA = await scheduler.admit("short", { environment: "wsl" });
    const holderB = await scheduler.admit("short", { environment: "wsl" });
    const controller = new AbortController();
    const queued = scheduler.admit("short", { environment: "posix", signal: controller.signal });
    await settle();
    expect(scheduler.usage().environments).toMatchObject({
      posix: { active: 0, queued: 1 },
      wsl: { active: 2, queued: 0 },
    });
    controller.abort();
    await expect(queued).rejects.toMatchObject({ code: GIT_ADMISSION_CANCELLED_CODE });
    expect(scheduler.usage().environments).toMatchObject({
      posix: { active: 0, queued: 0 },
      wsl: { active: 2, queued: 0 },
    });
    holderA.release();
    holderB.release();
    expect(scheduler.usage().environments?.wsl).toEqual({ active: 0, queued: 0 });
  });

  it("keeps untagged admissions out of the per-environment gauges", async () => {
    const scheduler = makeScheduler();
    const ticket = await scheduler.admit("short");
    expect(scheduler.usage().short.active).toBe(1);
    expect(scheduler.usage().environments).toEqual({
      posix: { active: 0, queued: 0 },
      windows: { active: 0, queued: 0 },
      wsl: { active: 0, queued: 0 },
    });
    ticket.release();
  });

  it("settles the gauges exactly once when a queued entry is pumped", async () => {
    const scheduler = createGitProcessAdmissionScheduler({
      shortPermits: 1,
      longPermits: 1,
      maxQueuedEntries: 8,
      admissionWaitTimeoutMs: 1_000,
    });
    const holder = await scheduler.admit("short", { environment: "wsl" });
    const queued = scheduler.admit("short", { environment: "wsl" });
    await settle();
    expect(scheduler.usage().environments.wsl).toEqual({ active: 1, queued: 1 });

    holder.release();
    const ticket = await queued;
    expect(scheduler.usage().environments.wsl).toEqual({ active: 1, queued: 0 });
    ticket.release();
    expect(scheduler.usage().environments.wsl).toEqual({ active: 0, queued: 0 });
  });
});

describe("classifyGitProcess", () => {
  it.each([
    [["status", "--porcelain=v2", "-b"], "short"],
    [["remote", "-v"], "short"],
    [["remote", "add", "origin", "url"], "short"],
    [["diff", "--cached", "--numstat"], "short"],
    [["rev-parse", "--is-inside-work-tree"], "short"],
    [["ls-files", "--others"], "short"],
    [["branch", "--format=x"], "short"],
    [["worktree", "list", "--porcelain"], "short"],
    [["worktree", "add", "/tmp/wt"], "short"],
    [["commit-tree", "abc"], "short"],
    [["commit-tree"], "short"],
    [["clone", "url"], "long"],
    [["fetch", "origin"], "long"],
    [["pull", "--no-rebase", "origin"], "long"],
    [["push", "origin", "HEAD"], "long"],
    [["ls-remote", "origin"], "long"],
    [["commit", "-m", "msg"], "long"],
    [["merge", "--no-edit", "--no-ff"], "long"],
    [["rebase", "main"], "long"],
    [["revert", "abc"], "long"],
    [["cherry-pick", "abc"], "long"],
    [["am"], "long"],
    [["stash", "pop"], "long"],
    [["worktree", "remove", "/tmp/wt"], "long"],
    [["worktree", "prune"], "long"],
  ])("classifies %j as %s", (args, expected) => {
    expect(classifyGitProcess(args)).toBe(expected);
  });

  it("falls back to short for empty or option-only argv", () => {
    expect(classifyGitProcess([])).toBe("short");
    expect(classifyGitProcess(["--version"])).toBe("short");
  });

  it("matches the documented default policy shape", () => {
    expect(GIT_PROCESS_ADMISSION_DEFAULT_POLICY).toEqual({
      shortPermits: 8,
      longPermits: 2,
      maxQueuedEntries: 64,
      admissionWaitTimeoutMs: 10_000,
    });
  });
});
