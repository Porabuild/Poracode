import { chmod, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readAgentCommandOutput: vi.fn<typeof import("../base").readAgentCommandOutput>(async () => ({
    ok: true,
    stdout: "",
    stderr: "",
  })),
  link: vi.fn<typeof import("node:fs/promises").link>(async () => undefined),
  realLink: undefined as unknown as typeof import("node:fs/promises").link,
}));

vi.mock("../base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base")>()),
  readAgentCommandOutput: mocks.readAgentCommandOutput,
}));
// `link` is intercepted so tests can stage a concurrent claim between the
// read-only guard and the no-clobber manifest claim; by default it delegates
// to the real hardlink so clean provisioning actually lands the stamp.
vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  mocks.realLink = original.link;
  return { ...original, link: mocks.link };
});

// The default claim is a real hardlink.
mocks.link.mockImplementation(async (oldPath, newPath) =>
  mocks.realLink(oldPath as never, newPath as never),
);

import {
  devinAccountRootsFor,
  devinAccountsBaseDir,
  devinDefaultRoots,
  devinPosixJoin,
  devinProfileConfigViewDir,
  provisionDevinAccountRoot,
  validateDevinAccountRoot,
} from "./accountRoots";

const wsl = (linuxPath = "/home/u/proj") => ({
  kind: "wsl" as const,
  distro: "Ubuntu",
  linuxPath,
  uncPath: "\\\\wsl$\\Ubuntu\\home\\u\\proj",
});

const hostRoots = (base: string, ownerId = "someone") => {
  const root = join(base, "root");
  return {
    configRoot: join(root, "config"),
    dataRoot: join(root, "data"),
    credentialsPath: join(root, "data", "devin", "credentials.toml"),
    nativeConfigPath: join(root, "config", "devin", "config.json"),
    manifestPath: join(root, "poracode-account.json"),
    ownerId,
  };
};

const manifestFor = (ownerId: string, format = 1) =>
  JSON.stringify({ format, kind: "devin-account-root", ownerId });

async function tempBase() {
  return mkdtemp(join(tmpdir(), "poracode-devin-roots-"));
}

it("builds every WSL path with POSIX separators, never the host platform join", () => {
  const roots = devinAccountRootsFor(wsl(), "work owner", "/home/wsluser");
  const values = [
    devinAccountsBaseDir(wsl(), "/home/wsluser"),
    roots.configRoot,
    roots.dataRoot,
    roots.credentialsPath,
    roots.nativeConfigPath,
    roots.manifestPath,
    devinProfileConfigViewDir({ instanceId: "work owner" }, wsl(), "/home/wsluser"),
    // The default WSL roots are shell-expansion templates rooted at "$…".
    devinDefaultRoots(wsl()).credentialsPath,
  ];
  for (const value of values) {
    // A native Windows host's `path.join` would backslash these Linux paths;
    // the POSIX join keeps every segment distro-resolvable.
    expect(value).not.toContain("\\");
  }
  // The derived account paths are absolute Linux paths…
  expect(roots.manifestPath.startsWith("/")).toBe(true);
  expect(roots.credentialsPath.startsWith("/")).toBe(true);
  // …while the default-root templates stay shell expressions with POSIX
  // separators after the derived suffix.
  expect(devinDefaultRoots(wsl()).credentialsPath.startsWith("${XDG_DATA_HOME")).toBe(true);
  // The helper itself never normalizes like win32.join: a literal backslash
  // segment survives as data instead of becoming a separator.
  expect(devinPosixJoin("C:\\Users", "devin")).toBe("C:\\Users/devin");
  expect(win32.join("C:\\Users", "devin")).toContain("\\");
});

