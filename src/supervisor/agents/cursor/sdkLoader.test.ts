import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadCursorSdk } from "./sdkLoader";
import {
  classifyCursorSdkRuntimeError,
  cursorSdkPlatformPackageName,
  isSupportedCursorSdkNodeVersion,
  isSupportedCursorSdkVersion,
  type CursorSdkLoadResult,
} from "./sdkLoaderSupport";
import type { CursorSdkLoadOptions } from "./sdkPackageDiscovery";

const TEST_PLATFORM: NodeJS.Platform = "linux";
const TEST_ARCH = "x64";
const TEST_HELPER = "@cursor/sdk-linux-x64";
const TEST_SDK_VERSION = "1.0.24";
const createdDirectories: string[] = [];

interface FakePackageOptions {
  version?: string;
  packageName?: string;
  helperVersion?: string;
  installHelper?: boolean;
  moduleSource?: string;
  exportTarget?: string;
}

interface FakePackage {
  root: string;
  nodeModulesRoot: string;
  packageRoot: string;
  entryPath: string;
  helperRoot: string;
}

const VALID_MODULE_SOURCE = `
export class Agent {
  static async create(options) { return { agentId: "new-agent", options }; }
  static async resume(agentId, options) { return { agentId, options }; }
}
export class Cursor {
  static models = { async list() { return []; } };
}
`;

afterEach(async () => {
  await Promise.all(
    createdDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function makeFakePackage(options: FakePackageOptions = {}): Promise<FakePackage> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "poracode-cursor-sdk-loader-")));
  createdDirectories.push(root);
  const nodeModulesRoot = join(root, "node_modules");
  const packageRoot = join(nodeModulesRoot, "@cursor", "sdk");
  const entryPath = join(packageRoot, "index.mjs");
  const helperRoot = join(nodeModulesRoot, "@cursor", "sdk-linux-x64");
  const version = options.version ?? TEST_SDK_VERSION;
  const helperVersion = options.helperVersion ?? version;

  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({
      name: options.packageName ?? "@cursor/sdk",
      version,
      type: "module",
      exports: {
        ".": {
          import: options.exportTarget ?? "./index.mjs",
        },
      },
      optionalDependencies: {
        [TEST_HELPER]: version,
      },
    }),
  );
  await writeFile(entryPath, options.moduleSource ?? VALID_MODULE_SOURCE);

  if (options.installHelper !== false) {
    await mkdir(helperRoot, { recursive: true });
    await writeFile(
      join(helperRoot, "package.json"),
      JSON.stringify({ name: TEST_HELPER, version: helperVersion }),
    );
  }

  return { root, nodeModulesRoot, packageRoot, entryPath, helperRoot };
}

function baseOptions(overrides: CursorSdkLoadOptions = {}): CursorSdkLoadOptions {
  return {
    includeGlobal: false,
    nodeVersion: "22.13.0",
    platform: TEST_PLATFORM,
    arch: TEST_ARCH,
    apiKey: "test-key",
    env: {},
    ...overrides,
  };
}

