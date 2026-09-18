import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HostOwnerController } from "@/backend/ownership/HostOwnerController";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import type { ProcessCleanup } from "./processCleanup";

/** Synthetic fixture key only; never inherit the operator's storage key. */
export const REAL_HOST_FIXTURE_KEY = Buffer.alloc(32, 0x73).toString("base64");

export function trackRealHostPaths(profileNamespace: string, cleanup?: ProcessCleanup): void {
  const paths = resolveHostRootPaths(profileNamespace);
  for (const path of [
    paths.profileNamespace,
    paths.dataRoot,
    paths.electronUserDataRoot,
    paths.leasePath,
    paths.ownerRecordPath,
  ])
    cleanup?.trackTempDir(path);
}

export async function acquireRealHostFixtureRoot(profileNamespace: string) {
  const owner = HostOwnerController.acquire(profileNamespace, "headless");
  try {
    const runtime = await owner.initialize({
      mode: "headless",
      environmentKey: REAL_HOST_FIXTURE_KEY,
    });
    return { owner, runtime };
  } catch (error) {
    await owner.close();
    throw error;
  }
}

export async function prepareRealHostFixture(profileNamespace: string): Promise<string> {
  const { owner, runtime } = await acquireRealHostFixtureRoot(profileNamespace);
  try {
    const fixtureDir = join(runtime.paths.baseDir, "fixture-repo");
    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(join(fixtureDir, "README.md"), "native-e2e fixture\n", "utf8");
    const initialized = spawnSync("git", ["-C", fixtureDir, "init"], { stdio: "ignore" });
    if (initialized.error || initialized.status !== 0)
      throw new Error("Could not initialize the synthetic real-host Git fixture.");
    return fixtureDir;
  } finally {
    await owner.close();
  }
}
