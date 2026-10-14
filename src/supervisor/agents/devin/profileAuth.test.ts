import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDevinLoginCommand,
  buildDevinLogoutCommand,
  describeDevinAuthScope,
  resolveDevinAuthStateForContext,
} from "./profileAuth";
import type { DevinExecutionContext } from "./profileContext";
import { createDevinDetectionSpec } from "./detection";

const posix = (path: string) => ({ kind: "posix" as const, path });

function context(overrides: Partial<DevinExecutionContext> = {}): DevinExecutionContext {
  return {
    instanceId: "work",
    label: "Devin work",
    account: { kind: "default" },
    location: posix("/project"),
    binaryIdentity: "devin",
    runtimeTarget: "local",
    configGeneration: "gen",
    roots: {
      configRoot: "/default/config",
      dataRoot: "/default/data",
      credentialsPath: "/default/data/devin/credentials.toml",
      nativeConfigPath: "/default/config/devin/config.json",
      manifestPath: "",
    },
    requiresConfigSeed: false,
    prefixArgs: [],
    generation: "gen",
    ...overrides,
  } as DevinExecutionContext;
}

describe("profile auth", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("honors a native environment key only for the validated default account", async () => {
    vi.stubEnv("WINDSURF_API_KEY", "fixture-native-key");
    await expect(resolveDevinAuthStateForContext(context())).resolves.toBe("authenticated");
    await expect(
      resolveDevinAuthStateForContext(context({ account: { kind: "isolated", ownerId: "work" } })),
    ).resolves.toBe("missing");
    await expect(
      resolveDevinAuthStateForContext(context({ account: { kind: "reference", ownerId: "work" } })),
    ).resolves.toBe("missing");
  });

  it("does not let a global key bypass invalid profile context validation", async () => {
    vi.stubEnv("WINDSURF_API_KEY", "fixture-native-key");
    const spec = createDevinDetectionSpec({
      instanceId: "invalid",
      label: "Invalid profile",
      auth: { kind: "default" },
      runtimeTarget: "local",
      configGeneration: "fixture",
      environment: { XDG_DATA_HOME: "/unexpected-account-root" },
    });
    expect(spec.authProbes).toHaveLength(1);
    const probe = spec.authProbes![0]!;
    await expect(
      probe({ location: posix("/project"), executablePath: "/fixture/devin" }),
    ).resolves.toBe("unknown");
  });

  it("reports missing credentials at the context root without touching defaults", async () => {
    vi.stubEnv("WINDSURF_API_KEY", "");
    const base = await mkdtemp(join(tmpdir(), "poracode-devin-auth-"));
    const ctx = context({
      roots: {
        configRoot: base,
        dataRoot: base,
        credentialsPath: join(base, "devin", "credentials.toml"),
        nativeConfigPath: join(base, "devin", "config.json"),
        manifestPath: "",
      },
    });
    await expect(resolveDevinAuthStateForContext(ctx)).resolves.toBe("missing");
    await mkdir(join(base, "devin"), { recursive: true });
    await writeFile(
      join(base, "devin", "credentials.toml"),
      'windsurf_api_key = "tok"\napi_server_url = "https://server.codeium.com"',
    );
    await expect(resolveDevinAuthStateForContext(ctx)).resolves.toBe("authenticated");
  });

  it("scopes login and logout commands through the context redirection", () => {
    const ctx = context({
      account: { kind: "isolated", ownerId: "work" },
      prefixArgs: ["--config", "/root/devin/config.json"],
      env: { XDG_DATA_HOME: "/root/data" },
    });
    const login = buildDevinLoginCommand(ctx, "/bin/devin");
    expect(login.args).toEqual(["--config", "/root/devin/config.json", "auth", "login"]);
    expect(login.env?.XDG_DATA_HOME).toBe("/root/data");
    const logout = buildDevinLogoutCommand(ctx.location, ctx, "/bin/devin");
    expect(logout.args).toEqual(["--config", "/root/devin/config.json", "auth", "logout"]);
    expect(logout.env?.XDG_DATA_HOME).toBe("/root/data");
    // Without a resolved context the logout stays the plain default-account command.
    const fallback = buildDevinLogoutCommand(ctx.location, undefined, "/bin/devin");
    expect(fallback.args).toEqual(["auth", "logout"]);
    expect(fallback.env?.XDG_DATA_HOME).toBeUndefined();
  });

  it("describes shared-account scope so callers can confirm consequences", () => {
    expect(describeDevinAuthScope(context())).toContain("native default");
    expect(
      describeDevinAuthScope(context({ account: { kind: "isolated", ownerId: "w" } })),
    ).toContain("isolated account root");
    expect(
      describeDevinAuthScope(context({ account: { kind: "reference", ownerId: "w" } })),
    ).toContain("owned by profile");
  });
});
