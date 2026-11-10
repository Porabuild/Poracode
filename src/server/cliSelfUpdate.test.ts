import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hostRuntimeTarget } from "../../scripts/server-release-install.mjs";
import { standaloneArchiveName } from "../../scripts/standalone-runtime.mjs";
import {
  downloadVerifiedArchive,
  parseSha256Sums,
  resolveReleaseVersion,
  runSelfUpdate,
  standaloneArchiveFileName,
} from "./cliSelfUpdate";
import { resolveInstallerPrefix, SelfUpdateError } from "./installerPrefix";
import { parseSelfUpdateCliOptions, parseUninstallCliOptions } from "./cliParse";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const posix = process.platform !== "win32";

function tempDir(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "poracode-self-update-")));
  roots.push(root);
  return root;
}

function writeRelease(directory: string, version: string, target = hostRuntimeTarget()): void {
  mkdirSync(join(directory, "runtime"), { recursive: true });
  mkdirSync(join(directory, "lib"), { recursive: true });
  writeFileSync(join(directory, "runtime", "node"), "");
  writeFileSync(join(directory, "lib", "server.cjs"), "\n");
  writeFileSync(
    join(directory, "standalone.json"),
    JSON.stringify({
      formatVersion: 1,
      kind: "poracode-standalone-runtime",
      version,
      target,
      node: { version: "26.13.0", executable: "runtime/node" },
    }),
  );
}

/** An installer-managed prefix at 1.0.0 plus a served 2.0.0 release. */
function fixture() {
  const root = tempDir();
  const prefix = join(root, "prefix");
  writeRelease(join(prefix, "releases", "1.0.0"), "1.0.0");
  symlinkSync("releases/1.0.0", join(prefix, "current"));
  const stage = join(root, "stage");
  writeRelease(stage, "2.0.0");
  const name = standaloneArchiveFileName("2.0.0", hostRuntimeTarget());
  const archive = join(root, name);
  execFileSync("tar", ["-czf", archive, "-C", stage, "."], { stdio: "pipe" });
  const bytes = readFileSync(archive);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const requests: string[] = [];
  const fetchImpl = async (url: string) => {
    requests.push(url);
    if (url.endsWith("/v2.0.0/SHA256SUMS")) return new Response(`${sha}  ${name}\n`);
    if (url.endsWith(`/v2.0.0/${name}`)) return new Response(bytes);
    return new Response("missing", { status: 404 });
  };
  return { root, prefix, fetchImpl, requests };
}

