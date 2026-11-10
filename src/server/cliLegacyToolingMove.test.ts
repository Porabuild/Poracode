import {
  existsSync,
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
import { relocateLegacyTooling } from "./cliLegacyToolingMove";
import type { ServerServiceRegistration } from "./serverServiceRegistration";
import { acquireServerUpgradeLock } from "./serverUpgradeLock";

describe.runIf(process.platform !== "win32")("legacy tooling relocation", () => {
  it("moves idle installer and cache trees outside the profile without discarding extra files", () => {
    const home = mkdtempSync(join(tmpdir(), "poracode-tooling-move-"));
    try {
      const oldServer = join(home, ".poracode", "server");
      const release = join(oldServer, "releases", "2.0.0");
      const cache = join(home, ".poracode", "runtime", "2.0.0", "darwin-arm64");
      for (const dir of [release, cache]) {
        mkdirSync(dir, { recursive: true });
        mkdirSync(join(dir, "lib"), { recursive: true });
        mkdirSync(join(dir, "resources"), { recursive: true });
        writeFileSync(join(dir, "lib", "server.cjs"), "server");
        writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "2.0.0" }));
        writeFileSync(
          join(dir, "standalone.json"),
          JSON.stringify({
            formatVersion: 1,
            kind: "poracode-standalone-runtime",
            version: "2.0.0",
            target: "darwin-arm64",
            node: { version: "26.13.0", executable: "runtime/node" },
          }),
        );
      }
      symlinkSync("releases/2.0.0", join(oldServer, "current"));
      writeFileSync(join(oldServer, "user-config.json"), "preserve me");
      writeFileSync(
        join(cache, ".poracode-runtime.json"),
        JSON.stringify({
          formatVersion: 1,
          version: "2.0.0",
          target: "darwin-arm64",
          tarballSha256: "a".repeat(64),
          entrySha256: "b".repeat(64),
        }),
      );
      const prefix = join(home, ".local", "share", "poracode", "server");
      const result = relocateLegacyTooling({ home, prefix, env: {}, isIdle: () => true });
      expect(result.moved).toHaveLength(2);
      expect(existsSync(oldServer)).toBe(false);
      expect(existsSync(join(home, ".poracode", "runtime"))).toBe(false);
      expect(
        readFileSync(
          join(home, ".local", "share", "poracode", "legacy", "server", "user-config.json"),
          "utf8",
        ),
      ).toBe("preserve me");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("keeps a busy legacy runtime and an unrelated runtime directory in place", () => {
    const home = mkdtempSync(join(tmpdir(), "poracode-tooling-busy-"));
    try {
      const runtime = join(home, ".poracode", "runtime");
      mkdirSync(runtime, { recursive: true });
      writeFileSync(join(runtime, "notes.txt"), "user file");
      const result = relocateLegacyTooling({
        home,
        prefix: join(home, "prefix"),
        env: {},
        isIdle: () => false,
      });
      expect(result.retained).toEqual([runtime]);
      expect(readFileSync(join(runtime, "notes.txt"), "utf8")).toBe("user file");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("does not move a service's explicit config path out from under it", () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "poracode-tooling-config-")));
    try {
      const server = join(home, ".poracode", "server");
      const release = join(server, "releases", "2.0.0");
      mkdirSync(release, { recursive: true });
      mkdirSync(join(release, "lib"), { recursive: true });
      mkdirSync(join(release, "resources"), { recursive: true });
      writeFileSync(join(release, "lib", "server.cjs"), "server");
      writeFileSync(join(release, "package.json"), JSON.stringify({ version: "2.0.0" }));
      writeFileSync(
        join(release, "standalone.json"),
        JSON.stringify({
          formatVersion: 1,
          kind: "poracode-standalone-runtime",
          version: "2.0.0",
          target: "darwin-arm64",
          node: { version: "26.13.0", executable: "runtime/node" },
        }),
      );
      symlinkSync("releases/2.0.0", join(server, "current"));
      const config = join(server, "custom-config.json");
      writeFileSync(config, "service config");
      const result = relocateLegacyTooling({
        home,
        prefix: join(home, "prefix"),
        env: {},
        isIdle: () => true,
        readRegistration: () => ({ configPath: config }) as ServerServiceRegistration,
      });
      expect(result.retained).toEqual([server]);
      expect(readFileSync(config, "utf8")).toBe("service config");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("does not move an old installation while another lifecycle operation holds its lock", () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "poracode-tooling-lock-")));
    try {
      const server = join(home, ".poracode", "server");
      const release = join(server, "releases", "2.0.0");
      mkdirSync(join(release, "lib"), { recursive: true });
      mkdirSync(join(release, "resources"));
      writeFileSync(join(release, "lib", "server.cjs"), "server");
      writeFileSync(join(release, "package.json"), JSON.stringify({ version: "2.0.0" }));
      writeFileSync(
        join(release, "standalone.json"),
        JSON.stringify({
          formatVersion: 1,
          kind: "poracode-standalone-runtime",
          version: "2.0.0",
          target: "darwin-arm64",
          node: { version: "26.13.0", executable: "runtime/node" },
        }),
      );
      symlinkSync("releases/2.0.0", join(server, "current"));
      const lock = acquireServerUpgradeLock({ prefix: server, releaseId: "other-operation" });
      try {
        const result = relocateLegacyTooling({
          home,
          prefix: join(home, "prefix"),
          env: {},
          isIdle: () => true,
        });
        expect(result.retained).toEqual([server]);
        expect(existsSync(join(server, "current"))).toBe(true);
      } finally {
        lock.release();
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
