import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { OwnerAclExec } from "@/shared/restrictToOwner";
import type { ServerInstallLayout } from "./serverInstallLayout";
import { broadIcaclsPrincipals, buildWin32Checks } from "./serverDoctorWin32";

const ROOT = "C:\\Users\\alice\\.poracode\\profile.host-v1";
const PREFIX = "C:\\Users\\alice\\AppData\\Local\\Poracode\\current";
const layout: ServerInstallLayout = {
  layoutVersion: 1,
  kind: "prefix",
  root: PREFIX,
  libDir: `${PREFIX}\\lib`,
  resourcesDir: `${PREFIX}\\resources`,
};

const PRIVATE_ACL = `${ROOT} HOST\\alice:(OI)(CI)(F)\r\n\r\nSuccessfully processed 1 files; Failed processing 0 files\r\n`;
const OPEN_ACL =
  `${ROOT} NT AUTHORITY\\SYSTEM:(OI)(CI)(F)\r\n` +
  "        BUILTIN\\Users:(OI)(CI)(RX)\r\n" +
  "        Everyone:(OI)(CI)(DENY)(W)\r\n\r\nSuccessfully processed 1 files; Failed processing 0 files\r\n";

interface Fixture {
  icacls?: string | Error;
  reg?: string | Error;
  files?: readonly string[];
  metadata?: string | null;
}

function run(fixture: Fixture, platform: NodeJS.Platform = "win32") {
  const calls: string[] = [];
  const exec: OwnerAclExec = (file, args) => {
    calls.push(`${file} ${args.join(" ")}`);
    const result = file === "icacls" ? fixture.icacls : fixture.reg;
    if (result instanceof Error) throw result;
    return result ?? "";
  };
  const present = new Set(fixture.files ?? []);
  const checks = buildWin32Checks(
    {
      profileRoot: ROOT,
      platform,
      arch: "x64",
      exec,
      exists: (path) => path === ROOT || present.has(path),
      readText: (path) => {
        if (fixture.metadata == null || !path.endsWith("server-artifact.json"))
          throw new Error("ENOENT");
        return fixture.metadata;
      },
    },
    layout,
  );
  return { checks, calls, byName: (name: string) => checks.find((check) => check.name === name) };
}

const PREBUILDS = join(PREFIX, "node_modules", "node-pty", "prebuilds", "win32-x64");
const CONPTY_FILES = [join(PREBUILDS, "conpty.node"), join(PREBUILDS, "conpty", "OpenConsole.exe")];

describe("broadIcaclsPrincipals", () => {
  it("finds granted broad principals and ignores deny entries", () => {
    expect(broadIcaclsPrincipals(OPEN_ACL, ROOT)).toEqual(["BUILTIN\\Users"]);
    expect(broadIcaclsPrincipals(PRIVATE_ACL, ROOT)).toEqual([]);
    expect(
      broadIcaclsPrincipals(
        `${ROOT} Everyone:(F)\r\n  NT AUTHORITY\\Authenticated Users:(M)\r\n  *S-1-5-32-545:(R)`,
        ROOT,
      ),
    ).toEqual(["Everyone", "NT AUTHORITY\\Authenticated Users", "*S-1-5-32-545"]);
  });
});

describe("win32 doctor checks", () => {
  it("adds nothing off Windows and never execs", () => {
    const { checks, calls } = run({ icacls: PRIVATE_ACL }, "linux");
    expect(checks).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("owner-acl is ok for an owner-only profile and warns on broad access", () => {
    expect(run({ icacls: PRIVATE_ACL }).byName("owner-acl")?.status).toBe("ok");
    const open = run({ icacls: OPEN_ACL }).byName("owner-acl");
    expect(open?.status).toBe("warn");
    expect(open?.detail).toContain("BUILTIN\\Users");
    expect(run({ icacls: new Error("boom") }).byName("owner-acl")?.status).toBe("warn");
  });

  it("conpty errors when OpenConsole.exe or conpty.node is missing", () => {
    expect(run({ icacls: PRIVATE_ACL, files: CONPTY_FILES }).byName("conpty")?.status).toBe("ok");
    const missing = run({ icacls: PRIVATE_ACL, files: [CONPTY_FILES[0]!] }).byName("conpty");
    expect(missing?.status).toBe("error");
    expect(missing?.detail).toContain("conpty/OpenConsole.exe");
    expect(run({ icacls: PRIVATE_ACL }).byName("conpty")?.detail).toContain("conpty.node");
  });

  it("path-length warns beyond the threshold without LongPathsEnabled", () => {
    const metadata = JSON.stringify({ longestMemberPath: `node_modules/${"a".repeat(220)}.js` });
    const off = run({ metadata, reg: "    LongPathsEnabled    REG_DWORD    0x0\r\n" });
    expect(off.byName("path-length")?.status).toBe("warn");
    expect(run({ metadata, reg: new Error("not found") }).byName("path-length")?.status).toBe(
      "warn",
    );
    const on = run({ metadata, reg: "    LongPathsEnabled    REG_DWORD    0x1\r\n" });
    expect(on.byName("path-length")?.status).toBe("ok");
  });

  it("path-length is ok for short paths without consulting the registry", () => {
    const short = run({ metadata: JSON.stringify({ longestMemberPath: "lib/server.cjs" }) });
    expect(short.byName("path-length")?.status).toBe("ok");
    expect(short.calls.some((call) => call.startsWith("reg "))).toBe(false);
    expect(run({ metadata: null }).byName("path-length")?.detail).toContain("longestMemberPath");
  });

  it("skips layout-dependent checks when the layout failed to resolve", () => {
    const checks = buildWin32Checks(
      { profileRoot: ROOT, platform: "win32", exec: () => PRIVATE_ACL, exists: () => true },
      { error: "unsupported" },
    );
    expect(checks.map((check) => check.name)).toEqual(["owner-acl"]);
  });
});
