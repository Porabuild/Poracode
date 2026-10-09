import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  devinCredentialFingerprint,
  DevinAccountIdentityError,
  readDevinContextCredential,
  resetDevinAccountIdentityCaches,
  resolveDevinProvenScopeIdentity,
} from "./accountIdentity";
import { identityUnavailable } from "./sessionBinding";
import type { DevinExecutionContext } from "./profileContext";
import { batchWslCommandsAsync } from "../base";
import { devinDefaultRoots } from "./accountRoots";

const posix = (path: string) => ({ kind: "posix" as const, path });

const fetchMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<Response>>(async () => new Response(null)),
);

vi.mock("../base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base")>()),
  // WSL reads are distro-side; the host tests never spawn one.
  batchWslCommandsAsync: vi.fn<() => Promise<{ ok: boolean; stdout: string; stderr: string }[]>>(
    async () => [{ ok: false, stdout: "", stderr: "unused" }],
  ),
}));

interface Fixture {
  base: string;
  context: (overrides?: Partial<DevinExecutionContext>) => DevinExecutionContext;
  writeCredentials: (token: string, baseUrl?: string) => Promise<void>;
  writeConfig: (config: unknown) => Promise<void>;
}

async function fixture(authKind: "isolated" | "default" = "isolated"): Promise<Fixture> {
  const base = await mkdtemp(join(tmpdir(), "poracode-devin-identity-"));
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(base, "devin"), { recursive: true });
  const credentialsPath = join(base, "devin", "credentials.toml");
  const writeCredentials = async (token: string, baseUrl?: string) => {
    await writeFile(
      credentialsPath,
      `windsurf_api_key = "${token}"\n${baseUrl ? `api_server_url = "${baseUrl}"\n` : ""}`,
    );
  };
  const context = (overrides: Partial<DevinExecutionContext> = {}): DevinExecutionContext =>
    ({
      instanceId: "work",
      label: "Devin work",
      account:
        authKind === "isolated" ? { kind: "isolated", ownerId: "work" } : { kind: "default" },
      location: posix("/project"),
      binaryIdentity: "devin",
      runtimeTarget: "local",
      configGeneration: "gen",
      roots: {
        configRoot: base,
        dataRoot: base,
        credentialsPath,
        nativeConfigPath: join(base, "devin", "config.json"),
        manifestPath: "",
      },
      // The effective-config reader resolves the account's OWN root, keeping
      // org reads off the host's real native config.
      env: { XDG_CONFIG_HOME: base, XDG_DATA_HOME: base },
      requiresConfigSeed: false,
      prefixArgs: [],
      generation: "gen",
      ...overrides,
    }) as DevinExecutionContext;
  const writeConfig = async (config: unknown) => {
    await writeFile(join(base, "devin", "config.json"), JSON.stringify(config));
  };
  return { base, context, writeCredentials, writeConfig };
}

