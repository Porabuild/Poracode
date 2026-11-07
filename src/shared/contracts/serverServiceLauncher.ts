import { z } from "zod";

// Independently deployed launcher. New behavior increments the helper version;
// ABI changes increment protocolVersion. Unknown staged artifacts refuse.
export const SERVICE_LAUNCHER_VERSION = "1.0.0";
export const SERVICE_LAUNCHER_PROTOCOL_VERSION = 1;
export const SERVICE_LAUNCHER_MANIFEST_VERSION = 1;
export const SERVICE_LAUNCHER_MAX_BYTES = 8 * 1024 * 1024;
export const SERVICE_LAUNCHER_FILENAME = "service-launcher-v1.exe";
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const targetEntry = (relativePath: string) =>
  z.strictObject({
    relativePath: z.literal(relativePath),
    bytes: z.int().positive().max(SERVICE_LAUNCHER_MAX_BYTES),
    sha256: hash,
  });
export const serviceLauncherManifestSchema = z.strictObject({
  formatVersion: z.literal(SERVICE_LAUNCHER_MANIFEST_VERSION),
  protocolVersion: z.literal(SERVICE_LAUNCHER_PROTOCOL_VERSION),
  helperVersion: z.literal(SERVICE_LAUNCHER_VERSION),
  sourceSha256: hash,
  targets: z
    .strictObject({
      "win32-x64": targetEntry(`win32-x64/${SERVICE_LAUNCHER_FILENAME}`).optional(),
      "win32-arm64": targetEntry(`win32-arm64/${SERVICE_LAUNCHER_FILENAME}`).optional(),
    })
    .refine((targets) => Object.values(targets).some(Boolean), "A staged target is required."),
});
export type ServiceLauncherManifest = z.infer<typeof serviceLauncherManifestSchema>;
export type ServiceLauncherTarget = keyof ServiceLauncherManifest["targets"];
