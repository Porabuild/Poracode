import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  encodeKimiWorkDirKey,
  ensureKimiWorkspaceTrust,
  resetKimiWorkspaceTrustCache,
  slugifyKimiWorkDirName,
} from "./kimiTrust";

function sha256Prefix(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

describe("slugifyKimiWorkDirName", () => {
  it("lowercases the name and maps special characters to dashes", () => {
    expect(slugifyKimiWorkDirName("My Project")).toBe("my-project");
    expect(slugifyKimiWorkDirName("Hello, World! (v2)")).toBe("hello-world-v2");
  });

  it("keeps dots, underscores, and dashes", () => {
    expect(slugifyKimiWorkDirName("my_app.v2-fix")).toBe("my_app.v2-fix");
  });

  it("trims leading and trailing dashes", () => {
    expect(slugifyKimiWorkDirName("--demo--")).toBe("demo");
  });

  it("caps the slug at 40 characters and re-trims dashes exposed by the cut", () => {
    expect(slugifyKimiWorkDirName("a".repeat(60))).toBe("a".repeat(40));
    expect(slugifyKimiWorkDirName(`${"a".repeat(39)} ${"b".repeat(20)}`)).toBe("a".repeat(39));
  });

  it("falls back to workspace for empty or dot-only names", () => {
    expect(slugifyKimiWorkDirName("")).toBe("workspace");
    expect(slugifyKimiWorkDirName("///")).toBe("workspace");
    expect(slugifyKimiWorkDirName(".")).toBe("workspace");
    expect(slugifyKimiWorkDirName("..")).toBe("workspace");
  });
});

describe("encodeKimiWorkDirKey", () => {
  it("combines wd_, the slug of the last path segment, and the 12-char sha256 prefix", () => {
    const key = encodeKimiWorkDirKey("/home/demo/project");
    expect(key).toBe(`wd_project_${sha256Prefix("/home/demo/project")}`);
  });

  it("normalizes backslashes before hashing", () => {
    const key = encodeKimiWorkDirKey("C:\\Users\\demo\\repo");
    expect(key).toBe(`wd_repo_${sha256Prefix("C:/Users/demo/repo")}`);
  });

  it("strips trailing slashes so equivalent paths share a key", () => {
    expect(encodeKimiWorkDirKey("/home/demo/repo/")).toBe(encodeKimiWorkDirKey("/home/demo/repo"));
    expect(encodeKimiWorkDirKey("C:\\demo\\repo\\\\")).toBe(encodeKimiWorkDirKey("C:\\demo\\repo"));
  });
});

describe("ensureKimiWorkspaceTrust (native)", () => {
  const tempDirs: string[] = [];

  function makeTempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  beforeEach(() => {
    resetKimiWorkspaceTrustCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes the marker JSON under KIMI_CODE_HOME/workspace-trust", async () => {
    const home = makeTempDir("kimi-home-");
    const project = makeTempDir("kimi-project-");
    vi.stubEnv("KIMI_CODE_HOME", home);
    const root = realpathSync(project);

    await ensureKimiWorkspaceTrust({ kind: "posix", path: project });

    const markerPath = join(home, "workspace-trust", encodeKimiWorkDirKey(root));
    expect(existsSync(markerPath)).toBe(true);
    const record = JSON.parse(readFileSync(markerPath, "utf8")) as {
      root: unknown;
      trustedAt: unknown;
    };
    expect(record.root).toBe(root);
    expect(typeof record.trustedAt).toBe("number");
  });

  it("does not overwrite an existing marker", async () => {
    const home = makeTempDir("kimi-home-");
    const project = makeTempDir("kimi-project-");
    vi.stubEnv("KIMI_CODE_HOME", home);
    const root = realpathSync(project);
    const markerPath = join(home, "workspace-trust", encodeKimiWorkDirKey(root));
    mkdirSync(dirname(markerPath), { recursive: true });
    writeFileSync(markerPath, '{"root":"sentinel","trustedAt":1}');

    await ensureKimiWorkspaceTrust({ kind: "posix", path: project });

    expect(readFileSync(markerPath, "utf8")).toBe('{"root":"sentinel","trustedAt":1}');
  });

  it("honors an explicit workDir over the project path (the ACP probe's cwd)", async () => {
    const home = makeTempDir("kimi-home-");
    const project = makeTempDir("kimi-project-");
    const probeCwd = makeTempDir("kimi-probe-");
    vi.stubEnv("KIMI_CODE_HOME", home);

    await ensureKimiWorkspaceTrust({ kind: "posix", path: project }, probeCwd);

    const trustDir = join(home, "workspace-trust");
    expect(existsSync(join(trustDir, encodeKimiWorkDirKey(realpathSync(probeCwd))))).toBe(true);
    expect(existsSync(join(trustDir, encodeKimiWorkDirKey(realpathSync(project))))).toBe(false);
  });

  // The marker is write-once, so re-checking it on every launch buys nothing —
  // on WSL it would cost two bridge round trips per spawn.
  it("stops touching the marker once a folder is known trusted", async () => {
    const home = makeTempDir("kimi-home-");
    const project = makeTempDir("kimi-project-");
    vi.stubEnv("KIMI_CODE_HOME", home);
    const markerPath = join(home, "workspace-trust", encodeKimiWorkDirKey(realpathSync(project)));

    await ensureKimiWorkspaceTrust({ kind: "posix", path: project });
    rmSync(markerPath, { force: true });
    await ensureKimiWorkspaceTrust({ kind: "posix", path: project });

    expect(existsSync(markerPath)).toBe(false);
  });

  it("retries after a failure instead of caching it", async () => {
    const homeDir = makeTempDir("kimi-home-");
    const homeFile = join(homeDir, "blocked");
    const project = makeTempDir("kimi-project-");
    writeFileSync(homeFile, "not a directory");
    vi.stubEnv("KIMI_CODE_HOME", homeFile);

    await ensureKimiWorkspaceTrust({ kind: "posix", path: project });

    // Same folder, but the home is writable now — the first failure must not
    // have been memoized as "already trusted".
    vi.stubEnv("KIMI_CODE_HOME", homeDir);
    await ensureKimiWorkspaceTrust({ kind: "posix", path: project });

    const markerPath = join(
      homeDir,
      "workspace-trust",
      encodeKimiWorkDirKey(realpathSync(project)),
    );
    expect(existsSync(markerPath)).toBe(true);
  });

  it("never throws when the trust directory is unwritable", async () => {
    // Pointing KIMI_CODE_HOME at a plain file makes the workspace-trust mkdir
    // fail with ENOTDIR — the launch must not be blocked by that.
    const homeFile = join(makeTempDir("kimi-home-"), "blocked");
    writeFileSync(homeFile, "not a directory");
    vi.stubEnv("KIMI_CODE_HOME", homeFile);

    await expect(
      ensureKimiWorkspaceTrust({ kind: "posix", path: makeTempDir("kimi-project-") }),
    ).resolves.toBeUndefined();
  });
});
