import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { ProcessPerformanceSampler } from "../processPerformanceSampler.ts";

const sampler = new ProcessPerformanceSampler();
if (process.argv[2] !== "unref") {
  await delay(50);
  const idle = sampler.sample();
  const ownCpuBefore = process.cpuUsage();
  const deadline = performance.now() + 100;
  let operations = 0;
  while (performance.now() < deadline) operations += 1;
  const ownCpu = process.cpuUsage(ownCpuBefore);
  if (typeof global.gc !== "function") throw new Error("Expected an explicit GC fixture runtime.");
  global.gc();
  await delay(40);
  const busy = sampler.sample();
  await delay(30);
  const drained = sampler.sample();
  sampler.dispose();
  process.stdout.write(`${JSON.stringify({ idle, busy, drained, ownCpu, operations })}\n`);
}
