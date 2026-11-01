import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { access, chmod, mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import * as Hex from "@kitlangton/hex";
import type { CreateOptions, HexHost } from "@kitlangton/hex";
import type { HexVoiceErrorCode } from "@/shared/contracts/hexVoice";

export const HEX_ENGINE_VERSION = "3.1.1";
const RELEASE_PREFIX = `https://github.com/anomalyco/hex/releases/download/v${HEX_ENGINE_VERSION}/`;
const INSTALL_TIMEOUT_MS = 10 * 60_000;
const PROBE_TIMEOUT_MS = 15_000;
const SIGNATURE_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;
const REDIRECT_HOSTS = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
  "github-releases.githubusercontent.com",
]);

export interface HexEngineAsset {
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly filename: string;
  readonly downloadBytes: number;
  readonly sha256: string;
  readonly archive: boolean;
}

export const HEX_ENGINE_ASSETS: readonly HexEngineAsset[] = [
  {
    platform: "linux",
    arch: "x64",
    filename: "hex-3.1.1-linux-x64",
    downloadBytes: 69_129_928,
    sha256: "913fc3523c25194b24721fe1d6a59a28b9b0136ef0cdf9d55eed7f21b19201d2",
    archive: false,
  },
  {
    platform: "linux",
    arch: "arm64",
    filename: "hex-3.1.1-linux-arm64",
    downloadBytes: 61_295_344,
    sha256: "f5b2c2e867348c4075f787a79f4673abd1b0c31e4c54cca867e53c795135dc7c",
    archive: false,
  },
  {
    platform: "win32",
    arch: "x64",
    filename: "hex-3.1.1-windows-x64.exe",
    downloadBytes: 67_126_200,
    sha256: "c5c0a6d2e60bd64a3968219d313330d33d469e3751a8b68c4ac0bd524eed71b5",
    archive: false,
  },
  {
    platform: "win32",
    arch: "arm64",
    filename: "hex-3.1.1-windows-arm64.exe",
    downloadBytes: 50_403_768,
    sha256: "ca209c5e742a31622a6ad114f7741af25a403489efde8187b23b3b079ccfd06f",
    archive: false,
  },
  {
    platform: "darwin",
    arch: "arm64",
    filename: "hex-3.1.1-macos-arm64.zip",
    downloadBytes: 26_502_891,
    sha256: "f07aeaa418521ef0253641dee24b95c884180bf41899bc1c5686f530f3668496",
    archive: true,
  },
];

