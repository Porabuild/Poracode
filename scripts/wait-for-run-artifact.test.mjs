import assert from "node:assert/strict";
import test from "node:test";
import { waitForRunArtifact } from "./wait-for-run-artifact.mjs";

const RUNNING = [{ name: "tui_binaries / manifest", conclusion: null }];

function fakeGh({ artifactsAfter = 0, jobs = RUNNING, failFirst = 0 } = {}) {
  const calls = [];
  let polls = 0;
  let failures = 0;
  const gh = (args) => {
    calls.push(args);
    if (failures < failFirst) {
      failures++;
      throw new Error("HTTP 502");
    }
    if (args[0] === "run") return "";
    if (args[1].includes("/artifacts")) {
      polls++;
      return polls > artifactsAfter ? "poracode-tui-linux\ntui-manifest\n" : "poracode-tui-linux\n";
    }
    // The real query's jq selects jobs named after the producer prefix.
    return JSON.stringify(jobs.filter((job) => job.name.startsWith("tui_binaries /")));
  };
  return { gh, calls };
}

const base = {
  artifact: "tui-manifest",
  directory: "resources/tui",
  producerPrefix: "tui_binaries /",
  repository: "Porabuild/Poracode",
  runId: "42",
  sleep: async () => {},
  log: () => {},
};

await test("downloads the artifact once the producer has uploaded it", async () => {
  const { gh, calls } = fakeGh({ artifactsAfter: 2 });
  await waitForRunArtifact({ ...base, gh });

  const downloads = calls.filter((args) => args[0] === "run");
  assert.deepEqual(downloads, [
    [
      "run",
      "download",
      "42",
      "-R",
      "Porabuild/Poracode",
      "-n",
      "tui-manifest",
      "-D",
      "resources/tui",
    ],
  ]);
  assert.equal(calls.filter((args) => args[1]?.includes("/artifacts")).length, 3);
});

await test("fails fast when a producer job fails instead of waiting out the timeout", async () => {
  const { gh, calls } = fakeGh({
    artifactsAfter: Infinity,
    jobs: [{ name: "tui_binaries / manifest", conclusion: "failure" }],
  });
  await assert.rejects(
    waitForRunArtifact({ ...base, gh }),
    /tui-manifest will not arrive: tui_binaries \/ manifest did not succeed/,
  );
  assert.equal(calls.filter((args) => args[0] === "run").length, 0);
});

await test("fails fast when no job matches the producer prefix", async () => {
  const { gh } = fakeGh({
    artifactsAfter: Infinity,
    jobs: [{ name: "build / build", conclusion: null }],
  });
  await assert.rejects(
    waitForRunArtifact({ ...base, gh }),
    /No job in this run is named "tui_binaries \/…"/,
  );
});

await test("rides out brief GitHub API failures", async () => {
  const { gh } = fakeGh({ failFirst: 2 });
  await waitForRunArtifact({ ...base, gh });
});

await test("gives up after repeated GitHub API failures", async () => {
  const { gh } = fakeGh({ failFirst: 10 });
  await assert.rejects(waitForRunArtifact({ ...base, gh }), /HTTP 502/);
});

await test("gives up after the timeout", async () => {
  const { gh } = fakeGh({ artifactsAfter: Infinity });
  let time = 0;
  await assert.rejects(
    waitForRunArtifact({
      ...base,
      gh,
      now: () => time,
      sleep: async () => {
        time += 10 * 60_000;
      },
    }),
    /Timed out after 3000s waiting for tui-manifest from "tui_binaries \/"/,
  );
});