describe("self-update helpers", () => {
  it("names archives exactly like the release builder", () => {
    for (const target of ["linux-x64", "darwin-arm64", "win32-x64"]) {
      expect(standaloneArchiveFileName("2.1.0", target)).toBe(
        standaloneArchiveName("2.1.0", target),
      );
    }
  });

  it("parses SHA256SUMS with optional binary markers", () => {
    const sums = parseSha256Sums(`${"A".repeat(64)}  a.zip\n${"b".repeat(64)} *b.tar.gz\nnoise\n`);
    expect(sums.get("a.zip")).toBe("a".repeat(64));
    expect(sums.get("b.tar.gz")).toBe("b".repeat(64));
  });

  it("resolves explicit, stable and nightly versions", async () => {
    expect(await resolveReleaseVersion({ version: "v2.1.0", channel: "stable" })).toBe("2.1.0");
    await expect(resolveReleaseVersion({ version: "latest!", channel: "stable" })).rejects.toThrow(
      SelfUpdateError,
    );
    const stable = async () => Response.json({ tag_name: "v2.1.0" });
    expect(await resolveReleaseVersion({ channel: "stable", fetchImpl: stable })).toBe("2.1.0");
    const nightly = async () =>
      Response.json([{ tag_name: "v2.1.0" }, { tag_name: "v2.2.0-nightly.202611080110" }]);
    expect(await resolveReleaseVersion({ channel: "nightly", fetchImpl: nightly })).toBe(
      "2.2.0-nightly.202611080110",
    );
  });

  it("wraps network and parse failures in SelfUpdateError", async () => {
    const offline = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(resolveReleaseVersion({ channel: "stable", fetchImpl: offline })).rejects.toThrow(
      /Could not reach/u,
    );
    await expect(resolveReleaseVersion({ channel: "nightly", fetchImpl: offline })).rejects.toThrow(
      SelfUpdateError,
    );
    const html = async () =>
      new Response("<html>", { status: 200, headers: { "content-type": "text/html" } });
    await expect(resolveReleaseVersion({ channel: "stable", fetchImpl: html })).rejects.toThrow(
      /unexpected response/u,
    );
    await expect(
      downloadVerifiedArchive({
        base: "https://example.test",
        version: "2.0.0",
        target: hostRuntimeTarget(),
        directory: tempDir(),
        fetchImpl: offline,
      }),
    ).rejects.toThrow(SelfUpdateError);
  });

  it("parses update and uninstall options strictly", () => {
    expect(parseSelfUpdateCliOptions(["2.1.0", "--json"])).toEqual({
      version: "2.1.0",
      json: true,
    });
    expect(parseSelfUpdateCliOptions(["--channel", "nightly"])).toEqual({
      channel: "nightly",
      json: false,
    });
    expect(() => parseSelfUpdateCliOptions(["2.1.0", "--channel", "stable"])).toThrow(/not both/u);
    expect(() => parseSelfUpdateCliOptions(["--channel", "beta"])).toThrow(/stable or nightly/u);
    expect(() => parseSelfUpdateCliOptions(["--prefix", "--json"])).toThrow(/requires a path/u);
    expect(parseUninstallCliOptions(["--yes", "--prefix", "/p"])).toEqual({
      prefix: "/p",
      yes: true,
      json: false,
    });
    expect(() => parseUninstallCliOptions(["--prefix", "--yes"])).toThrow(/requires a path/u);
    expect(() => parseUninstallCliOptions(["--bin-dir", "--json"])).toThrow(/requires a path/u);
    expect(() => parseUninstallCliOptions(["--force"])).toThrow(/Unknown uninstall argument/u);
  });
});

