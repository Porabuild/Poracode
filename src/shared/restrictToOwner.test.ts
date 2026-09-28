import { beforeEach, describe, expect, it } from "vitest";
import { resetOwnerSidCacheForTests, restrictToOwner, type OwnerAclExec } from "./restrictToOwner";

const SID = "S-1-5-21-111-222-333-1001";

function recorder(overrides: Partial<Record<string, () => string>> = {}) {
  const calls: { file: string; args: readonly string[]; timeout: number }[] = [];
  const exec: OwnerAclExec = (file, args, options) => {
    calls.push({ file, args, timeout: options.timeout });
    const override = overrides[file];
    if (override) return override();
    return file === "whoami" ? `"HOST\\alice","${SID}"\r\n` : "";
  };
  return { calls, exec };
}

describe("restrictToOwner", () => {
  beforeEach(resetOwnerSidCacheForTests);

  it("is a no-op on POSIX platforms", () => {
    const { calls, exec } = recorder();
    restrictToOwner("/tmp/x", { platform: "darwin", exec });
    restrictToOwner("/tmp/x", { platform: "linux", exec });
    expect(calls).toEqual([]);
  });

  it("grants only the current SID on a file, argv-only, with a bounded timeout", () => {
    const { calls, exec } = recorder();
    restrictToOwner("C:\\p\\a b\\relay-secret", {
      platform: "win32",
      exec,
      isDirectory: () => false,
    });
    expect(calls[0]).toMatchObject({ file: "whoami", args: ["/user", "/fo", "csv", "/nh"] });
    expect(calls[1]?.file).toBe("icacls");
    expect(calls[1]?.args).toEqual([
      "C:\\p\\a b\\relay-secret",
      "/inheritance:r",
      "/grant:r",
      `*${SID}:(F)`,
    ]);
    expect(calls.every((call) => call.timeout > 0 && call.timeout <= 30_000)).toBe(true);
  });

  it("uses inheritable grants for directories and /T only when recursive", () => {
    const { calls, exec } = recorder();
    const deps = { platform: "win32" as const, exec, isDirectory: () => true };
    restrictToOwner("C:\\p", deps);
    restrictToOwner("C:\\p", deps, { recursive: true });
    const icacls = calls.filter((call) => call.file === "icacls");
    expect(icacls[0]?.args).toEqual(["C:\\p", "/inheritance:r", "/grant:r", `*${SID}:(OI)(CI)(F)`]);
    expect(icacls[1]?.args.at(-1)).toBe("/T");
  });

  it("resolves the SID once per process", () => {
    const { calls, exec } = recorder();
    const deps = { platform: "win32" as const, exec, isDirectory: () => false };
    restrictToOwner("C:\\a", deps);
    restrictToOwner("C:\\b", deps);
    expect(calls.filter((call) => call.file === "whoami")).toHaveLength(1);
  });

  it("never interpolates paths into a shell command", () => {
    const { calls, exec } = recorder();
    restrictToOwner('C:\\x & calc "y"', { platform: "win32", exec, isDirectory: () => false });
    const icacls = calls.find((call) => call.file === "icacls");
    expect(icacls?.args[0]).toBe('C:\\x & calc "y"');
  });

  it("reports a typed failure when icacls fails", () => {
    const { exec } = recorder({
      icacls: () => {
        throw new Error("Access is denied");
      },
    });
    expect(() =>
      restrictToOwner("C:\\p", { platform: "win32", exec, isDirectory: () => false }),
    ).toThrowError(
      expect.objectContaining({ code: "OWNER_ACL_FAILED", stage: "icacls", path: "C:\\p" }),
    );
    expect.hasAssertions();
  });

  it("reports a typed failure when the SID cannot be resolved", () => {
    const empty = recorder({ whoami: () => "nothing useful" });
    expect(() =>
      restrictToOwner("C:\\p", { platform: "win32", exec: empty.exec, isDirectory: () => false }),
    ).toThrowError(expect.objectContaining({ stage: "resolve-sid", path: "C:\\p" }));
    expect(empty.calls.some((call) => call.file === "icacls")).toBe(false);

    const failing = recorder({
      whoami: () => {
        throw new Error("timed out");
      },
    });
    expect(() => restrictToOwner("C:\\p", { platform: "win32", exec: failing.exec })).toThrowError(
      expect.objectContaining({ code: "OWNER_ACL_FAILED", stage: "resolve-sid" }),
    );
  });
});
