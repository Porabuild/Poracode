import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hostRuntimeTarget } from "../../scripts/server-release-install.mjs";
import { installServiceRelease } from "./cliServiceInstall";
import { standaloneArchiveFileName } from "./cliSelfUpdate";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(markerVersion = "2.0.0-nightly.202611091529") {
  const root = mkdtempSync(join(tmpdir(), "poracode-service-install-"));
  roots.push(root);
  const prefix = join(root, "prefix");
  const stage = join(root, "stage");
  mkdirSync(join(stage, "runtime"), { recursive: true });
  mkdirSync(join(stage, "lib"), { recursive: true });
  writeFileSync(join(stage, "runtime", "node"), "node");
  writeFileSync(join(stage, "lib", "server.cjs"), "server");
  writeFileSync(
    join(stage, "standalone.json"),
    JSON.stringify({
      formatVersion: 1,
      kind: "poracode-standalone-runtime",
      version: markerVersion,
      target: hostRuntimeTarget(),
      node: { version: "26.13.0", executable: "runtime/node" },
    }),
  );
  const archive = join(root, process.platform === "win32" ? "runtime.zip" : "runtime.tar.gz");
  const tar =
    process.platform === "win32"
      ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
      : "tar";
  execFileSync(tar, [process.platform === "win32" ? "-a" : "-z", "-cf", archive, "-C", stage, "."]);
  const bytes = readFileSync(archive);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const version = "2.0.0-nightly.202611091529";
  const name = standaloneArchiveFileName(version, hostRuntimeTarget());
  const fetchImpl = async (url: string) =>
    url.endsWith("SHA256SUMS") ? new Response(`${sha}  ${name}\n`) : new Response(bytes);
  return { root, prefix, archive, sha, version, fetchImpl };
}

describe("service release provisioning", () => {
  it("verifies the release and publishes a service-owned runtime", async () => {
    const f = fixture();
    await installServiceRelease({ prefix: f.prefix, version: f.version, fetchImpl: f.fetchImpl });
    expect(readlinkSync(join(f.prefix, "current")).replaceAll("\\", "/")).toMatch(
      /releases\/release-/u,
    );
    expect(readFileSync(join(f.prefix, "current", "lib", "server.cjs"), "utf8")).toBe("server");
  });

  it("rejects an archive for a different version before publishing current", async () => {
    const f = fixture("1.0.0");
    await expect(
      installServiceRelease({ prefix: f.prefix, version: f.version, fetchImpl: f.fetchImpl }),
    ).rejects.toThrow(/does not match/u);
    expect(existsSync(join(f.prefix, "current"))).toBe(false);
    const correct = fixture();
    await installServiceRelease({
      prefix: f.prefix,
      version: f.version,
      fetchImpl: correct.fetchImpl,
    });
    expect(existsSync(join(f.prefix, "current", "lib", "server.cjs"))).toBe(true);
  });

  it("preserves a pre-existing current entry and refuses a bad local checksum", async () => {
    const f = fixture();
    mkdirSync(f.prefix);
    mkdirSync(join(f.prefix, "current"));
    await expect(
      installServiceRelease({ prefix: f.prefix, version: f.version, fetchImpl: f.fetchImpl }),
    ).rejects.toThrow(/not empty/u);
    expect(existsSync(join(f.prefix, "current"))).toBe(true);
    rmSync(join(f.prefix, "current"), { recursive: true });
    await expect(
      installServiceRelease({
        prefix: f.prefix,
        version: f.version,
        env: { PORACODE_SERVER_TARBALL: f.archive, PORACODE_SERVER_TARBALL_SHA256: "0".repeat(64) },
      }),
    ).rejects.toThrow(/Checksum mismatch/u);
    expect(existsSync(join(f.prefix, "current"))).toBe(false);
  });

  it("accepts the same verified local archive used by an offline npm launcher", async () => {
    const f = fixture();
    await installServiceRelease({
      prefix: f.prefix,
      version: f.version,
      env: { PORACODE_SERVER_TARBALL: f.archive, PORACODE_SERVER_TARBALL_SHA256: f.sha },
    });
    expect(existsSync(join(f.prefix, "current", "lib", "server.cjs"))).toBe(true);
  });

  it("reuses the npm-pinned cache offline and survives removal of the cache", async () => {
    const f = fixture();
    const cached = join(f.root, "stage");
    const entrySha = createHash("sha256")
      .update(readFileSync(join(cached, "lib", "server.cjs")))
      .digest("hex");
    writeFileSync(
      join(cached, ".poracode-runtime.json"),
      JSON.stringify({
        formatVersion: 1,
        version: f.version,
        target: hostRuntimeTarget(),
        tarballSha256: f.sha,
        entrySha256: entrySha,
      }),
    );
    await installServiceRelease({
      prefix: f.prefix,
      version: f.version,
      releaseRoot: cached,
      env: {
        PORACODE_LAUNCHER_RUNTIME_ROOT: cached,
        PORACODE_LAUNCHER_RUNTIME_SHA256: f.sha,
        PORACODE_LAUNCHER_RUNTIME_TARGET: hostRuntimeTarget(),
      },
      fetchImpl: async () => {
        throw new Error("network must not be used");
      },
    });
    writeFileSync(join(cached, "lib", "server.cjs"), "cache changed after install");
    expect(readFileSync(join(f.prefix, "current", "lib", "server.cjs"), "utf8")).toBe("server");
    rmSync(cached, { recursive: true });
    expect(readFileSync(join(f.prefix, "current", "lib", "server.cjs"), "utf8")).toBe("server");
  });

  it("preserves an unrelated custom prefix instead of adopting it", async () => {
    const f = fixture();
    mkdirSync(f.prefix);
    writeFileSync(join(f.prefix, "sentinel"), "user data");
    await expect(
      installServiceRelease({ prefix: f.prefix, version: f.version, fetchImpl: f.fetchImpl }),
    ).rejects.toThrow(/not empty/u);
    expect(readFileSync(join(f.prefix, "sentinel"), "utf8")).toBe("user data");
  });

  it("rejects a cached artifact whose digest differs from the launcher's pin", async () => {
    const f = fixture();
    const cached = join(f.root, "stage");
    writeFileSync(
      join(cached, ".poracode-runtime.json"),
      JSON.stringify({
        formatVersion: 1,
        version: f.version,
        target: hostRuntimeTarget(),
        tarballSha256: "1".repeat(64),
        entrySha256: "2".repeat(64),
      }),
    );
    await expect(
      installServiceRelease({
        prefix: f.prefix,
        version: f.version,
        releaseRoot: cached,
        env: {
          PORACODE_LAUNCHER_RUNTIME_ROOT: cached,
          PORACODE_LAUNCHER_RUNTIME_SHA256: f.sha,
          PORACODE_LAUNCHER_RUNTIME_TARGET: hostRuntimeTarget(),
        },
      }),
    ).rejects.toThrow(/no longer matches/u);
    expect(existsSync(f.prefix)).toBe(false);
  });
});
