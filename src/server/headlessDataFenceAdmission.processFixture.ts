import { HostOwnerController } from "@/backend/ownership/HostOwnerController";
import { HostDataFence } from "@/backend/ownership/hostDataFence";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { getSqlite } from "@/host/db/connection";
import { createHeadlessRemoteHost, type HeadlessRemoteHost } from "./createHeadlessRemoteHost";

export type AdmissionOperation = "prepare" | "headless" | "cancel" | "lease" | "fence" | "dispose";
export interface AdmissionRequest {
  operation: AdmissionOperation;
  baseDir: string;
}
export interface AdmissionReply {
  ok: boolean;
  initializeCalls: number;
  schemaVersion?: number;
  error?: string;
}

let host: HeadlessRemoteHost | undefined;
let initializeCalls = 0;
const initialize = HostOwnerController.prototype.initialize;
// Observe the real entry without replacing root/key preparation or composition.
HostOwnerController.prototype.initialize = function (this: HostOwnerController, options) {
  initializeCalls++;
  return initialize.call(this, options);
};

async function run({ operation, baseDir }: AdmissionRequest): Promise<AdmissionReply> {
  initializeCalls = 0;
  try {
    if (operation === "prepare" || operation === "lease") {
      const owner = HostOwnerController.acquire(baseDir, "desktop");
      try {
        if (operation === "prepare") await owner.initialize({ mode: "headless" });
      } finally {
        await owner.close();
      }
    } else if (operation === "fence") {
      HostDataFence.acquire(resolveHostRootPaths(baseDir).dataFencePath).release();
    } else if (operation === "dispose") {
      await host?.dispose();
      host = undefined;
    } else {
      const cancellation = new AbortController();
      const creation = createHeadlessRemoteHost({
        appVersion: "9.9.9-test",
        baseDir,
        supervisorPath: "/fixture/unused-supervisor.cjs",
        wslHelpersDir: "/fixture/unused-wsl",
        host: "127.0.0.1",
        port: 0,
        signal: cancellation.signal,
      });
      // The free probe has been acquired synchronously; cancellation occurs
      // across its await, before release and the initialization boundary.
      if (operation === "cancel") cancellation.abort(new Error("fixture-startup-canceled"));
      host = await creation;
      const row = getSqlite()
        .prepare("SELECT value FROM app_state WHERE key = 'schema_version'")
        .get() as { value: string };
      return { ok: true, initializeCalls, schemaVersion: Number(row.value) };
    }
    return { ok: true, initializeCalls };
  } catch (error) {
    return {
      ok: false,
      initializeCalls,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

process.on("message", (request: AdmissionRequest) => {
  void run(request).then((reply) => process.send?.(reply));
});