const identityResponse = (userId: string) =>
  new Response(JSON.stringify({ userStatus: { userId, teamId: "t", email: "x@y.z" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("devin credential fingerprint", () => {
  beforeEach(() => resetDevinAccountIdentityCaches());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("expands the native credential root inside the distro shell, including spaces", async () => {
    const fx = await fixture("default");
    const dataRoot = join(fx.base, "data with spaces");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(dataRoot, "devin"), { recursive: true });
    await writeFile(
      join(dataRoot, "devin", "credentials.toml"),
      'windsurf_api_key = "fixture-distro-key"\n',
    );
    const location = { kind: "wsl" as const, distro: "Ubuntu", linuxPath: "/project", uncPath: "" };
    vi.mocked(batchWslCommandsAsync).mockImplementationOnce(async (_distro, scripts) => {
      const results = [];
      for (const script of scripts) {
        const { stdout, stderr } = await promisify(execFile)("/bin/sh", ["-c", script], {
          env: { ...process.env, XDG_DATA_HOME: dataRoot, WINDSURF_API_KEY: "" },
        });
        results.push({ ok: true, stdout, stderr });
      }
      return results;
    });
    await expect(
      readDevinContextCredential(fx.context({ location, roots: devinDefaultRoots(location) })),
    ).resolves.toEqual({ token: "fixture-distro-key" });
  });

  it("tracks the declared source: scoped file for isolated accounts, never the host env key", async () => {
    vi.stubEnv("WINDSURF_API_KEY", "host-key");
    const fx = await fixture("isolated");
    const isolated = fx.context();
    await expect(devinCredentialFingerprint(isolated)).resolves.toBe("missing");
    await fx.writeCredentials("tok-1");
    const withCredential = fx.context();
    const fingerprint = await devinCredentialFingerprint(withCredential);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    // Content-keyed: a new context object over the same file shares the value.
    await expect(devinCredentialFingerprint(fx.context())).resolves.toBe(fingerprint);
    // The credential value never appears in any derived string.
    expect(fingerprint).not.toContain("tok-1");
  });
  it("keeps a literal WSL credential path quoted and ignores the host key for isolated accounts", async () => {
    const fx = await fixture("isolated");
    const root = join(fx.base, "literal ' $(printf injected) root");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(root, { recursive: true });
    const path = join(root, "credentials.toml");
    await writeFile(path, 'windsurf_api_key = "fixture-isolated-key"\n');
    const location = { kind: "wsl" as const, distro: "Ubuntu", linuxPath: "/project", uncPath: "" };
    vi.mocked(batchWslCommandsAsync).mockImplementationOnce(async (_distro, scripts) => {
      const results = [];
      for (const script of scripts) {
        const { stdout, stderr } = await promisify(execFile)("/bin/sh", ["-c", script], {
          env: { ...process.env, WINDSURF_API_KEY: "fixture-host-key" },
        });
        results.push({ ok: true, stdout, stderr });
      }
      return results;
    });
    await expect(
      readDevinContextCredential(
        fx.context({ location, roots: { ...fx.context().roots, credentialsPath: path } }),
      ),
    ).resolves.toEqual({ token: "fixture-isolated-key" });
  });

  it("honors the native env key only for a validated default account", async () => {
    vi.stubEnv("WINDSURF_API_KEY", "host-key");
    const fx = await fixture("default");
    const envBased = await devinCredentialFingerprint(fx.context());
    expect(envBased).toMatch(/^[0-9a-f]{64}$/);
    vi.stubEnv("WINDSURF_API_KEY", "host-key-rotated");
    // A new context re-reads the CURRENT source: the fingerprint moved.
    await expect(devinCredentialFingerprint(fx.context())).resolves.not.toBe(envBased);
  });

  it("changes when the credential rotates and fails typed on an unreadable source", async () => {
    const fx = await fixture("isolated");
    await fx.writeCredentials("tok-1");
    const before = await devinCredentialFingerprint(fx.context());
    await fx.writeCredentials("tok-2");
    await expect(devinCredentialFingerprint(fx.context())).resolves.not.toBe(before);
    await chmod(join(fx.base, "devin", "credentials.toml"), 0o000);
    await expect(devinCredentialFingerprint(fx.context())).rejects.toMatchObject({
      name: "DevinAccountIdentityError",
      code: "auth-source-unreadable",
    });
  });

  it("reads the token from the credential source without echoing it", async () => {
    const fx = await fixture("isolated");
    await fx.writeCredentials("tok-secret", "https://server.example.com");
    const credential = await readDevinContextCredential(fx.context());
    expect(credential).toEqual({ token: "tok-secret", baseUrl: "https://server.example.com" });
  });
});

describe("devin stable account identity proof", () => {
  beforeEach(() => {
    resetDevinAccountIdentityCaches();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("proves the user id over the collector's endpoint and caches per credential", async () => {
    const fx = await fixture("isolated");
    await fx.writeCredentials("tok-1");
    fetchMock.mockResolvedValue(identityResponse("user-1"));
    const identity = await resolveDevinProvenScopeIdentity(fx.context());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as unknown as [
      URL,
      { method: string; redirect: string; headers: Record<string, string>; body: string },
    ];
    expect(String(url)).toBe(
      "https://server.codeium.com/exa.seat_management_pb.SeatManagementService/GetUserStatus",
    );
    expect(request.method).toBe("POST");
    expect(request.redirect).toBe("error");
    expect(request.headers["Connect-Protocol-Version"]).toBe("1");
    // Same credential: the cached proof serves the identical identity with no
    // further network round trip.
    await expect(resolveDevinProvenScopeIdentity(fx.context())).resolves.toBe(identity);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The identity is opaque: no token, no raw user id, no root path.
    expect(identity).not.toContain("tok-1");
    expect(identity).not.toContain("user-1");
    expect(identity).toMatch(/^devin-session-scope-3:[0-9a-f]{32}$/);
  });

  it("binds the EFFECTIVE org: an inherited config org move breaks old refs, model edits do not", async () => {
    const fx = await fixture("isolated");
    await fx.writeCredentials("tok-1");
    fetchMock.mockResolvedValue(identityResponse("user-1"));
    // No org anywhere: the org-less binding.
    const orgless = await resolveDevinProvenScopeIdentity(fx.context());
    // An org inherited through the config the session actually resolves
    // (the account root's own devin/config.json) enters the binding.
    await fx.writeConfig({ version: 1, devin: { org_id: "org-1", model: "swe-1-7" } });
    const withOrg = await resolveDevinProvenScopeIdentity(fx.context());
    expect(withOrg).not.toBe(orgless);
    // A settings org wins outright (the launch seeds it into the view).
    const withSettingsOrg = await resolveDevinProvenScopeIdentity(
      fx.context({ orgId: "org-settings" }),
    );
    expect(withSettingsOrg).not.toBe(withOrg);
    expect(withSettingsOrg).not.toBe(orgless);
    // Model/policy edits in the same file NEVER invalidate the binding.
    await fx.writeConfig({ version: 1, devin: { org_id: "org-1", model: "kimi-k3-high" } });
    await expect(resolveDevinProvenScopeIdentity(fx.context())).resolves.toBe(withOrg);
    // A changed org at the SAME user/root/path is a new scope: pre-change
    // resume refs must mismatch (never silently reattach cross-org).
    await fx.writeConfig({ version: 1, devin: { org_id: "org-2" } });
    const afterOrgChange = await resolveDevinProvenScopeIdentity(fx.context());
    expect(afterOrgChange).not.toBe(withOrg);
  });

  it("fails typed on a corrupt or type-violating effective org source", async () => {
    const fx = await fixture("isolated");
    await fx.writeCredentials("tok-1");
    fetchMock.mockResolvedValue(identityResponse("user-1"));
    // An unparseable config is ambiguity, not absence: the binding fails
    // visibly instead of launching org-less.
    await writeFile(join(fx.base, "devin", "config.json"), "{ not json");
    await expect(resolveDevinProvenScopeIdentity(fx.context())).rejects.toMatchObject({
      name: "DevinAccountIdentityError",
      code: "org-selection-unreadable",
    });
    // A non-string org id is equally ambiguous.
    await fx.writeConfig({ devin: { org_id: 42 } });
    await expect(resolveDevinProvenScopeIdentity(fx.context())).rejects.toMatchObject({
      code: "org-selection-unreadable",
    });
    // An explicitly cleared org returns to the org-less binding.
    await fx.writeConfig({ devin: { org_id: null } });
    await expect(resolveDevinProvenScopeIdentity(fx.context())).resolves.toBeDefined();
  });

  it("preserves resume across a same-user rotation and refuses a different user", async () => {
    const fx = await fixture("isolated");
    await fx.writeCredentials("tok-1");
    fetchMock.mockResolvedValue(identityResponse("user-1"));
    const before = await resolveDevinProvenScopeIdentity(fx.context());
    // Rotation: same account (user-1), new token.
    resetDevinAccountIdentityCaches();
    await fx.writeCredentials("tok-2");
    fetchMock.mockResolvedValue(identityResponse("user-1"));
    const afterSameUser = await resolveDevinProvenScopeIdentity(fx.context());
    expect(afterSameUser).toBe(before);
    // Different login at the SAME root: the binding moves and the old resume
    // ref is rejected instead of reattached.
    resetDevinAccountIdentityCaches();
    fetchMock.mockResolvedValue(identityResponse("user-2"));
    const afterDifferentUser = await resolveDevinProvenScopeIdentity(fx.context());
    expect(afterDifferentUser).not.toBe(before);
    expect(afterDifferentUser).not.toBe(afterSameUser);
  });

  it("fails typed and localized on a rejected credential", async () => {
    const fx = await fixture("isolated");
    await fx.writeCredentials("tok-1");
    fetchMock.mockResolvedValue(new Response("denied", { status: 401 }));
    const failure = await resolveDevinProvenScopeIdentity(fx.context()).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(DevinAccountIdentityError);
    expect((failure as DevinAccountIdentityError).code).toBe("auth-rejected");
    const surfaced = identityUnavailable(failure as DevinAccountIdentityError);
    // The localized shared summary is preserved; the typed cause rides the
    // details block and the stable code stays on the error.
    expect(surfaced.message).toContain("cannot launch with its current login");
    expect(surfaced).toMatchObject({ code: "account-identity-auth-rejected" });
    // Failed proofs stay retryable: nothing was cached.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses non-HTTPS or decorated endpoints before any request", async () => {
    const fx = await fixture("isolated");
    await fx.writeCredentials("tok-1", "http://server.example.com");
    await expect(resolveDevinProvenScopeIdentity(fx.context())).rejects.toMatchObject({
      code: "auth-response-invalid",
    });
    await fx.writeCredentials("tok-1", "https://user:pass@server.example.com");
    await expect(resolveDevinProvenScopeIdentity(fx.context())).rejects.toMatchObject({
      code: "auth-response-invalid",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed, oversized, and unreachable responses without echoing them", async () => {
    const fx = await fixture("isolated");
    await fx.writeCredentials("tok-1");
    const rejectionOf = (promise: Promise<unknown>) =>
      promise.then(
        () => undefined,
        (identityError: DevinAccountIdentityError) => identityError,
      );
    // Missing userId.
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ userStatus: {} }), { status: 200 }));
    expect((await rejectionOf(resolveDevinProvenScopeIdentity(fx.context())))?.code).toBe(
      "auth-response-invalid",
    );
    // Not JSON.
    fetchMock.mockResolvedValue(new Response("<html>", { status: 200 }));
    expect((await rejectionOf(resolveDevinProvenScopeIdentity(fx.context())))?.code).toBe(
      "auth-response-invalid",
    );
    // Oversized declared body.
    fetchMock.mockResolvedValue(
      new Response("{}", { status: 200, headers: { "content-length": String(1024 * 1024) } }),
    );
    expect((await rejectionOf(resolveDevinProvenScopeIdentity(fx.context())))?.code).toBe(
      "auth-response-invalid",
    );
    // Network failure.
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect((await rejectionOf(resolveDevinProvenScopeIdentity(fx.context())))?.code).toBe(
      "auth-unreachable",
    );
    // Every typed failure message stays free of the credential and the
    // response payload — only the request itself carries the token.
  });

  it("fails with auth-missing when no usable credential exists at the source", async () => {
    const fx = await fixture("isolated");
    await expect(resolveDevinProvenScopeIdentity(fx.context())).rejects.toMatchObject({
      code: "auth-missing",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
