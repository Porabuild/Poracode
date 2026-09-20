// Zero-client continuity drill child (Gate 2.2 / S2.3, Gates 2-3 Batch 1
// freeze evidence, Lane 1C). Forked by zeroClientContinuity.test.ts with the
// repo TS register; not a vitest file.
//
// Real ownership substrate, real process, real SIGTERM:
// - HostOwnerController headless acquire -> owned key initialization ->
//   markReady (real lease, real owned root);
// - the real HostControlServer publishing discovery for the parent;
// - a real SettingsAuthority opened on the owner lease, so the drill effect
//   commits through the same compare-and-swap the composition uses;
// - the real ScheduleService tick firing a due effect with ZERO clients
//   attached; the effect writes a marker file and commits a settings field.
//
// Declared out of scope here (covered by the freeze live run against
// dist/main/server.cjs, see tmp/v4-g23-batch1/lane-1c/NOTES.md): the
// supervisor fork and the remote HTTP/WS server itself — they boot only from
// the packaged artifact, and remote clients play no role in the zero-client
// invariant this drill proves.
import { appendFileSync } from "node:fs";
import { HostControlServer } from "@/backend/ownership/HostControlServer";
import { HostOwnerController } from "@/backend/ownership/HostOwnerController";
import { SettingsAuthority } from "@/backend/settings/SettingsAuthority";
import { SettingsCompatWriter } from "@/backend/settings/settingsCompatWrites";
import { ScheduleService, type ScheduleStore } from "@/main/schedules/ScheduleService";
import { installShutdown } from "@/server/cliRuntime";
import type { ScheduledTask } from "@/shared/contracts";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote/protocol";
import { configureSecretStorageKey } from "@/shared/secretStorage";
import { REAL_HOST_FIXTURE_KEY } from "./realHostRoot";

const profileNamespace: string = process.argv[2] ?? "";
const effectMarker: string = process.argv[3] ?? "";
if (!profileNamespace || !effectMarker) {
  throw new Error("usage: zeroClientOwnerChild.ts <profileNamespace> <effectMarkerPath>");
}

const rows: ScheduledTask[] = [];
const store: ScheduleStore = {
  list: () => [...rows],
  get: (id) => rows.find((task) => task.id === id) ?? null,
  upsert: (task) => {
    const index = rows.findIndex((candidate) => candidate.id === task.id);
    if (index === -1) rows.push(task);
    else rows[index] = task;
  },
  delete: (id) => {
    const index = rows.findIndex((candidate) => candidate.id === id);
    if (index !== -1) rows.splice(index, 1);
  },
};

async function serve(): Promise<void> {
  const owner = HostOwnerController.acquire(profileNamespace, "headless");
  const runtime = await owner.initialize({
    mode: "headless",
    environmentKey: REAL_HOST_FIXTURE_KEY,
  });
  configureSecretStorageKey(runtime.secretStorageKey);
  owner.markReady();

  const control = new HostControlServer({
    lease: owner.lease,
    describe: () => ({
      state: "ready",
      remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
      endpoint: null,
      capabilities: {
        ssh: true,
        browserPanel: false,
        chromeBridge: true,
        computerUse: true,
        nativeSecrets: false,
        portForward: true,
        autoUpdate: false,
        osNotifications: false,
      },
    }),
    // The drill never pairs a client; the zero-client invariant needs no
    // attach endpoint.
    issuePairing: () => Promise.reject(new Error("The drill owner mints no pairings.")),
  });
  await control.start();

  const authority = await SettingsAuthority.open({
    lease: owner.lease,
    assertPersistentCredentials: () => {},
  });
  const writes = new SettingsCompatWriter(authority);

  const schedules = new ScheduleService({
    store,
    runTask: async (task) => {
      try {
        // Commit through the owner authority first, then mark: the marker in
        // the parent proves both the firing and the committed settings edit.
        const result = await writes.editSettingsField("guiChatFontSize", (settings) =>
          Math.min((settings.guiChatFontSize ?? 13) + 1, 20),
        );
        if (result.status !== "committed") throw new Error(`Effect edit ${result.status}`);
        appendFileSync(effectMarker, `${new Date().toISOString()} ${task.name}\n`);
        return "ok";
      } catch (error) {
        // ScheduleService stores run failures in lastError only; surface them
        // so the drill's parent can show child stderr.
        console.error("[poracode-zero-client] effect run failed:", error);
        throw error;
      }
    },
    tickIntervalMs: 200,
  });
  const task = schedules.create({
    name: "zero-client effect",
    prompt: "Drill effect; the supervisor is intentionally not involved.",
    agentKind: "claude",
    config: { model: "drill" },
    recurrence: { kind: "hourly", minute: 0 },
    enabled: true,
  });
  schedules.start();
  // The drill owns the store: pin the task due immediately AFTER start, whose
  // post-startup normalization would otherwise recompute nextRunAt (and a
  // past `once` recurrence is normalized to never-run).
  store.upsert({ ...task, nextRunAt: new Date(Date.now() - 1_000).toISOString() });

  // The real CLI shutdown chain: SIGTERM -> drain -> exit 0; a failed join
  // keeps live handles and reports exitCode 1 instead.
  installShutdown("[poracode-zero-client]", async () => {
    schedules.dispose();
    await authority.close();
    await control.dispose();
    await owner.close();
  });

  process.send?.({
    type: "ready",
    ownerGeneration: owner.lease.generation,
    profileNamespace: owner.lease.paths.profileNamespace,
    dataRoot: runtime.paths.baseDir,
  });
}

serve().catch((error: unknown) => {
  console.error("[poracode-zero-client] failed to start:", error);
  process.exit(1);
});
