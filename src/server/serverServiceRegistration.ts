import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { z } from "zod";
import {
  SERVICE_LAUNCHER_FILENAME,
  SERVICE_LAUNCHER_MAX_BYTES,
  SERVICE_LAUNCHER_PROTOCOL_VERSION,
} from "@/shared/contracts/serverServiceLauncher";
import { writeFileAtomic } from "@/shared/atomicFile";
import { canonicalHostPath } from "@/backend/ownership/hostRootPaths";
import { readReleaseBuildIdentity } from "./serverUpgradeIdentity";
import {
  readCurrentTarget,
  previousReleasePath,
  isDirectReleaseDirectory,
} from "./serverUpgradeReleases";

// New optional prefix metadata. Absent preserves the legacy upgrade path;
// unknown formats refuse without rewriting the registration or native service.
export const SERVER_SERVICE_REGISTRATION_VERSION = 1;
// launchd uses the existing version-1 manager/account/definition fields unchanged;
// older CLIs refuse darwin before native effects. No new helper is persisted.
// Version 1 stays closed and unchanged. Version 2 pins the independent Windows
// launcher; an older CLI refuses it before service or upgrade effects.
export const SERVER_SERVICE_LAUNCHER_REGISTRATION_VERSION = 2;
export const SERVER_SERVICE_REGISTRATION_FILE = "service-registration.json";
const absolutePath = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      return canonicalHostPath(value) === value;
    } catch {
      return false;
    }
  });
const absoluteFilePath = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      return (
        isAbsolute(value) &&
        join(canonicalHostPath(dirname(value)), basename(value)) === value &&
        (!existsSync(value) || (lstatSync(value).isFile() && realpathSync.native(value) === value))
      );
    } catch {
      return false;
    }
  });
export const serverServiceRegistrationV1Schema = z
  .object({
    formatVersion: z.literal(SERVER_SERVICE_REGISTRATION_VERSION),
    state: z.enum(["prepared", "installed", "removing"]),
    registrationId: z.string().regex(/^poracode-[a-f0-9]{32}$/u),
    registrationNonce: z.string().regex(/^[a-f0-9]{48}$/u),
    manager: z.enum(["systemd-user", "launchd-agent", "windows-task"]),
    account: z.object({ kind: z.enum(["uid", "sid"]), id: z.string().min(1) }).strict(),
    profileNamespace: absolutePath,
    installPrefix: absolutePath,
    nodeExecutable: absoluteFilePath,
    entrypointRelative: z.literal("current/lib/server.cjs"),
    configPath: absoluteFilePath.nullable(),
    definition: z
      .object({ locator: absoluteFilePath, sha256: z.string().regex(/^[a-f0-9]{64}$/u) })
      .strict(),
    launcher: z.null(),
  })
  .strict();
export const windowsServiceRegistrationSchema = serverServiceRegistrationV1Schema.extend({
  formatVersion: z.literal(SERVER_SERVICE_LAUNCHER_REGISTRATION_VERSION),
  manager: z.literal("windows-task"),
  account: z.strictObject({ kind: z.literal("sid"), id: z.string().regex(/^S-1-(?:\d+-)+\d+$/u) }),
  launcher: z.strictObject({
    protocolVersion: z.literal(SERVICE_LAUNCHER_PROTOCOL_VERSION),
    relativePath: z.literal(SERVICE_LAUNCHER_FILENAME),
    bytes: z.int().positive().max(SERVICE_LAUNCHER_MAX_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  }),
});
export const serverServiceRegistrationSchema = z.discriminatedUnion("formatVersion", [
  serverServiceRegistrationV1Schema,
  windowsServiceRegistrationSchema,
]);
export type ServerServiceRegistration = z.infer<typeof serverServiceRegistrationSchema>;
export type WindowsServiceRegistration = z.infer<typeof windowsServiceRegistrationSchema>;

export class ServerServiceRefusedError extends Error {
  readonly code = "SERVER_SERVICE_REFUSED";
  constructor(message: string) {
    super(message);
    this.name = "ServerServiceRefusedError";
  }
}

export function serviceRegistrationId(
  profile: string,
  account: ServerServiceRegistration["account"],
): string {
  return `poracode-${createHash("sha256")
    .update(JSON.stringify([profile, account]))
    .digest("hex")
    .slice(0, 32)}`;
}

export function readServiceRegistration(prefix: string): ServerServiceRegistration | null {
  const path = join(prefix, SERVER_SERVICE_REGISTRATION_FILE);
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > 16_384) throw new Error("not a bounded regular file");
    return serverServiceRegistrationSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return null;
    throw new ServerServiceRefusedError(
      `Unusable service registration at ${path}; preserve it and use a compatible CLI to inspect/recover it.`,
    );
  }
}

export function writeServiceRegistration(registration: ServerServiceRegistration): void {
  const parsed = serverServiceRegistrationSchema.parse(registration);
  writeFileAtomic(
    join(parsed.installPrefix, SERVER_SERVICE_REGISTRATION_FILE),
    `${JSON.stringify(parsed, null, 2)}\n`,
    { mode: 0o600 },
  );
  for (const path of [
    join(parsed.installPrefix, SERVER_SERVICE_REGISTRATION_FILE),
    ...(process.platform === "win32" ? [] : [parsed.installPrefix]),
  ]) {
    const descriptor = openSync(path, path === parsed.installPrefix ? "r" : "r+");
    try {
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  }
}

export function readInstalledServiceRelease(prefixInput: string) {
  const prefix = realpathSync.native(prefixInput);
  const target = readCurrentTarget(prefix);
  if (target === null || !lstatSync(join(prefix, "current")).isSymbolicLink())
    throw new ServerServiceRefusedError(
      "Select an installed prefix with a current release symlink; a checkout or npm runtime cache is not a service prefix.",
    );
  const releaseDir = realpathSync.native(previousReleasePath(prefix, target));
  if (
    !isDirectReleaseDirectory(prefix, releaseDir) ||
    dirname(releaseDir) !== join(prefix, "releases")
  )
    throw new ServerServiceRefusedError(
      "The selected current target must be a direct installed releases/<releaseId> directory.",
    );
  const build = readReleaseBuildIdentity(releaseDir);
  if (build.layoutKind !== "prefix" || build.version === null || build.entrypointSha256 === null)
    throw new ServerServiceRefusedError(
      "The selected current release has no complete installed build identity.",
    );
  return { prefix, target, releaseId: basename(releaseDir), releaseDir, build };
}

export function assertServiceRegistrationScope(
  registration: ServerServiceRegistration,
  input: {
    prefix: string;
    profileNamespace: string;
    account: ServerServiceRegistration["account"];
  },
): void {
  if (
    registration.installPrefix !== input.prefix ||
    registration.profileNamespace !== input.profileNamespace ||
    registration.account.kind !== input.account.kind ||
    registration.account.id !== input.account.id ||
    registration.registrationId !== serviceRegistrationId(input.profileNamespace, input.account)
  )
    throw new ServerServiceRefusedError(
      "This prefix already belongs to another service profile/account. One managed registration is allowed per explicit installed prefix; use a separate prefix for another profile.",
    );
}
