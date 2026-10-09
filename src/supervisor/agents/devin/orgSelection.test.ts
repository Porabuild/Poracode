import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { devinConfigOrgId, resolveDevinEffectiveOrgId } from "./orgSelection";
import type { DevinExecutionContext } from "./profileContext";

const mocks = vi.hoisted(() => ({
  readAgentCommandOutput: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock("../base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base")>()),
  readAgentCommandOutput: mocks.readAgentCommandOutput,
}));

describe("devinConfigOrgId", () => {
  it("reads devin.org_id from JSONC config text and treats an explicit clear as unset", () => {
    expect(devinConfigOrgId('{ "devin": { "org_id": " org-1 " } }')).toBe("org-1");
    expect(devinConfigOrgId('// comment\n{ "devin": {} }')).toBeUndefined();
    expect(devinConfigOrgId('{ "devin": { "org_id": null } }')).toBeUndefined();
    expect(devinConfigOrgId(undefined)).toBeUndefined();
    expect(devinConfigOrgId("   ")).toBeUndefined();
  });

  it("fails typed on corrupt or type-violating sources", () => {
    for (const raw of ["{ not json", "[1, 2]", '{ "devin": { "org_id": 42 } }']) {
      let thrown: unknown;
      try {
        devinConfigOrgId(raw);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({
        name: "DevinAccountIdentityError",
        code: "org-selection-unreadable",
      });
    }
  });
});

describe("resolveDevinEffectiveOrgId", () => {
  let base: string;

  const context = (overrides: Partial<DevinExecutionContext> = {}): DevinExecutionContext =>
    ({
      instanceId: "work",
      label: "Devin work",
      account: { kind: "isolated", ownerId: "work" },
      location: { kind: "posix", path: "/project" },
      binaryIdentity: "devin",
      runtimeTarget: "local",
      configGeneration: "gen",
      roots: {
        configRoot: base,
        dataRoot: base,
        credentialsPath: join(base, "devin", "credentials.toml"),
        nativeConfigPath: join(base, "devin", "config.json"),
        manifestPath: "",
      },
      env: { XDG_CONFIG_HOME: base },
      requiresConfigSeed: false,
      prefixArgs: [],
      generation: "gen",
      ...overrides,
    }) as DevinExecutionContext;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "poracode-devin-org-"));
    await mkdir(join(base, "devin"), { recursive: true });
    mocks.readAgentCommandOutput.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("short-circuits the declared settings org (the launch seeds it into the view)", async () => {
    expect(await resolveDevinEffectiveOrgId(context({ orgId: "settings-org" }))).toBe(
      "settings-org",
    );
  });

  it("reads the redirected config view the session will actually resolve", async () => {
    await writeFile(
      join(base, "devin", "config.json"),
      JSON.stringify({ devin: { org_id: "org-1" } }),
    );
    expect(await resolveDevinEffectiveOrgId(context())).toBe("org-1");
  });

  it("resolves the explicit --config file FIRST — it replaces the view for the session", async () => {
    await writeFile(
      join(base, "devin", "config.json"),
      JSON.stringify({ devin: { org_id: "view-org" } }),
    );
    const explicit = join(base, "own.json");
    await writeFile(explicit, JSON.stringify({ devin: { org_id: "explicit-org" } }));
    expect(await resolveDevinEffectiveOrgId(context({ configPath: explicit }))).toBe(
      "explicit-org",
    );
    // An explicit file without an org is org-less even when the view has one.
    const empty = join(base, "empty.json");
    await writeFile(empty, "{}");
    expect(await resolveDevinEffectiveOrgId(context({ configPath: empty }))).toBeUndefined();
  });

  it("keeps absence when no config exists on the declared source", async () => {
    expect(await resolveDevinEffectiveOrgId(context())).toBeUndefined();
  });

  it("fails typed when the effective config exists but cannot be read", async () => {
    await writeFile(
      join(base, "devin", "config.json"),
      JSON.stringify({ devin: { org_id: "org-1" } }),
    );
    await chmod(join(base, "devin", "config.json"), 0o000);
    await expect(resolveDevinEffectiveOrgId(context())).rejects.toMatchObject({
      name: "DevinAccountIdentityError",
      code: "org-selection-unreadable",
    });
  });

  it("reads WSL configs INSIDE the distro; a failing distro read is never an empty view", async () => {
    const wslContext = context({
      location: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/u/proj",
        uncPath: "\\\\wsl$\\Ubuntu\\home\\u\\proj",
      },
      env: { XDG_CONFIG_HOME: "/home/u/.config" },
    });
    mocks.readAgentCommandOutput.mockImplementation(async (...args: unknown[]) => {
      const [, executable, commandArgs] = args as [unknown, string, string[]];
      expect(executable).toBe("sh");
      expect(commandArgs[0]).toBe("-c");
      // The guarded read distinguishes absence from failure inside the
      // distro; the Linux path is never handed to the host fs.
      expect(commandArgs[1]).toContain("if [ -e");
      expect(commandArgs[1]).toContain("/home/u/.config");
      return {
        ok: true,
        stdout: `present\n${JSON.stringify({ devin: { org_id: "distro-org" } })}`,
        stderr: "",
      };
    });
    expect(await resolveDevinEffectiveOrgId(wslContext)).toBe("distro-org");
    mocks.readAgentCommandOutput.mockImplementation(async () => ({
      ok: false,
      stdout: "",
      stderr: "boom",
    }));
    await expect(resolveDevinEffectiveOrgId(wslContext)).rejects.toMatchObject({
      code: "org-selection-unreadable",
    });
  });

  it("fails closed on a PRESENT but empty or marker-less distro config; absence stays absence", async () => {
    const wslContext = context({
      location: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/u/proj",
        uncPath: "\\\\wsl$\\Ubuntu\\home\\u\\proj",
      },
      env: { XDG_CONFIG_HOME: "/home/u/.config" },
    });
    // Present with no content: truncation ambiguity, never a silent "no org".
    mocks.readAgentCommandOutput.mockImplementation(async () => ({
      ok: true,
      stdout: "present\n",
      stderr: "",
    }));
    await expect(resolveDevinEffectiveOrgId(wslContext)).rejects.toMatchObject({
      name: "DevinAccountIdentityError",
      code: "org-selection-unreadable",
    });
    // A malformed marker is a failure, not an empty view either.
    mocks.readAgentCommandOutput.mockImplementation(async () => ({
      ok: true,
      stdout: '{"devin":{"org_id":"x"}}',
      stderr: "",
    }));
    await expect(resolveDevinEffectiveOrgId(wslContext)).rejects.toMatchObject({
      code: "org-selection-unreadable",
    });
    // Genuinely missing: the native default, legitimately org-less.
    mocks.readAgentCommandOutput.mockImplementation(async () => ({
      ok: true,
      stdout: "absent\n",
      stderr: "",
    }));
    await expect(resolveDevinEffectiveOrgId(wslContext)).resolves.toBeUndefined();
    // The host branch fails closed on present-empty the same way.
    const empty = join(base, "devin", "config.json");
    await writeFile(empty, "   ");
    await expect(resolveDevinEffectiveOrgId(context())).rejects.toMatchObject({
      code: "org-selection-unreadable",
    });
  });
});

