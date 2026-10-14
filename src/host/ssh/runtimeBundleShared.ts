import { join } from "node:path";
import packageJson from "../../../package.json" with { type: "json" };
import { readBoundedRuntimeFileSync } from "@/shared/readBoundedRuntimeFile";
import {
  RUNTIME_CODE_MAX_FILE_BYTES,
  RUNTIME_MANIFEST_MAX_BYTES,
} from "@/shared/runtimeCodeManifest";

/** Inputs shared by the synchronous (build script) and asynchronous (worker) bundle builders. */
export interface SshRuntimeBundleOptions {
  readonly mainBundleDir: string;
  readonly agentPluginsDir: string;
  readonly wslHelpersDir: string;
  readonly bundledSkillsDir?: string;
  readonly bundledPluginsDir?: string;
  readonly cacheDir: string;
  readonly tarCommand?: string;
}

export interface SshRuntimeBundle {
  readonly archivePath: string;
  readonly hash: string;
  readonly version: string;
}

export interface BundleManifest {
  readonly key: string;
  readonly signature: string;
  readonly hash: string;
}

export function manifestPath(cacheDir: string): string {
  return join(cacheDir, "bundle-manifest.json");
}

export function readBundleManifest(cacheDir: string): BundleManifest | null {
  try {
    const value = JSON.parse(
      readBoundedRuntimeFileSync(manifestPath(cacheDir), RUNTIME_MANIFEST_MAX_BYTES).toString(
        "utf8",
      ),
    ) as Partial<BundleManifest> | null;
    return value &&
      typeof value.key === "string" &&
      typeof value.signature === "string" &&
      typeof value.hash === "string" &&
      /^[a-f0-9]{64}$/u.test(value.hash)
      ? (value as BundleManifest)
      : null;
  } catch {
    return null;
  }
}

export function runtimePackageJson(dependencyNames: readonly string[]): string {
  const availableDependencies: Readonly<Record<string, string>> = packageJson.dependencies;
  const dependencies = Object.fromEntries(
    dependencyNames.map((name) => {
      const version = availableDependencies[name];
      if (!Object.hasOwn(availableDependencies, name) || typeof version !== "string" || !version)
        throw new Error(`Missing remote runtime dependency ${name}.`);
      return [name, version];
    }),
  );
  return `${JSON.stringify(
    {
      name: "poracode-ssh-runtime",
      version: packageJson.version,
      private: true,
      engines: packageJson.engines,
      dependencies,
    },
    null,
    2,
  )}\n`;
}

export function assertHeadlessServerBundle(path: string): void {
  const source = readBoundedRuntimeFileSync(path, RUNTIME_CODE_MAX_FILE_BYTES).toString("utf8");
  if (/\brequire\(["']electron["']\)|\bimport\(["']electron["']\)/.test(source)) {
    throw new Error(
      "Poracode Helper cannot include Electron. Check the standalone server import graph.",
    );
  }
}

export function sshRuntimeVersion(): string {
  return packageJson.version;
}
