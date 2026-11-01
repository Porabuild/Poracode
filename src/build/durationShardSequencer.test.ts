import { describe, expect, it } from "vitest";
import { assignDurationShards } from "./durationShardSequencer";

const units = (paths: string[]) => paths.map((path) => ({ id: `node:${path}`, path }));

describe("assignDurationShards", () => {
  it("covers every file exactly once across shards", () => {
    const files = units(Array.from({ length: 50 }, (_, index) => `src/f${index}.test.ts`));
    const durations = Object.fromEntries(files.map((file, index) => [file.path, index * 100]));

    const shards = assignDurationShards(files, 8, durations);

    expect(shards).toHaveLength(8);
    expect(shards.flat().toSorted()).toEqual(files.map((file) => file.id).toSorted());
  });

  it("keeps the slowest files apart and balances the rest by duration", () => {
    const durations = {
      "src/slow-a.test.ts": 100_000,
      "src/slow-b.test.ts": 90_000,
      ...Object.fromEntries(
        Array.from({ length: 40 }, (_, index) => [`src/f${index}.test.ts`, 5_000]),
      ),
    };
    const shards = assignDurationShards(units(Object.keys(durations)), 2, durations);
    const load = (shard: string[]) =>
      shard.reduce(
        (sum, id) => sum + durations[id.slice("node:".length) as keyof typeof durations],
        0,
      );

    expect(shards[0]).toContain("node:src/slow-a.test.ts");
    expect(shards[1]).toContain("node:src/slow-b.test.ts");
    expect(Math.abs(load(shards[0]!) - load(shards[1]!))).toBeLessThanOrEqual(10_000);
  });

  it("assigns the same shards regardless of input order", () => {
    const files = units(["src/a.test.ts", "src/b.test.ts", "src/c.test.ts", "src/d.test.ts"]);
    const durations = { "src/a.test.ts": 300, "src/b.test.ts": 300, "src/c.test.ts": 900 };

    expect(assignDurationShards(files.toReversed(), 2, durations)).toEqual(
      assignDurationShards(files, 2, durations),
    );
  });

  it("weighs files without a recorded time as the median", () => {
    const durations = { "src/a.test.ts": 1_000, "src/b.test.ts": 1_000, "src/c.test.ts": 50_000 };
    const shards = assignDurationShards(
      units(["src/a.test.ts", "src/b.test.ts", "src/c.test.ts", "src/new.test.ts"]),
      2,
      durations,
    );

    expect(shards[0]).toEqual(["node:src/c.test.ts"]);
    expect(shards[1]).toHaveLength(3);
  });
});