describe("WSL default-account org selection (distro-side native default)", () => {
  /** A native-default WSL context: no redirection, no env — distro XDG/HOME. */
  const defaultWslContext = (env?: Record<string, string>): DevinExecutionContext =>
    ({
      instanceId: "base",
      label: "Devin",
      account: { kind: "default" },
      location: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/u/proj",
        uncPath: "\\\\wsl$\\Ubuntu\\home\\u\\proj",
      },
      binaryIdentity: "devin",
      runtimeTarget: "local",
      configGeneration: "base",
      ...(env ? { env } : {}),
      roots: {},
      requiresConfigSeed: false,
      prefixArgs: [],
      generation: "gen",
    }) as unknown as DevinExecutionContext;

  beforeEach(() => {
    mocks.readAgentCommandOutput.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resumes against the DISTRO's own XDG root: the trusted expression is interpolated raw", async () => {
    // The native-default config path is a controlled shell-expansion
    // expression from devinDefaultRoots: single-quoting it would search for
    // a file literally named with braces, and a HOST-resolved path would
    // read the wrong machine's config — the root resume binding must select
    // the distro data.
    mocks.readAgentCommandOutput.mockImplementation(async (...args: unknown[]) => {
      const [, executable, commandArgs] = args as [unknown, string, string[]];
      expect(executable).toBe("sh");
      expect(commandArgs[0]).toBe("-c");
      const script = String(commandArgs[1]);
      expect(script).toContain("f=${XDG_CONFIG_HOME:-$HOME/.config}/devin/config.json");
      // Never quoted as a literal, never a host path.
      expect(script).not.toContain("'${XDG_CONFIG_HOME");
      expect(script).not.toContain(join(".config", "devin"));
      return {
        ok: true,
        stdout: 'present\n{"devin":{"org_id":"distro-org"}}',
        stderr: "",
      };
    });
    await expect(resolveDevinEffectiveOrgId(defaultWslContext())).resolves.toBe("distro-org");
  });

  it("quotes literal redirected Linux paths literally — spaces, quotes, dollar, $( )", async () => {
    const redirected = "/home/u/my $org 'view'/config";
    mocks.readAgentCommandOutput.mockImplementation(async (...args: unknown[]) => {
      const [, , commandArgs] = args as [unknown, string, string[]];
      const script = String(commandArgs[1]);
      // The literal path is single-quoted with '\'' escaping: `$`, spaces
      // and quotes stay data — never a command substitution.
      expect(script).toContain(`'/home/u/my $org '\\''view'\\''/config/devin/config.json'`);
      // The unquoted form never appears (it would expand `$( )`-style input).
      expect(script).not.toContain("f=/home/u/my");
      return { ok: true, stdout: "absent\n", stderr: "" };
    });
    await expect(
      resolveDevinEffectiveOrgId(defaultWslContext({ XDG_CONFIG_HOME: redirected })),
    ).resolves.toBeUndefined();
  });
});