describe.runIf(posix)("runSelfUpdate", () => {
  it("refuses a channel change before downloading or touching the stable profile", async () => {
    const context = fixture();
    await expect(
      runSelfUpdate(
        { version: "2.0.0-nightly.202611100001", json: false },
        { releaseRoot: join(context.prefix, "releases", "1.0.0"), fetchImpl: context.fetchImpl },
      ),
    ).rejects.toThrow(/separate profiles/u);
    expect(context.requests).toEqual([]);
    expect(readlinkSync(join(context.prefix, "current"))).toBe("releases/1.0.0");
  });
  it("refuses an automatic downgrade while preserving the selected release", async () => {
    const context = fixture();
    const result = await runSelfUpdate(
      { version: "0.9.0", json: false },
      {
        releaseRoot: join(context.prefix, "releases", "1.0.0"),
        onlyIfNewer: true,
        fetchImpl: context.fetchImpl,
      },
    );
    expect(result.outcome).toBe("current");
    expect(readlinkSync(join(context.prefix, "current"))).toBe("releases/1.0.0");
    expect(context.requests).toEqual([]);
  });

  it("updates from the launcher's pinned cache without fetching a second archive", async () => {
    const context = fixture();
    const cached = join(context.root, "stage");
    const sha = "a".repeat(64);
    const entrySha = createHash("sha256")
      .update(readFileSync(join(cached, "lib", "server.cjs")))
      .digest("hex");
    writeFileSync(
      join(cached, ".poracode-runtime.json"),
      JSON.stringify({
        formatVersion: 1,
        version: "2.0.0",
        target: hostRuntimeTarget(),
        tarballSha256: sha,
        entrySha256: entrySha,
      }),
    );
    const result = await runSelfUpdate(
      { version: "2.0.0", prefix: context.prefix, json: false },
      {
        releaseRoot: cached,
        onlyIfNewer: true,
        env: {
          PORACODE_LAUNCHER_RUNTIME_ROOT: cached,
          PORACODE_LAUNCHER_RUNTIME_SHA256: sha,
          PORACODE_LAUNCHER_RUNTIME_TARGET: hostRuntimeTarget(),
        },
        fetchImpl: async () => {
          throw new Error("network must not be used");
        },
        probeOwner: async () => null,
      },
    );
    expect(result.outcome).toBe("installed");
    expect(readlinkSync(join(context.prefix, "current"))).toBe("releases/2.0.0");
  });

  it("rechecks migration custody under the update lock after downloading", async () => {
    const context = fixture();
    const fetchImpl = async (url: string) => {
      const response = await context.fetchImpl(url);
      if (!url.endsWith("SHA256SUMS")) {
        writeFileSync(
          join(context.prefix, "legacy-install-migration.json"),
          JSON.stringify({
            formatVersion: 2,
            oldPrefix: "/old",
            newPrefix: context.prefix,
            oldProfile: "/profile",
            newProfile: "/profile-nightly",
            oldNonce: "a".repeat(48),
            newNonce: "b".repeat(48),
            oldRegistrationId: `poracode-${"c".repeat(32)}`,
            newRegistrationId: `poracode-${"d".repeat(32)}`,
            account: { kind: "uid", id: "1" },
            oldConfigPath: null,
            newConfigPath: null,
            oldReleaseVersion: "1.0.0",
            oldEntrypointSha256: "d".repeat(64),
            newReleaseVersion: "1.0.0",
            newEntrypointSha256: "d".repeat(64),
            ownerGeneration: null,
            nativeMainPid: "0",
            nativeState: "inactive",
            wasRunning: false,
            phase: "prepared",
          }),
        );
      }
      return response;
    };
    await expect(
      runSelfUpdate(
        { version: "2.0.0", json: false },
        {
          releaseRoot: join(context.prefix, "releases", "1.0.0"),
          fetchImpl,
          probeOwner: async () => null,
        },
      ),
    ).rejects.toThrow(/install migration .* incomplete/u);
    expect(readlinkSync(join(context.prefix, "current"))).toBe("releases/1.0.0");
  });

  it("installs the verified release beside the current one and moves current", async () => {
    const context = fixture();
    const result = await runSelfUpdate(
      { version: "2.0.0", json: false },
      {
        releaseRoot: join(context.prefix, "releases", "1.0.0"),
        env: { PORACODE_RELEASE_BASE_URL: "https://mirror.invalid/download/" },
        fetchImpl: context.fetchImpl,
        probeOwner: async () => null,
      },
    );
    expect(result).toMatchObject({
      ok: true,
      outcome: "installed",
      version: "2.0.0",
      previous: "1.0.0",
    });
    expect(readlinkSync(join(context.prefix, "current"))).toBe("releases/2.0.0");
    expect(existsSync(join(context.prefix, "releases", "1.0.0", "standalone.json"))).toBe(true);
    expect(context.requests[0]).toBe("https://mirror.invalid/download/v2.0.0/SHA256SUMS");
    const again = await runSelfUpdate(
      { version: "2.0.0", json: false },
      { releaseRoot: join(context.prefix, "releases", "2.0.0"), fetchImpl: context.fetchImpl },
    );
    expect(again.outcome).toBe("current");
  });

  it("keeps the previous release and prunes older installer releases", async () => {
    const context = fixture();
    writeRelease(join(context.prefix, "releases", "0.9.0"), "0.9.0");
    mkdirSync(join(context.prefix, "releases", ".staging-abc"));
    mkdirSync(join(context.prefix, "releases", "foreign"));
    const cacheRoot = join(context.root, "tui-cache");
    mkdirSync(join(cacheRoot, "0.9.0", "x"), { recursive: true });
    mkdirSync(join(cacheRoot, "1.0.0", "x"), { recursive: true });
    const result = await runSelfUpdate(
      { version: "2.0.0", json: false },
      {
        releaseRoot: join(context.prefix, "releases", "1.0.0"),
        env: { ...process.env, PORACODE_TUI_CACHE_DIR: cacheRoot },
        fetchImpl: context.fetchImpl,
        probeOwner: async () => null,
      },
    );
    expect(result.detail).toMatch(/1\.0\.0 is kept .* 1 older release\(s\) were removed/u);
    expect(existsSync(join(context.prefix, "releases", "1.0.0"))).toBe(true);
    expect(existsSync(join(context.prefix, "releases", "2.0.0"))).toBe(true);
    expect(existsSync(join(context.prefix, "releases", "0.9.0"))).toBe(false);
    expect(existsSync(join(context.prefix, "releases", ".staging-abc"))).toBe(true);
    expect(existsSync(join(context.prefix, "releases", "foreign"))).toBe(true);
    expect(existsSync(join(cacheRoot, "0.9.0"))).toBe(false);
    expect(existsSync(join(cacheRoot, "1.0.0", "x"))).toBe(true);
  });

  it("hands a managed service to the full upgrade path", async () => {
    const context = fixture();
    writeFileSync(join(context.prefix, "service-registration.json"), "{}");
    const calls: { from: string; prefix: string }[] = [];
    const result = await runSelfUpdate(
      { version: "2.0.0", json: true },
      {
        releaseRoot: join(context.prefix, "releases", "1.0.0"),
        fetchImpl: context.fetchImpl,
        upgrade: async (options) => {
          calls.push({ from: options.from, prefix: options.prefix });
          return { ok: true, detail: "upgraded" } as never;
        },
      },
    );
    expect(result.outcome).toBe("upgraded");
    expect(calls[0]?.prefix).toBe(context.prefix);
    expect(calls[0]?.from).toMatch(/poracode-2\.0\.0-/u);
    expect(readlinkSync(join(context.prefix, "current"))).toBe("releases/1.0.0");
    expect(result.detail).toBe("upgraded");
  });

  it("tells a managed service user when the bundled Node changed", async () => {
    const context = fixture();
    writeFileSync(join(context.prefix, "service-registration.json"), "{}");
    const result = await runSelfUpdate(
      { version: "2.0.0", json: false },
      {
        releaseRoot: join(context.prefix, "releases", "1.0.0"),
        fetchImpl: context.fetchImpl,
        upgrade: async () => {
          // The real upgrade stages and swaps current; emulate a newer Node.
          const release = join(context.prefix, "releases", "2.0.0");
          writeRelease(release, "2.0.0");
          const marker = JSON.parse(readFileSync(join(release, "standalone.json"), "utf8"));
          marker.node.version = "27.1.0";
          writeFileSync(join(release, "standalone.json"), JSON.stringify(marker));
          rmSync(join(context.prefix, "current"));
          symlinkSync("releases/2.0.0", join(context.prefix, "current"));
          return { ok: true, detail: "upgraded" } as never;
        },
      },
    );
    expect(result.detail).toMatch(/still runs Node 26\.13\.0[\s\S]*use Node 27\.1\.0/u);
  });

  it("refuses a checksum mismatch and a non-installer layout", async () => {
    const context = fixture();
    const tampered = async (url: string) =>
      url.endsWith("SHA256SUMS")
        ? new Response(
            `${"0".repeat(64)}  ${standaloneArchiveFileName("2.0.0", hostRuntimeTarget())}\n`,
          )
        : context.fetchImpl(url);
    await expect(
      runSelfUpdate(
        { version: "2.0.0", json: false },
        {
          releaseRoot: join(context.prefix, "releases", "1.0.0"),
          fetchImpl: tampered,
          probeOwner: async () => null,
        },
      ),
    ).rejects.toThrow(/Checksum mismatch/u);
    expect(readlinkSync(join(context.prefix, "current"))).toBe("releases/1.0.0");
    const checkout = tempDir();
    mkdirSync(join(checkout, "lib"));
    expect(() => resolveInstallerPrefix({ releaseRoot: checkout })).toThrow(/one-line installer/u);
  });
});
