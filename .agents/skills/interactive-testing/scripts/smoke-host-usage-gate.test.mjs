import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { useHostUsageStore } from "../../../../src/renderer/state/hostUsageStore.ts";

// Exercise the actual scenario and evaluator without importing the CLI entry,
// which would start its integration run. The store is the real current module.
const source = await readFile(new URL("./poracode-integration-smoke.mjs", import.meta.url), "utf8");
const start = source.indexOf('    case "remote-usage": {') + '    case "remote-usage": {'.length;
const end = source.indexOf('    case "remote-client": {', start);
assert.ok(start > 0 && end > start);
const body = source.slice(start, end).trim().replace(/}\s*$/, "");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const gate = new AsyncFunction("client", "evaluate", "assert", body);
const evaluateStart = source.indexOf("async function evaluate(");
const evaluateEnd = source.indexOf("async function screenshot(", evaluateStart);
const evaluate = new Function(`return (${source.slice(evaluateStart, evaluateEnd).trim()});`)();

void test("host usage gate awaits the CDP promise and preserves real protected host state", async () => {
  const protectedHosts = { existing: { snapshots: [{ authenticatedAs: "protected" }] } };
  const previous = useHostUsageStore.getState().hosts;
  useHostUsageStore.setState({ hosts: protectedHosts });
  const context = vm.createContext({
    window: { __poracodeDev: { loadHostUsage: async () => ({ useHostUsageStore }) } },
  });
  const observations = [],
    pending = [];
  const client = {
    send: async (method, params) => {
      assert.equal(method, "Runtime.evaluate");
      observations.push(params);
      const result = vm.runInContext(params.expression, context);
      pending.push(result);
      // CDP exposes a Promise remote object without a value until awaited.
      return params.awaitPromise
        ? { result: { type: "boolean", value: await result } }
        : { result: { type: "object", subtype: "promise" } };
    },
  };
  try {
    const detail = await gate(client, evaluate, assert);
    assert.match(detail, /separate host accounts/);
    assert.equal(observations.length, 1);
    assert.equal(observations[0].awaitPromise, true);
    await Promise.all(pending);
    assert.equal(useHostUsageStore.getState().hosts, protectedHosts);
    assert.equal(Object.hasOwn(useHostUsageStore.getState().hosts, "usage-smoke-a"), false);
    assert.equal(Object.hasOwn(useHostUsageStore.getState().hosts, "usage-smoke-b"), false);
  } finally {
    await Promise.all(pending);
    useHostUsageStore.setState({ hosts: previous });
  }
});

void test("a real false result or evaluation exception cannot qualify host isolation", async () => {
  await assert.rejects(
    () => gate({ send: async () => ({ result: { value: false } }) }, evaluate, assert),
    /host usage isolation/,
  );
  await assert.rejects(
    () =>
      gate(
        { send: async () => ({ exceptionDetails: { text: "fixture evaluation refused" } }) },
        evaluate,
        assert,
      ),
    /fixture evaluation refused/,
  );
});