describe("manifest IO failures are unavailable, never absent", () => {
  it("refuses an unreadable host manifest instead of treating it as unprovisioned", async () => {
    const base = await tempBase();
    const roots = hostRoots(base);
    await mkdir(roots.configRoot, { recursive: true });
    await mkdir(roots.dataRoot, { recursive: true });
    await writeFile(roots.manifestPath, manifestFor(roots.ownerId));
    await chmod(roots.manifestPath, 0o000);
    let refused = false;
    try {
      const result = await provisionDevinAccountRoot(roots, roots.ownerId);
      // EACCES is NOT absence: refusing beats stamping a manifest over a
      // file Poracode could not read.
      refused = result.ok === false;
      expect(result).toMatchObject({ ok: false });
    } finally {
      await chmod(roots.manifestPath, 0o644).catch(() => undefined);
    }
    expect(refused).toBe(true);
    expect(await readFile(roots.manifestPath, "utf8")).toBe(manifestFor(roots.ownerId));
  });

  it("refuses a symlinked manifest without following or touching it", async () => {
    const base = await tempBase();
    const roots = hostRoots(base);
    await mkdir(join(base, "elsewhere"), { recursive: true });
    const redirectTarget = join(base, "elsewhere", "owner-manifest.json");
    await writeFile(redirectTarget, manifestFor("victim"));
    await mkdir(roots.configRoot, { recursive: true });
    await mkdir(roots.dataRoot, { recursive: true });
    await symlink(redirectTarget, roots.manifestPath);
    const result = await provisionDevinAccountRoot(roots, roots.ownerId);
    expect(result).toMatchObject({ ok: false, code: "unsupported-account-root" });
    // The symlink target is untouched — auth cannot be redirected through a
    // planted manifest link.
    expect(await readFile(redirectTarget, "utf8")).toBe(manifestFor("victim"));
  });

  it("refuses a symlinked managed root before any directory is created", async () => {
    const base = await tempBase();
    const roots = hostRoots(base);
    await mkdir(join(base, "elsewhere"), { recursive: true });
    await mkdir(join(roots.manifestPath, ".."), { recursive: true });
    await symlink(join(base, "elsewhere"), roots.configRoot);
    const result = await provisionDevinAccountRoot(roots, roots.ownerId);
    expect(result).toMatchObject({ ok: false, code: "unsupported-account-root" });
    // Nothing was provisioned through the link.
    await expect(readFile(join(base, "elsewhere", "poracode-account.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("the manifest claim never clobbers a concurrent writer", () => {
  it("refuses and preserves a future-format marker created between the guard and the claim", async () => {
    const base = await tempBase();
    const roots = hostRoots(base);
    await mkdir(roots.configRoot, { recursive: true });
    await mkdir(roots.dataRoot, { recursive: true });
    // Stage the race: when the claim runs, a "future Poracode" has just
    // written its own manifest at the target — the claim must lose cleanly.
    mocks.link.mockImplementationOnce(async (from, to) => {
      await writeFile(String(to), manifestFor(roots.ownerId, 99));
      const error = new Error("EEXIST") as NodeJS.ErrnoException;
      error.code = "EEXIST";
      throw error;
    });
    const result = await provisionDevinAccountRoot(roots, roots.ownerId);
    expect(result).toMatchObject({ ok: false, code: "unsupported-account-root" });
    expect(await readFile(roots.manifestPath, "utf8")).toBe(manifestFor(roots.ownerId, 99));
  });

  it("refuses and preserves a wrong-owner marker created between the guard and the claim", async () => {
    const base = await tempBase();
    const roots = hostRoots(base);
    await mkdir(roots.configRoot, { recursive: true });
    await mkdir(roots.dataRoot, { recursive: true });
    mocks.link.mockImplementationOnce(async (from, to) => {
      await writeFile(String(to), manifestFor("someone-else"));
      const error = new Error("EEXIST") as NodeJS.ErrnoException;
      error.code = "EEXIST";
      throw error;
    });
    const result = await provisionDevinAccountRoot(roots, roots.ownerId);
    expect(result).toMatchObject({ ok: false, code: "unsupported-account-root" });
    expect(await readFile(roots.manifestPath, "utf8")).toBe(manifestFor("someone-else"));
  });

  it("treats a lost claim against our own valid stamp as idempotent success", async () => {
    const base = await tempBase();
    const roots = hostRoots(base);
    await mkdir(roots.configRoot, { recursive: true });
    await mkdir(roots.dataRoot, { recursive: true });
    mocks.link.mockImplementationOnce(async (from, to) => {
      await writeFile(String(to), manifestFor(roots.ownerId));
      const error = new Error("EEXIST") as NodeJS.ErrnoException;
      error.code = "EEXIST";
      throw error;
    });
    const result = await provisionDevinAccountRoot(roots, roots.ownerId);
    expect(result).toEqual({ ok: true });
  });

  it("claims cleanly when no concurrent writer appears", async () => {
    const base = await tempBase();
    const roots = hostRoots(base);
    const result = await provisionDevinAccountRoot(roots, roots.ownerId);
    expect(result).toEqual({ ok: true });
    const stamped = JSON.parse(await readFile(roots.manifestPath, "utf8")) as {
      ownerId?: string;
      format?: number;
    };
    expect(stamped).toMatchObject({ ownerId: roots.ownerId, format: 1 });
  });
});

describe("WSL guard distinguishes absence from unreadability in the distro shell", () => {
  it("probes with an existence check and no output-masking fallback", async () => {
    const roots = devinAccountRootsFor(wsl(), "work", "/home/wsluser");
    await validateDevinAccountRoot(roots, "work", wsl()).catch(() => undefined);
    const [location, executable, args] = mocks.readAgentCommandOutput.mock.calls.at(-1)!;
    expect(location).toMatchObject({ kind: "wsl" });
    expect(executable).toBe("sh");
    const script = args[1]!;
    // Absence is an explicit test, not a masked `cat … || printf ""` that
    // equates every read failure with a missing file.
    expect(script).toContain('[ ! -e "$m" ]');
    expect(script).toContain('cat "$m"');
    expect(script).not.toContain("2>/dev/null || printf");
  });

  it("refuses a symlinked manifest marker instead of following it", async () => {
    const roots = devinAccountRootsFor(wsl(), "work", "/home/wsluser");
    mocks.readAgentCommandOutput.mockResolvedValueOnce({
      ok: true,
      stdout: "__PORACODE_SYMLINK__",
      stderr: "",
    });
    await expect(validateDevinAccountRoot(roots, "work", wsl())).rejects.toThrowError(
      /symbolic link/,
    );
  });

  it("reports a failed distro read as unavailable (never absent)", async () => {
    const roots = devinAccountRootsFor(wsl(), "work", "/home/wsluser");
    mocks.readAgentCommandOutput.mockResolvedValueOnce({
      ok: false,
      stdout: "",
      stderr: "cat: Permission denied",
    });
    await expect(validateDevinAccountRoot(roots, "work", wsl())).rejects.toThrowError(
      /Unable to inspect/,
    );
  });

  it("re-classifies a lost claim and refuses a wrong-owner winner without overwriting", async () => {
    const roots = devinAccountRootsFor(wsl(), "work", "/home/wsluser");
    mocks.readAgentCommandOutput
      // 1: the read-only guard classifies the manifest absent…
      .mockResolvedValueOnce({ ok: true, stdout: "", stderr: "" })
      // 2: …but the create script reports the claim lost…
      .mockResolvedValueOnce({ ok: true, stdout: "__PORACODE_CLAIMED__", stderr: "" })
      // 3: …and the re-classification read finds a wrong-owner stamp won the race.
      .mockResolvedValueOnce({
        ok: true,
        stdout: manifestFor("someone-else"),
        stderr: "",
      });
    const result = await provisionDevinAccountRoot(roots, "work", wsl());
    expect(result).toMatchObject({ ok: false, code: "unsupported-account-root" });
    expect(result.ok === false && result.message).toMatch(/claimed by another owner/);
  });

  it("treats a lost claim against our own valid stamp as idempotent success", async () => {
    const roots = devinAccountRootsFor(wsl(), "work", "/home/wsluser");
    mocks.readAgentCommandOutput
      .mockResolvedValueOnce({ ok: true, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ ok: true, stdout: "__PORACODE_CLAIMED__", stderr: "" })
      .mockResolvedValueOnce({ ok: true, stdout: manifestFor("work"), stderr: "" });
    const result = await provisionDevinAccountRoot(roots, "work", wsl());
    expect(result).toEqual({ ok: true });
  });

  it("refuses a symlinked managed-root marker from the create script", async () => {
    const roots = devinAccountRootsFor(wsl(), "work", "/home/wsluser");
    mocks.readAgentCommandOutput
      .mockResolvedValueOnce({ ok: true, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ ok: true, stdout: "__PORACODE_SYMLINK__", stderr: "" });
    const result = await provisionDevinAccountRoot(roots, "work", wsl());
    expect(result).toMatchObject({ ok: false, code: "unsupported-account-root" });
  });

  it("keeps the no-clobber claim in the create script (ln, not mv -f)", async () => {
    const roots = devinAccountRootsFor(wsl(), "work", "/home/wsluser");
    mocks.readAgentCommandOutput
      .mockResolvedValueOnce({ ok: true, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ ok: true, stdout: "", stderr: "" });
    await provisionDevinAccountRoot(roots, "work", wsl());
    const [, , args] = mocks.readAgentCommandOutput.mock.calls.at(-1)!;
    const script = args[1]!;
    expect(script).toContain('ln "$tmp" "$manifest"');
    expect(script).not.toContain("mv -f");
    expect(script).toContain("__PORACODE_CLAIMED__");
  });
});
