import { randomUUID } from "node:crypto";
import {
  accessSync,
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { writeFileAtomic } from "@/shared/atomicFile";
import type { PoracodeChannel } from "@/shared/channel";
import { readSelectedDesktopBundle } from "../../packages/poracode-cli/lib/desktopBundle.mjs";

// OS-local shell bookkeeping, independent of host roots and service prefixes.
// Unknown versions preserve their bytes and refuse all binding effects.
export const DESKTOP_CLI_REGISTRATION_VERSION = 1;
const absolutePath = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => isAbsolute(value) && resolve(value) === value);
const registrationSchema = z.strictObject({
  formatVersion: z.literal(DESKTOP_CLI_REGISTRATION_VERSION),
  installationId: z.uuid(),
  state: z.enum(["prepared", "installed"]),
  channel: z.enum(["stable", "nightly"]),
  commandName: z.enum(["poracode", "poracode-next"]),
  account: z.strictObject({ kind: z.literal("uid"), id: z.int().nonnegative() }),
  appExecutable: absolutePath,
  launcherPath: absolutePath,
  launcherSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  linkPath: absolutePath,
});

export interface DesktopCliRegistrationResult {
  readonly state: "registered" | "collision" | "unavailable";
  readonly commandName: string;
  readonly launcherPath: string;
  readonly detail: string;
}

export function shouldRegisterMacDesktopCli(input: {
  readonly platform: NodeJS.Platform;
  readonly isPackaged: boolean;
  readonly isDev: boolean;
  readonly baseDirOverride: string | undefined;
  readonly legacyBaseDirOverride: string | undefined;
  readonly env: NodeJS.ProcessEnv;
}): boolean {
  return (
    input.platform === "darwin" &&
    input.isPackaged &&
    !input.isDev &&
    !input.baseDirOverride &&
    !input.legacyBaseDirOverride &&
    !input.env.CI &&
    !input.env.PORACODE_CDP_PORT &&
    input.env.PORACODE_STARTUP_FAILURE_MODE?.trim().toLowerCase() !== "quiet"
  );
}

