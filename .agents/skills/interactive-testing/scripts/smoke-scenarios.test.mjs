import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { areasForFile, isProductionFile } from "./smoke-scenarios.mjs";

await test("host usage changes require remote collection and isolation coverage", () => {
  for (const file of [
    "src/renderer/state/hostUsageStore.ts",
    "src/renderer/components/providers/hostUsage.ts",
    "src/renderer/views/SettingsOverlay/parts/HostUsageSettings.tsx",
  ]) {
    const area = areasForFile(file).find((candidate) => candidate.id === "remote-provider-usage");
    assert.ok(area);
    assert.ok(area.manual.includes("remote-usage"));
    assert.ok(area.automated.includes("settings"));
  }
});

await test("backend production files are production roots mapped to areas", () => {
  const backendFiles = [
    "src/backend/BackendHostCore.ts",
    "src/backend/BackendDurableServices.ts",
    "src/backend/electronIpcBackpressure.ts",
    "src/backend/index.ts",
    "src/backend/legacyMigrationWorker.ts",
  ];
  for (const file of backendFiles) {
    assert.ok(isProductionFile(file), `${file} must count as a production file`);
    assert.ok(areasForFile(file).length > 0, `${file} must map to a functional area`);
  }
  assert.equal(isProductionFile("src/backend/BackendHostCore.test.ts"), false);
  assert.equal(isProductionFile("src/backend/fixtures/helper.ts"), false);
});

await test("backend-only changes select baseline plus IPC runtime coverage", () => {
  const areas = areasForFile("src/backend/BackendHostCore.ts");
  assert.deepEqual(
    areas.map((area) => area.id),
    ["shared-runtime"],
  );
  const runtime = areas.find((area) => area.id === "shared-runtime");
  assert.ok(runtime);
  assert.ok(runtime.automated.includes("baseline"));
  assert.ok(runtime.manual.includes("ipc-roundtrip"));
});

await test("delegated-agent recovery changes require the host restart gate", () => {
  for (const file of [
    "src/backend/delegatedAgentBootSettle.ts",
    "src/shared/toolCallClassification.ts",
    "src/renderer/state/remote/delegatedAgentSnapshot.ts",
    "src/renderer/components/thread/ChatPane/parts/items/delegatedAgentResult.ts",
  ]) {
    assert.ok(areasForFile(file).some((area) => area.manual.includes("delegated-agent-recovery")));
  }
});

await test("backend browser proxy changes keep their existing area gates", () => {
  const areas = areasForFile("src/backend/BackendRemoteBrowserProxy.ts");
  assert.ok(areas.some((area) => area.id === "shared-runtime"));
  assert.ok(areas.some((area) => area.id === "browser" && area.automated.includes("browser")));
});

await test("host persistence and supervisor transport changes cannot disappear from smoke scope", () => {
  for (const file of [
    "src/host/db/runtimePayloadOrigins.ts",
    "src/host/db/migrations.ts",
    "src/host/supervisor/SupervisorClient.ts",
    "src/host/remote/server/runtimePersistence.ts",
  ]) {
    assert.ok(isProductionFile(file), `${file} must enter changed-file and full coverage`);
    const areas = areasForFile(file);
    assert.ok(areas.some((area) => area.id === "shared-runtime"));
    assert.ok(areas.some((area) => area.automated.includes("baseline")));
    assert.ok(areas.some((area) => area.manual.includes("ipc-roundtrip")));
  }
  assert.equal(isProductionFile("src/host/db/runtimePayloadOrigins.test.ts"), false);
  assert.equal(isProductionFile("src/host/fixtures/helper.ts"), false);
});

async function deviceGate() {
  const source = await readFile(
    new URL("./poracode-integration-smoke.mjs", import.meta.url),
    "utf8",
  );
  const marker = '    case "device-workspace": {';
  const index = source.indexOf(marker);
  assert.ok(index >= 0, "device workspace must have a deterministic mock gate");
  const end = source.indexOf('    case "file-editor": {', index);
  assert.ok(end > index);
  const body = source
    .slice(index + marker.length, end)
    .trim()
    .replace(/}\s*$/, "");
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  return new AsyncFunction("client", "evaluate", "assert", body);
}

function deviceGateClient({ versions = [1], status = 410, code = "device_session_expired" } = {}) {
  const calls = [];
  const host = {
    environment: async () => ({ capabilities: { deviceWorkspace: { versions } } }),
    ...Object.fromEntries(
      ["deviceFrame", "inspectDevice", "deviceAction"].map((method) => [
        method,
        async (...args) => {
          calls.push({ method, args });
          throw Object.assign(new Error("Denied"), { status, code });
        },
      ]),
    ),
  };
  const context = vm.createContext({
    window: {
      __poracodeDev: {
        loadHostDiagnostics: async () => ({
          loopback: { readManagedLoopbackActivation: () => ({ client: host }) },
        }),
      },
    },
  });
  return {
    calls,
    host,
    evaluate: async (_client, expression, awaitPromise) => {
      assert.equal(awaitPromise, true);
      return vm.runInContext(expression, context);
    },
  };
}

await test("device smoke rejects unattached capture, inspection and input without discovering or starting devices", async () => {
  const gate = await deviceGate();
  const fixture = deviceGateClient();
  const original = { ...fixture.host };
  assert.match(await gate({}, fixture.evaluate, assert), /unattached.*leases/);
  assert.deepEqual(
    fixture.calls.map((call) => call.method),
    ["deviceFrame", "inspectDevice", "deviceAction"],
  );
  for (const call of fixture.calls)
    assert.deepEqual(call.args.slice(0, 2), [
      "smoke-unattached-thread",
      "smoke-unattached-session",
    ]);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.calls[2].args[2])), {
    kind: "key",
    key: "home",
  });
  assert.deepEqual(fixture.host, original);
});

await test("device smoke refuses absent negotiation and incorrect lease denial instead of acknowledging hardware", async () => {
  const gate = await deviceGate();
  const absent = deviceGateClient({ versions: [] });
  await assert.rejects(() => gate({}, absent.evaluate, assert), /workspace v1/);
  assert.equal(absent.calls.length, 0);
  for (const patch of [{ status: 401 }, { status: 200 }, { code: "device_unavailable" }]) {
    const fixture = deviceGateClient(patch);
    await assert.rejects(() => gate({}, fixture.evaluate, assert), /unattached device leases/);
  }
});