function expectSuccess(result: CursorSdkLoadResult) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Expected success, got ${result.diagnostic.code}`);
  return result.value;
}

describe("loadCursorSdk discovery", () => {
  it("loads an explicitly configured package directory without a package dependency", async () => {
    const fake = await makeFakePackage();

    const loaded = expectSuccess(
      await loadCursorSdk(baseOptions({ configuredPath: fake.packageRoot })),
    );

    expect(loaded.source).toBe("configured");
    expect(loaded.packageRoot).toBe(fake.packageRoot);
    expect(loaded.entryPath).toBe(fake.entryPath);
    expect(loaded.version).toBe(TEST_SDK_VERSION);
    expect(loaded.platformHelper).toEqual({
      name: TEST_HELPER,
      packageRoot: fake.helperRoot,
      version: TEST_SDK_VERSION,
    });
    expect(loaded.authSource).toBe("option");
    expect(loaded.module.Agent.create).toBeTypeOf("function");
    expect(loaded.module.Agent.resume).toBeTypeOf("function");
    expect(loaded.module.Cursor.models.list).toBeTypeOf("function");
  });

  it("accepts a configured entry file and a configured node_modules root", async () => {
    const fromEntry = await makeFakePackage();
    const fromModules = await makeFakePackage();

    expect(
      expectSuccess(await loadCursorSdk(baseOptions({ configuredPath: fromEntry.entryPath })))
        .packageRoot,
    ).toBe(fromEntry.packageRoot);
    expect(
      expectSuccess(
        await loadCursorSdk(baseOptions({ configuredPath: fromModules.nodeModulesRoot })),
      ).packageRoot,
    ).toBe(fromModules.packageRoot);
  });

  it("discovers the nearest project ancestor installation", async () => {
    const fake = await makeFakePackage();
    const nestedProject = join(fake.root, "workspace", "packages", "app");
    await mkdir(nestedProject, { recursive: true });

    const loaded = expectSuccess(await loadCursorSdk(baseOptions({ projectCwd: nestedProject })));

    expect(loaded.source).toBe("project");
    expect(loaded.packageRoot).toBe(fake.packageRoot);
  });

  it("discovers NODE_PATH and explicit global installations", async () => {
    const fromNodePath = await makeFakePackage();
    const fromExplicitRoot = await makeFakePackage();
    const emptyProject = await mkdtemp(join(tmpdir(), "poracode-cursor-empty-project-"));
    createdDirectories.push(emptyProject);

    const nodePathLoaded = expectSuccess(
      await loadCursorSdk(
        baseOptions({
          projectCwd: emptyProject,
          includeGlobal: true,
          env: { NODE_PATH: `${fromNodePath.nodeModulesRoot}${delimiter}` },
        }),
        { resolvePackageManagerRoots: async () => [] },
      ),
    );
    expect(nodePathLoaded.source).toBe("node-path");

    const explicitLoaded = expectSuccess(
      await loadCursorSdk(
        baseOptions({
          projectCwd: emptyProject,
          includeGlobal: true,
          env: {},
          globalPackageRoots: [fromExplicitRoot.nodeModulesRoot],
        }),
        { resolvePackageManagerRoots: async () => [] },
      ),
    );
    expect(explicitLoaded.source).toBe("global-explicit");
  });

  it("uses npm/pnpm global roots returned by the safe host probe", async () => {
    const fake = await makeFakePackage();
    const emptyProject = await mkdtemp(join(tmpdir(), "poracode-cursor-empty-project-"));
    createdDirectories.push(emptyProject);

    const loaded = expectSuccess(
      await loadCursorSdk(
        baseOptions({
          projectCwd: emptyProject,
          includeGlobal: true,
          env: {},
        }),
        {
          resolvePackageManagerRoots: async () => [
            { root: join(emptyProject, "missing"), source: "global-npm" },
            { root: fake.nodeModulesRoot, source: "global-pnpm" },
          ],
        },
      ),
    );

    expect(loaded.source).toBe("global-pnpm");
  });

  it("does not fall back when an explicit path points at another package", async () => {
    const invalid = await makeFakePackage({ packageName: "cursor-agent" });
    const valid = await makeFakePackage();

    const result = await loadCursorSdk(
      baseOptions({
        configuredPath: invalid.packageRoot,
        includeGlobal: true,
        globalPackageRoots: [valid.nodeModulesRoot],
      }),
      { resolvePackageManagerRoots: async () => [] },
    );

    expect(result).toMatchObject({
      ok: false,
      diagnostic: { code: "configured_path_invalid" },
    });
  });

  it("reports all checked locations when the package is missing", async () => {
    const emptyProject = await mkdtemp(join(tmpdir(), "poracode-cursor-empty-project-"));
    createdDirectories.push(emptyProject);

    const result = await loadCursorSdk(baseOptions({ projectCwd: emptyProject }));

    expect(result).toMatchObject({
      ok: false,
      diagnostic: {
        code: "package_missing",
        details: { checkedPaths: expect.arrayContaining([]) },
      },
    });
    const checkedPaths = result.ok ? [] : result.diagnostic.details?.checkedPaths;
    expect(checkedPaths).toContain(join(emptyProject, "node_modules", "@cursor", "sdk"));
  });
});

describe("loadCursorSdk compatibility checks", () => {
  it("rejects Node versions older than 22.13 before package discovery", async () => {
    const result = await loadCursorSdk(baseOptions({ nodeVersion: "v22.12.9" }));
    expect(result).toMatchObject({
      ok: false,
      diagnostic: { code: "node_incompatible" },
    });
  });

  it("reports WSL as a cross-environment worker requirement", async () => {
    const result = await loadCursorSdk(
      baseOptions({ environment: { kind: "wsl", distro: "Ubuntu-24.04" } }),
    );
    expect(result).toMatchObject({
      ok: false,
      diagnostic: {
        code: "cross_environment_unsupported",
        details: { distro: "Ubuntu-24.04" },
      },
    });
  });

  it("rejects platforms for which Cursor publishes no helper", async () => {
    const result = await loadCursorSdk(baseOptions({ platform: "freebsd", arch: "riscv64" }));
    expect(result).toMatchObject({
      ok: false,
      diagnostic: { code: "platform_unsupported" },
    });
  });

  it("rejects incompatible SDK major versions", async () => {
    const fake = await makeFakePackage({ version: "2.0.0" });
    const result = await loadCursorSdk(baseOptions({ configuredPath: fake.packageRoot }));
    expect(result).toMatchObject({
      ok: false,
      diagnostic: { code: "version_incompatible" },
    });
  });

  it("rejects SDK versions older than the audited local-agent API", async () => {
    const fake = await makeFakePackage({ version: "1.0.23", helperVersion: "1.0.23" });
    const result = await loadCursorSdk(baseOptions({ configuredPath: fake.packageRoot }));

    expect(result).toEqual({
      ok: false,
      diagnostic: {
        code: "version_incompatible",
        message:
          "Cursor SDK 1.0.23 is not compatible with this integration; install version 1.0.24 or later in the stable 1.x series.",
        recoverable: true,
        details: {
          detectedVersion: "1.0.23",
          supportedRange: ">=1.0.24 <2.0.0",
        },
      },
    });
  });

  it("distinguishes missing and mismatched platform helpers", async () => {
    const missing = await makeFakePackage({ installHelper: false });
    const mismatched = await makeFakePackage({ helperVersion: "1.0.23" });

    const missingResult = await loadCursorSdk(baseOptions({ configuredPath: missing.packageRoot }));
    expect(missingResult).toMatchObject({
      ok: false,
      diagnostic: { code: "platform_helper_missing" },
    });

    const mismatchResult = await loadCursorSdk(
      baseOptions({ configuredPath: mismatched.packageRoot }),
    );
    expect(mismatchResult).toMatchObject({
      ok: false,
      diagnostic: { code: "platform_helper_incompatible" },
    });
  });

  it("rejects entry points outside the package directory", async () => {
    const fake = await makeFakePackage({ exportTarget: "../../../outside.mjs" });
    await writeFile(join(fake.root, "outside.mjs"), VALID_MODULE_SOURCE);

    const result = await loadCursorSdk(baseOptions({ configuredPath: fake.packageRoot }));

    expect(result).toMatchObject({
      ok: false,
      diagnostic: { code: "package_invalid" },
    });
  });

  it("validates only the stable public API essentials", async () => {
    const fake = await makeFakePackage({
      moduleSource: `
        export class Agent { static async create() {} }
        export class Cursor { static models = { async list() { return []; } }; }
      `,
    });

    const result = await loadCursorSdk(baseOptions({ configuredPath: fake.packageRoot }));

    expect(result).toMatchObject({
      ok: false,
      diagnostic: {
        code: "module_api_incompatible",
        details: { missingExports: ["Agent.resume"] },
      },
    });
  });

  it("accepts the public API under a CommonJS-style default export", async () => {
    const fake = await makeFakePackage();
    const Agent = {
      create: async () => ({}),
      resume: async () => ({}),
    };
    const Cursor = { models: { list: async () => [] } };

    const loaded = expectSuccess(
      await loadCursorSdk(baseOptions({ configuredPath: fake.packageRoot }), {
        importModule: async () => ({ default: { Agent, Cursor } }),
      }),
    );

    expect(loaded.module.Agent).toBe(Agent);
    expect(loaded.module.Cursor).toBe(Cursor);
  });

  it("distinguishes import failures from missing packages", async () => {
    const fake = await makeFakePackage();

    const result = await loadCursorSdk(baseOptions({ configuredPath: fake.packageRoot }), {
      importModule: async () => {
        throw Object.assign(new Error("broken transitive dependency"), {
          code: "ERR_MODULE_NOT_FOUND",
        });
      },
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostic: { code: "module_load_failed" },
    });
  });
});

describe("loadCursorSdk authentication", () => {
  it("reports missing API-key auth after validating the installed SDK", async () => {
    const fake = await makeFakePackage();

    const result = await loadCursorSdk(
      baseOptions({
        configuredPath: fake.packageRoot,
        apiKey: " ",
        env: {},
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      diagnostic: { code: "auth_missing" },
    });
  });

  it("recognizes CURSOR_API_KEY without returning its value", async () => {
    const fake = await makeFakePackage();
    const options = baseOptions({
      configuredPath: fake.packageRoot,
      env: { CURSOR_API_KEY: "environment-secret" },
    });
    delete options.apiKey;

    const loaded = expectSuccess(await loadCursorSdk(options));

    expect(loaded.authSource).toBe("environment");
    expect(JSON.stringify(loaded)).not.toContain("environment-secret");
  });
});

describe("Cursor SDK version and runtime diagnostics", () => {
  it("implements the documented Node >=22.13 boundary", () => {
    expect(isSupportedCursorSdkNodeVersion("22.12.99")).toBe(false);
    expect(isSupportedCursorSdkNodeVersion("v22.13.0")).toBe(true);
    expect(isSupportedCursorSdkNodeVersion("22.13")).toBe(true);
    expect(isSupportedCursorSdkNodeVersion("23.0.0")).toBe(true);
    expect(isSupportedCursorSdkNodeVersion("not-a-version")).toBe(false);
  });

  it("accepts audited stable 1.x releases and rejects older, prerelease, and other majors", () => {
    expect(isSupportedCursorSdkVersion("1.0.23")).toBe(false);
    expect(isSupportedCursorSdkVersion("1.0.24")).toBe(true);
    expect(isSupportedCursorSdkVersion("1.1.0")).toBe(true);
    expect(isSupportedCursorSdkVersion("1.99.4")).toBe(true);
    expect(isSupportedCursorSdkVersion("1.0.24-beta.1")).toBe(false);
    expect(isSupportedCursorSdkVersion("0.99.0")).toBe(false);
    expect(isSupportedCursorSdkVersion("2.0.0")).toBe(false);
  });

  it("maps only platform packages published by Cursor", () => {
    expect(cursorSdkPlatformPackageName("darwin", "arm64")).toBe("@cursor/sdk-darwin-arm64");
    expect(cursorSdkPlatformPackageName("darwin", "x64")).toBe("@cursor/sdk-darwin-x64");
    expect(cursorSdkPlatformPackageName("linux", "arm64")).toBe("@cursor/sdk-linux-arm64");
    expect(cursorSdkPlatformPackageName("linux", "x64")).toBe("@cursor/sdk-linux-x64");
    expect(cursorSdkPlatformPackageName("win32", "x64")).toBe("@cursor/sdk-win32-x64");
    expect(cursorSdkPlatformPackageName("win32", "arm64")).toBeUndefined();
  });

  it("classifies invalid auth and late platform-helper import failures", () => {
    const auth = Object.assign(new Error("nope"), {
      name: "AuthenticationError",
      status: 401,
    });
    expect(classifyCursorSdkRuntimeError(auth)).toMatchObject({ code: "auth_invalid" });
    for (const code of ["unauthenticated", "BAD_API_KEY", "BAD_USER_API_KEY"]) {
      expect(
        classifyCursorSdkRuntimeError(Object.assign(new Error("nope"), { code })),
      ).toMatchObject({ code: "auth_invalid" });
    }

    const helper = Object.assign(new Error("Cannot find package '@cursor/sdk-linux-x64'"), {
      code: "ERR_MODULE_NOT_FOUND",
    });
    expect(classifyCursorSdkRuntimeError(helper)).toMatchObject({
      code: "platform_helper_missing",
      details: { platformHelper: "@cursor/sdk-linux-x64" },
    });
    expect(classifyCursorSdkRuntimeError(new Error("network failed"))).toBeUndefined();
  });
});
