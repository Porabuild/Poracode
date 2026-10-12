import { z } from "zod";

/** Captured first-party code only; external dependencies keep normal resolution. */
export const RUNTIME_CAPTURE_PROTOCOL_VERSION = 1 as const;
export const RUNTIME_MANIFEST_MAX_BYTES = 256 * 1024;
export const RUNTIME_CODE_MAX_FILES = 128;
export const RUNTIME_CODE_MAX_FILE_BYTES = 8 * 1024 * 1024;
export const RUNTIME_CODE_MAX_TOTAL_BYTES = 16 * 1024 * 1024;

export const runtimeDigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);

export const runtimeCodeFileSchema = z.strictObject({
  path: z
    .string()
    .min(1)
    .max(1024)
    .refine(
      (path) =>
        // eslint-disable-next-line no-control-regex -- reject non-portable path/control aliases
        !/[\\%?#:*<>"|\u0000-\u0020]/u.test(path) &&
        !path.startsWith("/") &&
        !/^[A-Za-z]:/u.test(path) &&
        path
          .split("/")
          .every(
            (part) =>
              part !== "" && part !== "." && part !== ".." && part.toLowerCase() !== "node_modules",
          ) &&
        /\.(?:cjs|mjs|js)$/u.test(path),
      "Runtime code path must be a canonical relative JavaScript filename.",
    ),
  format: z.enum(["commonjs", "module"]),
  bytes: z.number().int().min(0).max(RUNTIME_CODE_MAX_FILE_BYTES),
  sha256: runtimeDigestSchema,
});

export const runtimeCodeFilesSchema = z
  .array(runtimeCodeFileSchema)
  .min(1)
  .max(RUNTIME_CODE_MAX_FILES)
  .superRefine((files, context) => {
    // One declaration must also be unambiguous on case-insensitive filesystems.
    if (new Set(files.map((file) => file.path.toLowerCase())).size !== files.length)
      context.addIssue({ code: "custom", message: "Duplicate runtime code path." });
    if (files.reduce((total, file) => total + file.bytes, 0) > RUNTIME_CODE_MAX_TOTAL_BYTES)
      context.addIssue({ code: "custom", message: "Runtime code exceeds the capture byte limit." });
    for (const file of files)
      if (
        (file.path.endsWith(".cjs") && file.format !== "commonjs") ||
        (file.path.endsWith(".mjs") && file.format !== "module")
      )
        context.addIssue({ code: "custom", message: "Runtime filename and module format differ." });
  });

export type RuntimeCodeFile = z.infer<typeof runtimeCodeFileSchema>;