function fileInfo(path: string) {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Publish only the exact selected bundle's command into an existing macOS PATH. */
export function registerMacDesktopCli(input: {
  readonly resourcesDir: string;
  readonly executablePath: string;
  readonly appVersion: string;
  readonly electronVersion: string;
  readonly channel: PoracodeChannel;
  readonly appDataDir: string;
  readonly path: string;
  readonly platform?: NodeJS.Platform;
}): DesktopCliRegistrationResult {
  if ((input.platform ?? process.platform) !== "darwin" || !process.getuid)
    throw new Error("Automatic desktop CLI registration currently requires macOS.");
  const bundle = readSelectedDesktopBundle({
    resourcesDir: input.resourcesDir,
    execPath: input.executablePath,
    electronVersion: input.electronVersion,
  });
  if (bundle.channel !== input.channel || bundle.appVersion !== input.appVersion)
    throw new Error("Desktop CLI registration refused a different channel or app version.");
  const account = { kind: "uid" as const, id: process.getuid() };
  const appExecutable = realpathSync.native(input.executablePath);
  const launcherPath = join(bundle.resourcesDir, "desktop-cli", bundle.commandName);
  const launcher = bundle.files.find((file) => file.path === `desktop-cli/${bundle.commandName}`);
  if (!launcher) throw new Error("The selected desktop bundle has no validated command launcher.");
  const unavailable = (
    state: "collision" | "unavailable",
    detail: string,
  ): DesktopCliRegistrationResult => ({
    state,
    commandName: bundle.commandName,
    launcherPath,
    detail: `${detail} The bundled command is ${launcherPath}. No shell profile or existing command was changed.`,
  });
  // Canonicalize existing directories, but never expand shell syntax or use
  // relative/empty entries: they can turn an arbitrary cwd into command custody.
  const directories = [
    ...new Set(
      input.path
        .split(":")
        .filter(isAbsolute)
        .flatMap((directory) => {
          try {
            return [realpathSync.native(directory)];
          } catch (error) {
            if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? ""))
              return [];
            throw error;
          }
        }),
    ),
  ];
  const stateDir = join(
    realpathSync.native(input.appDataDir),
    `poracode-desktop-cli-${input.channel}`,
  );
  try {
    mkdirSync(stateDir, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const directoryInfo = lstatSync(stateDir);
  if (
    !directoryInfo.isDirectory() ||
    directoryInfo.isSymbolicLink() ||
    directoryInfo.uid !== account.id ||
    (directoryInfo.mode & 0o077) !== 0
  )
    throw new Error("Desktop CLI registration directory is not private and owned by this account.");
  const recordPath = join(stateDir, "registration.json");
  const lockPath = join(stateDir, "registration.lock");
  const claim = `${randomUUID()}\n`;
  // Synchronous, scoped claim: no process-liveness guesses, stale-lock stealing,
  // host lease or managed-prefix upgrade lock. A crash requires explicit review.
  const descriptor = openSync(lockPath, "wx", 0o600);
  let claimInfo: ReturnType<typeof fstatSync> | undefined;
  const ownsClaim = () => {
    if (!claimInfo) return false;
    const info = fileInfo(lockPath);
    return (
      info?.isFile() &&
      info.ino === claimInfo.ino &&
      info.dev === claimInfo.dev &&
      info.size === Buffer.byteLength(claim) &&
      readFileSync(lockPath, "utf8") === claim
    );
  };
  try {
    claimInfo = fstatSync(descriptor);
    writeFileSync(descriptor, claim);
    const assertClaim = () => {
      if (!ownsClaim())
        throw new Error("Desktop CLI registration claim changed; preserve its custody evidence.");
    };
    const recordInfo = fileInfo(recordPath);
    if (
      recordInfo &&
      (!recordInfo.isFile() || recordInfo.size > 16_384 || recordInfo.uid !== account.id)
    )
      throw new Error("Desktop CLI registration metadata is not a bounded owned regular file.");
    let previousBytes = recordInfo ? readFileSync(recordPath, "utf8") : undefined;
    const previous =
      previousBytes === undefined ? undefined : registrationSchema.parse(JSON.parse(previousBytes));
    if (
      previous &&
      (previous.channel !== input.channel ||
        previous.commandName !== bundle.commandName ||
        previous.account.id !== account.id ||
        previous.appExecutable !== appExecutable ||
        previous.launcherPath !== launcherPath)
    )
      throw new Error(
        "This command registration belongs to a different desktop installation or account; it was not adopted.",
      );
    const isOwnedLink = (path: string) => {
      const info = fileInfo(path);
      return (
        !!previous &&
        path === previous.linkPath &&
        info?.isSymbolicLink() &&
        info.uid === account.id &&
        readlinkSync(path) === previous.launcherPath
      );
    };
    for (const directory of directories) {
      const command = join(directory, bundle.commandName);
      if (fileInfo(command) && !isOwnedLink(command))
        return unavailable("collision", `An existing command or link at ${command} was preserved.`);
    }
    if (
      previous &&
      !directories.some((directory) => join(directory, bundle.commandName) === previous.linkPath)
    )
      return unavailable("unavailable", "The recorded command directory is no longer on PATH.");
    const writable = directories.find((directory) => {
      if (previous && join(directory, bundle.commandName) !== previous.linkPath) return false;
      const info = lstatSync(directory);
      if (
        !info.isDirectory() ||
        (info.mode & 0o002) !== 0 ||
        (info.uid !== account.id && info.uid !== 0)
      )
        return false;
      try {
        accessSync(directory, constants.W_OK | constants.X_OK);
        return true;
      } catch (error) {
        if (["EACCES", "EPERM", "EROFS"].includes((error as NodeJS.ErrnoException).code ?? ""))
          return false;
        throw error;
      }
    });
    if (!writable)
      return unavailable(
        "unavailable",
        "No suitable existing writable PATH directory is available.",
      );
    const linkPath = join(writable, bundle.commandName);
    const existingLink = fileInfo(linkPath);
    if (existingLink && !isOwnedLink(linkPath))
      return unavailable(
        "collision",
        `A command appeared at ${linkPath} during registration and was preserved.`,
      );
    const record = registrationSchema.parse({
      formatVersion: DESKTOP_CLI_REGISTRATION_VERSION,
      installationId: previous?.installationId ?? randomUUID(),
      state: "prepared",
      channel: input.channel,
      commandName: bundle.commandName,
      account,
      appExecutable,
      launcherPath,
      launcherSha256: launcher.sha256,
      linkPath,
    });
    if (
      previous?.state === "installed" &&
      previous.launcherSha256 === launcher.sha256 &&
      existingLink
    ) {
      assertClaim();
      return {
        state: "registered",
        commandName: bundle.commandName,
        launcherPath,
        detail: `Desktop command ${bundle.commandName} remains registered at ${linkPath}.`,
      };
    }
    const saveRecord = (state: "prepared" | "installed") => {
      assertClaim();
      const currentInfo = fileInfo(recordPath);
      if (
        (currentInfo && !currentInfo.isFile()) ||
        (currentInfo ? readFileSync(recordPath, "utf8") : undefined) !== previousBytes
      )
        throw new Error("Desktop CLI registration metadata changed; no replacement was published.");
      const bytes = `${JSON.stringify({ ...record, state }, null, 2)}\n`;
      writeFileAtomic(recordPath, bytes, { mode: 0o600 });
      for (const path of [recordPath, stateDir]) {
        const fd = openSync(path, "r");
        try {
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
      }
      previousBytes = bytes;
    };
    // Persist the exact intended binding before publishing it. Interrupted
    // prepared records are retried only for this same account/app/link target.
    saveRecord("prepared");
    assertClaim();
    if (!existingLink) symlinkSync(launcherPath, linkPath, "file");
    const link = lstatSync(linkPath);
    if (
      !link.isSymbolicLink() ||
      link.uid !== account.id ||
      readlinkSync(linkPath) !== launcherPath ||
      (existingLink && (link.ino !== existingLink.ino || link.dev !== existingLink.dev))
    )
      throw new Error("The command binding changed; its prepared registration was retained.");
    saveRecord("installed");
    return {
      state: "registered",
      commandName: bundle.commandName,
      launcherPath,
      detail: `Desktop command ${bundle.commandName} is registered at ${linkPath}. Open a new terminal if command lookup was cached.`,
    };
  } finally {
    closeSync(descriptor);
    if (ownsClaim()) unlinkSync(lockPath);
  }
}