const MIT_NOTICE = `MIT License

Copyright (c) 2026 Christopher Langton

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

export interface HexEngineSnapshot {
  state: "missing" | "installed" | "installing" | "unsupported" | "error";
  source: "managed" | "external" | null;
  version: string | null;
  availableVersion: string;
  downloadBytes: number | null;
  progress?: number;
  error?: HexVoiceErrorCode;
}

export interface HexEngineInstallerOptions {
  readonly managedDirectory: string;
  readonly platform?: NodeJS.Platform;
  readonly arch?: string;
  readonly glibcVersion?: string | null;
  readonly assets?: readonly HexEngineAsset[];
  readonly fetcher?: typeof fetch;
  readonly runCommand?: (
    command: string,
    args: readonly string[],
    options: { signal: AbortSignal; timeoutMs: number; env?: NodeJS.ProcessEnv },
  ) => Promise<void>;
  readonly probe?: (executable: string, signal: AbortSignal) => Promise<void>;
  readonly uuid?: () => string;
}

interface ActiveInstall {
  readonly schemaVersion: 1;
  readonly release: string;
  readonly version: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
}

class InstallerError extends Error {
  constructor(readonly code: HexVoiceErrorCode) {
    super(code);
  }
}

async function readHeader(path: string, length: number, position = 0): Promise<Buffer> {
  const file = await open(path, "r");
  try {
    const header = Buffer.alloc(length);
    const { bytesRead } = await file.read(header, 0, length, position);
    return header.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

async function verifyLinuxElf(path: string, arch: string): Promise<void> {
  const header = await readHeader(path, 20);
  const machine = arch === "x64" ? 62 : arch === "arm64" ? 183 : -1;
  if (
    header.length < 20 ||
    header[0] !== 0x7f ||
    header[1] !== 0x45 ||
    header[2] !== 0x4c ||
    header[3] !== 0x46 ||
    header[4] !== 2 ||
    header[5] !== 1 ||
    header.readUInt16LE(18) !== machine
  ) {
    throw new InstallerError("integrity");
  }
}

async function verifyWindowsPe(path: string, arch: string): Promise<void> {
  const file = await open(path, "r");
  try {
    const dosHeader = Buffer.alloc(64);
    const { bytesRead } = await file.read(dosHeader, 0, dosHeader.length, 0);
    const size = (await file.stat()).size;
    if (bytesRead < dosHeader.length || dosHeader[0] !== 0x4d || dosHeader[1] !== 0x5a) {
      throw new InstallerError("integrity");
    }
    const peOffset = dosHeader.readUInt32LE(0x3c);
    if (peOffset > 1024 * 1024 || peOffset > size - 6) {
      throw new InstallerError("integrity");
    }
    const peHeader = Buffer.alloc(6);
    const result = await file.read(peHeader, 0, peHeader.length, peOffset);
    const machine = arch === "x64" ? 0x8664 : arch === "arm64" ? 0xaa64 : -1;
    if (
      result.bytesRead !== peHeader.length ||
      peHeader[0] !== 0x50 ||
      peHeader[1] !== 0x45 ||
      peHeader[2] !== 0 ||
      peHeader[3] !== 0 ||
      peHeader.readUInt16LE(4) !== machine
    ) {
      throw new InstallerError("integrity");
    }
  } finally {
    await file.close();
  }
}

async function verifyZipHeader(path: string): Promise<void> {
  const header = await readHeader(path, 4);
  if (header.length !== 4 || !header.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    throw new InstallerError("integrity");
  }
}

function runtimeGlibcVersion(): string | null {
  try {
    const report = process.report?.getReport() as
      | { header?: { glibcVersionRuntime?: string } }
      | undefined;
    return report?.header?.glibcVersionRuntime ?? null;
  } catch {
    return null;
  }
}

function parseVersion(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

function compareVersion(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return -1;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return 0;
}

function defaultRunCommand(
  command: string,
  args: readonly string[],
  options: { signal: AbortSignal; timeoutMs: number; env?: NodeJS.ProcessEnv },
): Promise<void> {
  return new Promise((resolveCommand, rejectCommand) => {
    execFile(
      command,
      [...args],
      {
        encoding: "utf8",
        env: { ...process.env, ...options.env },
        maxBuffer: 1024 * 1024,
        shell: false,
        signal: options.signal,
        timeout: options.timeoutMs,
        windowsHide: true,
      },
      (error) => {
        if (error) rejectCommand(error);
        else resolveCommand();
      },
    );
  });
}

async function defaultProbe(executable: string, signal: AbortSignal): Promise<void> {
  let host: Pick<HexHost, "client" | "close"> | undefined;
  try {
    host = await Hex.create({
      command: [executable, "service", "--embedded"],
      signal,
      startupTimeoutMs: PROBE_TIMEOUT_MS,
    } satisfies CreateOptions);
    await host.client.models.list({ language: "en", signal });
  } finally {
    await host?.close().catch(() => {});
  }
}

function executableRelativePath(platform: NodeJS.Platform): string {
  if (platform === "win32") return "hex.exe";
  if (platform === "darwin") return join("Hex.app", "Contents", "MacOS", "hex");
  return "hex";
}

function isPermissionError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error.code === "EACCES" || error.code === "EPERM" || error.code === "EROFS")
  );
}

export class HexEngineInstaller {
  private readonly managedDirectory: string;
  private readonly platform: NodeJS.Platform;
  private readonly arch: string;
  private readonly glibcVersion: string | null;
  private readonly assets: readonly HexEngineAsset[];
  private readonly fetcher: typeof fetch;
  private readonly runCommand: NonNullable<HexEngineInstallerOptions["runCommand"]>;
  private readonly probe: NonNullable<HexEngineInstallerOptions["probe"]>;
  private readonly uuid: () => string;
  private installController: AbortController | undefined;
  private installOperation: Promise<void> | undefined;
  private installProgress: number | undefined;
  private lastError: HexVoiceErrorCode | undefined;

  constructor(options: HexEngineInstallerOptions) {
    const directory = resolve(options.managedDirectory);
    if (directory === dirname(directory)) throw new Error("managed engine directory is unsafe");
    this.managedDirectory = directory;
    this.platform = options.platform ?? process.platform;
    this.arch = options.arch ?? process.arch;
    this.glibcVersion =
      options.glibcVersion === undefined ? runtimeGlibcVersion() : options.glibcVersion;
    this.assets = options.assets ?? HEX_ENGINE_ASSETS;
    this.fetcher = options.fetcher ?? fetch;
    this.runCommand = options.runCommand ?? defaultRunCommand;
    this.probe = options.probe ?? defaultProbe;
    this.uuid = options.uuid ?? randomUUID;
  }

  get isInstalling(): boolean {
    return this.installOperation !== undefined;
  }

  get managedExecutable(): string | undefined {
    const installed = this.readActiveInstall();
    if (!installed || installed.platform !== this.platform || installed.arch !== this.arch) {
      return undefined;
    }
    const executable = join(
      this.managedDirectory,
      "releases",
      installed.release,
      executableRelativePath(this.platform),
    );
    try {
      accessSync(executable, this.platform === "win32" ? constants.F_OK : constants.X_OK);
      return executable;
    } catch {
      return undefined;
    }
  }

  snapshot(): HexEngineSnapshot {
    const compatibility = this.compatibility();
    const asset = compatibility.asset;
    if (this.isInstalling) {
      return {
        state: "installing",
        source: "managed",
        version: null,
        availableVersion: HEX_ENGINE_VERSION,
        downloadBytes: asset?.downloadBytes ?? null,
        ...(this.installProgress === undefined ? {} : { progress: this.installProgress }),
      };
    }
    const installed = this.readActiveInstall();
    if (!installed && existsSync(join(this.managedDirectory, "active.json"))) {
      return {
        state: "error",
        source: "managed",
        version: null,
        availableVersion: HEX_ENGINE_VERSION,
        downloadBytes: asset?.downloadBytes ?? null,
        error: "incompatible",
      };
    }
    if (installed && this.managedExecutable && compatibility.error) {
      return {
        state: installed.version === HEX_ENGINE_VERSION ? "unsupported" : "installed",
        source: "managed",
        version: installed.version,
        availableVersion: HEX_ENGINE_VERSION,
        downloadBytes: asset?.downloadBytes ?? null,
        error: this.lastError ?? compatibility.error,
      };
    }
    if (compatibility.error) {
      return {
        state: "unsupported",
        source: null,
        version: null,
        availableVersion: HEX_ENGINE_VERSION,
        downloadBytes: asset?.downloadBytes ?? null,
        error: compatibility.error,
      };
    }
    if (installed && this.managedExecutable) {
      return {
        state: "installed",
        source: "managed",
        version: installed.version,
        availableVersion: HEX_ENGINE_VERSION,
        downloadBytes: asset!.downloadBytes,
        ...(this.lastError ? { error: this.lastError } : {}),
      };
    }
    if (installed) {
      return {
        state: "error",
        source: "managed",
        version: installed.version,
        availableVersion: HEX_ENGINE_VERSION,
        downloadBytes: asset!.downloadBytes,
        error: "integrity",
      };
    }
    if (this.lastError) {
      return {
        state: "error",
        source: null,
        version: null,
        availableVersion: HEX_ENGINE_VERSION,
        downloadBytes: asset!.downloadBytes,
        error: this.lastError,
      };
    }
    return {
      state: "missing",
      source: null,
      version: null,
      availableVersion: HEX_ENGINE_VERSION,
      downloadBytes: asset!.downloadBytes,
    };
  }

  startInstall(): void {
    if (this.isInstalling) throw new InstallerError("busy");
    if (existsSync(join(this.managedDirectory, "active.json")) && !this.readActiveInstall()) {
      throw new InstallerError("incompatible");
    }
    const compatibility = this.compatibility();
    if (compatibility.error) throw new InstallerError(compatibility.error);
    const controller = new AbortController();
    this.installController = controller;
    this.installProgress = 0;
    this.lastError = undefined;
    let operation!: Promise<void>;
    operation = this.install(controller, compatibility.asset!)
      .catch((error: unknown) => {
        const code = this.errorCode(error, controller.signal);
        if (code !== "cancelled") this.lastError = code;
      })
      .finally(() => {
        if (this.installController === controller) this.installController = undefined;
        if (this.installOperation === operation) this.installOperation = undefined;
        this.installProgress = undefined;
      });
    this.installOperation = operation;
  }

  async cancelInstall(): Promise<void> {
    this.installController?.abort();
    await this.installOperation;
  }

  async removeManagedEngine(): Promise<void> {
    if (this.isInstalling) throw new InstallerError("busy");
    await rm(this.managedDirectory, { recursive: true, force: true });
    this.lastError = undefined;
  }

  private compatibility(): { asset: HexEngineAsset | undefined; error?: HexVoiceErrorCode } {
    const asset = this.assets.find(
      (candidate) => candidate.platform === this.platform && candidate.arch === this.arch,
    );
    if (!asset) return { asset: undefined, error: "unsupported" };
    if (this.platform === "linux") {
      if (!this.glibcVersion) return { asset, error: "unsupported" };
      if (compareVersion(this.glibcVersion, "2.39") < 0) {
        return { asset, error: "incompatible" };
      }
    }
    return { asset };
  }

  private async install(controller: AbortController, asset: HexEngineAsset): Promise<void> {
    const stageDirectory = join(this.managedDirectory, `.staging-${this.uuid()}`);
    let promotedDirectory: string | undefined;
    let pointerPromoted = false;
    try {
      controller.signal.throwIfAborted();
      await mkdir(this.managedDirectory, { recursive: true, mode: 0o700 });
      if (this.platform !== "win32") await chmod(this.managedDirectory, 0o700);
      await mkdir(stageDirectory, { recursive: false, mode: 0o700 });
      const archivePath = join(stageDirectory, asset.filename);
      await this.download(asset, archivePath, controller.signal);
      controller.signal.throwIfAborted();
      const executable = await this.extractAndVerify(
        asset,
        stageDirectory,
        archivePath,
        controller.signal,
      );
      await writeFile(join(stageDirectory, "LICENSE"), MIT_NOTICE, { mode: 0o600, flag: "wx" });
      await this.probeWithTimeout(executable, controller.signal);
      controller.signal.throwIfAborted();

      const releasesDirectory = join(this.managedDirectory, "releases");
      await mkdir(releasesDirectory, { recursive: true, mode: 0o700 });
      const release = `${HEX_ENGINE_VERSION}-${this.uuid()}`;
      promotedDirectory = join(releasesDirectory, release);
      await rename(stageDirectory, promotedDirectory);
      await this.writeActiveInstall({
        schemaVersion: 1,
        release,
        version: HEX_ENGINE_VERSION,
        platform: this.platform,
        arch: this.arch,
      });
      pointerPromoted = true;
      this.installProgress = 100;
      this.lastError = undefined;
    } catch (error) {
      if (promotedDirectory && !pointerPromoted) {
        await rm(promotedDirectory, { recursive: true, force: true }).catch(() => {});
      }
      throw error;
    } finally {
      await rm(stageDirectory, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async download(
    asset: HexEngineAsset,
    destination: string,
    signal: AbortSignal,
  ): Promise<void> {
    const controller = AbortSignal.any([signal, AbortSignal.timeout(INSTALL_TIMEOUT_MS)]);
    const response = await this.requestAsset(
      new URL(`${RELEASE_PREFIX}${asset.filename}`),
      controller,
    );
    if (!response.ok || !response.body) throw new InstallerError("download_failed");
    const declaredSize = response.headers.get("content-length");
    if (declaredSize !== null && Number(declaredSize) !== asset.downloadBytes) {
      await response.body.cancel().catch(() => {});
      throw new InstallerError("integrity");
    }
    let file: Awaited<ReturnType<typeof open>> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const hash = createHash("sha256");
    let bytes = 0;
    try {
      file = await open(destination, "wx", 0o600);
      reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        controller.throwIfAborted();
        bytes += value.byteLength;
        if (bytes > asset.downloadBytes) throw new InstallerError("integrity");
        hash.update(value);
        let offset = 0;
        while (offset < value.byteLength) {
          const { bytesWritten } = await file.write(value, offset, value.byteLength - offset);
          offset += bytesWritten;
        }
        this.installProgress = Math.min(99, Math.floor((bytes / asset.downloadBytes) * 100));
      }
      if (bytes !== asset.downloadBytes || hash.digest("hex") !== asset.sha256) {
        throw new InstallerError("integrity");
      }
    } catch (error) {
      if (reader) await reader.cancel(error).catch(() => {});
      else await response.body.cancel().catch(() => {});
      if (controller.aborted && !signal.aborted) throw new InstallerError("download_failed");
      throw error;
    } finally {
      reader?.releaseLock();
      await file?.close();
    }
  }

  private async requestAsset(initialUrl: URL, controller: AbortSignal): Promise<Response> {
    let url = initialUrl;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      this.assertAllowedUrl(url);
      let response: Response;
      try {
        response = await this.fetcher(url, { redirect: "manual", signal: controller });
      } catch (error) {
        if (controller.aborted) throw error;
        throw new InstallerError("download_failed");
      }
      if (response.status < 300 || response.status >= 400) return response;
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => {});
      if (!location || redirects === MAX_REDIRECTS) throw new InstallerError("download_failed");
      url = new URL(location, url);
    }
    throw new InstallerError("download_failed");
  }

  private assertAllowedUrl(url: URL): void {
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port !== "" && url.port !== "443") ||
      !REDIRECT_HOSTS.has(url.hostname.toLowerCase())
    ) {
      throw new InstallerError("integrity");
    }
  }

  private async extractAndVerify(
    asset: HexEngineAsset,
    stageDirectory: string,
    archivePath: string,
    signal: AbortSignal,
  ): Promise<string> {
    let executable: string;
    if (asset.archive && this.platform === "darwin") {
      await verifyZipHeader(archivePath);
      await this.runCommand("ditto", ["-x", "-k", archivePath, stageDirectory], {
        signal,
        timeoutMs: SIGNATURE_TIMEOUT_MS,
      });
      executable = join(stageDirectory, executableRelativePath(this.platform));
      try {
        await access(executable, constants.X_OK);
      } catch {
        throw new InstallerError("integrity");
      }
      await this.runCommand(
        "codesign",
        ["--verify", "--deep", "--strict", join(stageDirectory, "Hex.app")],
        {
          signal,
          timeoutMs: SIGNATURE_TIMEOUT_MS,
        },
      ).catch(() => {
        throw new InstallerError("integrity");
      });
      await this.runCommand(
        "spctl",
        ["--assess", "--type", "execute", join(stageDirectory, "Hex.app")],
        {
          signal,
          timeoutMs: SIGNATURE_TIMEOUT_MS,
        },
      ).catch(() => {
        throw new InstallerError("permission_denied");
      });
      await this.runCommand("/usr/bin/lipo", ["-verify_arch", "arm64", executable], {
        signal,
        timeoutMs: SIGNATURE_TIMEOUT_MS,
      }).catch(() => {
        throw new InstallerError("integrity");
      });
      await rm(archivePath, { force: true });
    } else {
      if (asset.archive) throw new InstallerError("unsupported");
      executable = join(stageDirectory, this.platform === "win32" ? "hex.exe" : "hex");
      await rename(archivePath, executable);
      if (this.platform === "win32") {
        await verifyWindowsPe(executable, this.arch);
        await this.verifyAuthenticode(executable, signal);
      } else {
        await verifyLinuxElf(executable, this.arch);
        try {
          await chmod(executable, 0o700);
          await access(executable, constants.X_OK);
        } catch {
          throw new InstallerError("permission_denied");
        }
      }
    }
    return executable;
  }

  private async verifyAuthenticode(executable: string, signal: AbortSignal): Promise<void> {
    await this.runCommand(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$s = Get-AuthenticodeSignature -LiteralPath $env:PORACODE_HEX_VERIFY_PATH; if ($s.Status -ne 'Valid') { exit 1 }",
      ],
      {
        signal,
        timeoutMs: SIGNATURE_TIMEOUT_MS,
        env: { PORACODE_HEX_VERIFY_PATH: executable },
      },
    ).catch(() => {
      throw new InstallerError("integrity");
    });
  }

  private async probeWithTimeout(executable: string, signal: AbortSignal): Promise<void> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    signal.throwIfAborted();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    let timedOut = false;
    const probe = Promise.resolve().then(() => this.probe(executable, controller.signal));
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        const error = new Error("engine probe timed out");
        error.name = "TimeoutError";
        reject(error);
      }, PROBE_TIMEOUT_MS);
    });
    try {
      await Promise.race([probe, timeout]);
    } catch {
      controller.abort();
      await probe.catch(() => {});
      if (signal.aborted) throw new InstallerError("cancelled");
      if (timedOut) throw new InstallerError("timeout");
      throw new InstallerError("incompatible");
    } finally {
      if (timer) clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }

  private async writeActiveInstall(install: ActiveInstall): Promise<void> {
    const pointerPath = join(this.managedDirectory, "active.json");
    const temporaryPath = join(this.managedDirectory, `.active-${this.uuid()}.tmp`);
    const bytes = JSON.stringify(install);
    const file = await open(temporaryPath, "wx", 0o600);
    try {
      await file.writeFile(bytes);
    } finally {
      await file.close();
    }
    try {
      await rename(temporaryPath, pointerPath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => {});
      throw error;
    }
  }

  private readActiveInstall(): ActiveInstall | undefined {
    const pointerPath = join(this.managedDirectory, "active.json");
    try {
      if (!existsSync(pointerPath)) return undefined;
      const parsed = JSON.parse(readFileSync(pointerPath, "utf8")) as ActiveInstall;
      const releasesDirectory = join(this.managedDirectory, "releases");
      const resolvedDirectory = resolve(releasesDirectory, parsed.release);
      const relativePath = relative(releasesDirectory, resolvedDirectory);
      const versionValid =
        typeof parsed.version === "string" && /^\d+\.\d+\.\d+$/.test(parsed.version);
      if (
        parsed.schemaVersion !== 1 ||
        !versionValid ||
        compareVersion(parsed.version, HEX_ENGINE_VERSION) > 0 ||
        !new RegExp(`^${parsed.version.replaceAll(".", "\\.")}-[0-9a-f-]{36}$`).test(
          parsed.release,
        ) ||
        relativePath.startsWith(`..${sep}`) ||
        isAbsolute(relativePath) ||
        typeof parsed.platform !== "string" ||
        typeof parsed.arch !== "string"
      ) {
        return undefined;
      }
      return parsed;
    } catch {
      return undefined;
    }
  }

  private errorCode(error: unknown, signal: AbortSignal): HexVoiceErrorCode {
    if (signal.aborted) return "cancelled";
    if (error instanceof InstallerError) return error.code;
    if (isPermissionError(error)) return "permission_denied";
    return "download_failed";
  }
}

export function externalHexExecutable(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  pathValue: string = env.PATH ?? "",
): { executable?: string; source?: "external" } {
  const configured = env.PORACODE_HEX_EXECUTABLE?.trim();
  if (configured && isAbsolute(configured)) {
    try {
      accessSync(configured, platform === "win32" ? constants.F_OK : constants.X_OK);
      return { executable: configured, source: "external" };
    } catch {
      // Ignore invalid explicit overrides and continue with host discovery.
    }
  }
  const names = platform === "win32" ? ["hex.exe"] : ["hex"];
  for (const directory of pathValue.split(platform === "win32" ? ";" : ":")) {
    if (!directory) continue;
    for (const name of names) {
      const candidate = join(directory, name);
      try {
        accessSync(candidate, platform === "win32" ? constants.F_OK : constants.X_OK);
        return { executable: candidate, source: "external" };
      } catch {
        // Continue searching PATH without invoking a shell.
      }
    }
  }
  return {};
}

export function hostIdentity(): { hostname: string; platform: string; arch: string } {
  return { hostname: hostname(), platform: process.platform, arch: process.arch };
}
