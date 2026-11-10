import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrateLegacyService } from "./cliInstallMigration";
import { readCliInstallMigration } from "./cliInstallMigrationJournal";
import {
  readServiceRegistration,
  serviceRegistrationId,
  writeServiceRegistration,
  type ServerServiceRegistration,
} from "./serverServiceRegistration";
import type { ServiceCliOptions, ServiceLifecycleDeps } from "./serverService";

describe.runIf(process.platform === "win32")("Windows in-place service profile migration", () => {
  it("requires a stopped task before moving to the nightly profile, preserving stable data", async () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "poracode-win-profile-")));
    try {
      const prefix = join(home, "server");
      const stable = join(home, ".poracode");
      const nightly = join(home, ".poracode-nightly");
      const release = join(prefix, "releases", "old");
      mkdirSync(join(release, "lib"), { recursive: true });
      mkdirSync(join(release, "resources"));
      mkdirSync(join(release, "runtime"));
      mkdirSync(stable);
      writeFileSync(join(stable, "keep.txt"), "stable data");
      writeFileSync(
        join(release, "package.json"),
        JSON.stringify({ version: "2.0.0-nightly.202611091529" }),
      );
      writeFileSync(join(release, "lib", "server.cjs"), "server");
      writeFileSync(join(release, "runtime", "node.exe"), "node");
      writeFileSync(
        join(release, "standalone.json"),
        JSON.stringify({
          formatVersion: 1,
          kind: "poracode-standalone-runtime",
          version: "2.0.0-nightly.202611091529",
          target: "win32-x64",
          node: { version: "26.13.0", executable: "runtime/node.exe" },
        }),
      );
      symlinkSync(release, join(prefix, "current"), "junction");
      const account = { kind: "sid" as const, id: "S-1-5-21-1-2-3-1001" };
      const registration = (profile: string, nonce: string): ServerServiceRegistration => ({
        formatVersion: 2,
        state: "installed",
        registrationId: serviceRegistrationId(profile, account),
        registrationNonce: nonce,
        manager: "windows-task",
        account,
        profileNamespace: profile,
        installPrefix: prefix,
        nodeExecutable: join(release, "runtime", "node.exe"),
        entrypointRelative: "current/lib/server.cjs",
        configPath: null,
        definition: { locator: join(prefix, "service-definition-v1.json"), sha256: "a".repeat(64) },
        launcher: {
          protocolVersion: 1,
          relativePath: "service-launcher-v1.exe",
          bytes: 1,
          sha256: "b".repeat(64),
        },
      });
      writeServiceRegistration(registration(stable, "c".repeat(48)));
      let running = true;
      let interrupt = false;
      const actions: string[] = [];
      const service = async (
        profile: string,
        options: ServiceCliOptions,
        deps?: ServiceLifecycleDeps,
      ) => {
        actions.push(options.action);
        if (options.action === "status")
          return {
            native: {
              ActiveState: running ? "active" : "inactive",
              MainPID: running ? "123" : "0",
            },
            ownerGeneration: running ? "g" : null,
            ownerManaged: running,
          };
        if (options.action === "uninstall") {
          if (interrupt) {
            interrupt = false;
            throw new Error("interrupted before retirement");
          }
          rmSync(join(prefix, "service-registration.json"));
        }
        if (options.action === "install")
          writeServiceRegistration(registration(profile, deps!.registrationNonce!));
        return {};
      };
      const input = {
        oldPrefix: prefix,
        newPrefix: prefix,
        releaseRoot: release,
        targetProfile: nightly,
        allowRunning: true,
        service,
        assertTargetAvailable: async () => ({ assertActive() {}, release() {} }),
      };
      await expect(migrateLegacyService(input)).rejects.toThrow(/Stop the existing service with/u);
      expect(actions).toEqual(["status"]);
      expect(readServiceRegistration(prefix)?.profileNamespace).toBe(stable);
      running = false;
      interrupt = true;
      await expect(migrateLegacyService(input)).rejects.toThrow(/interrupted before retirement/u);
      expect(readCliInstallMigration(prefix, "profile")?.phase).toBe("prepared");
      running = true;
      await expect(migrateLegacyService(input)).rejects.toThrow(/Stop the existing service with/u);
      expect(readServiceRegistration(prefix)?.profileNamespace).toBe(stable);
      running = false;
      await migrateLegacyService(input);
      expect(readServiceRegistration(prefix)?.profileNamespace).toBe(nightly);
      expect(actions).toEqual([
        "status",
        "status",
        "status",
        "uninstall",
        "status",
        "status",
        "uninstall",
        "install",
      ]);
      expect(readFileSync(join(stable, "keep.txt"), "utf8")).toBe("stable data");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
