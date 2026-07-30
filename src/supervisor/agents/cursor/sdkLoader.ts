import { pathToFileURL } from "node:url";
import {
  CURSOR_SDK_MIN_SUPPORTED_VERSION,
  CURSOR_SDK_SUPPORTED_RANGE,
} from "@/shared/agents/cursorSdkPackage";
import {
  discoverCursorSdkPackage,
  resolveCursorSdkPackageEntry,
  resolveCursorSdkPlatformHelper,
  type CursorSdkLoaderDependencies,
  type CursorSdkLoadOptions,
} from "./sdkPackageDiscovery";
import {
  classifyCursorSdkRuntimeError,
  cursorSdkFailure,
  cursorSdkPlatformPackageName,
  isSupportedCursorSdkNodeVersion,
  isSupportedCursorSdkVersion,
  resolveCursorSdkAuthSource,
  safeCursorSdkErrorSummary,
  validateCursorSdkModule,
  type CursorSdkLoadResult,
} from "./sdkLoaderSupport";

export type { CursorSdkModule } from "./sdkLoaderSupport";

export async function loadCursorSdk(
  options: CursorSdkLoadOptions = {},
  dependencies: CursorSdkLoaderDependencies = {},
): Promise<CursorSdkLoadResult> {
  const environment = options.environment ?? { kind: "native" };
  if (environment.kind === "wsl") {
    return cursorSdkFailure(
      "cross_environment_unsupported",
      "The Cursor SDK must run inside the target WSL distribution; it cannot be imported into the Windows supervisor process.",
      true,
      { distro: environment.distro },
    );
  }

  const nodeVersion = options.nodeVersion ?? process.versions.node;
  if (!isSupportedCursorSdkNodeVersion(nodeVersion)) {
    return cursorSdkFailure(
      "node_incompatible",
      "The Cursor SDK requires Node.js 22.13 or later.",
      true,
      {
        detectedVersion: nodeVersion,
        minimumVersion: "22.13.0",
      },
    );
  }

  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const platformHelperName = cursorSdkPlatformPackageName(platform, arch);
  if (!platformHelperName) {
    return cursorSdkFailure(
      "platform_unsupported",
      `The Cursor SDK does not publish a platform helper for ${platform}-${arch}.`,
      false,
      { platform, arch },
    );
  }

  const discovery = await discoverCursorSdkPackage(options, dependencies);
  if ("diagnostic" in discovery) return { ok: false, diagnostic: discovery.diagnostic };
  const pkg = discovery;

  if (!isSupportedCursorSdkVersion(pkg.version)) {
    return cursorSdkFailure(
      "version_incompatible",
      `Cursor SDK ${pkg.version} is not compatible with this integration; install version ${CURSOR_SDK_MIN_SUPPORTED_VERSION} or later in the stable 1.x series.`,
      true,
      { detectedVersion: pkg.version, supportedRange: CURSOR_SDK_SUPPORTED_RANGE },
    );
  }

  const entry = await resolveCursorSdkPackageEntry(pkg);
  if ("diagnostic" in entry) return { ok: false, diagnostic: entry.diagnostic };

  const helper = await resolveCursorSdkPlatformHelper(pkg, platformHelperName);
  if ("diagnostic" in helper) return { ok: false, diagnostic: helper.diagnostic };

  let imported: unknown;
  try {
    imported = await (dependencies.importModule ?? importExternalModule)(
      pathToFileURL(entry.entryPath).href,
    );
  } catch (error) {
    const classified = classifyCursorSdkRuntimeError(error);
    if (classified?.code === "platform_helper_missing") {
      return { ok: false, diagnostic: classified };
    }
    return cursorSdkFailure(
      "module_load_failed",
      "The installed Cursor SDK could not be imported.",
      true,
      {
        reason: safeCursorSdkErrorSummary(error),
        entryPath: entry.entryPath,
      },
    );
  }

  const validatedModule = validateCursorSdkModule(imported);
  if (!validatedModule.ok) {
    return cursorSdkFailure(
      "module_api_incompatible",
      "The installed package does not expose the expected public Cursor SDK API.",
      true,
      { missingExports: validatedModule.missing },
    );
  }

  const env = options.env ?? process.env;
  const authSource = resolveCursorSdkAuthSource(options.apiKey, env);
  if (!authSource) {
    return cursorSdkFailure(
      "auth_missing",
      "The Cursor SDK requires an API key; the installed cursor-agent login cannot be reused.",
      true,
      { environmentVariable: "CURSOR_API_KEY" },
    );
  }

  return {
    ok: true,
    value: {
      module: validatedModule.module,
      packageRoot: pkg.packageRoot,
      packageJsonPath: pkg.packageJsonPath,
      entryPath: entry.entryPath,
      version: pkg.version,
      source: pkg.source,
      platformHelper: helper,
      authSource,
    },
  };
}

async function importExternalModule(specifier: string): Promise<unknown> {
  return import(specifier);
}
