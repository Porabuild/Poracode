import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveOptionalServerInstallLayout,
  type ServerInstallLayout,
} from "./serverInstallLayout";

/**
 * Truthful `--version` source (plan D1/D3): the immutable artifact metadata
 * (`<layout.root>/package.json`, written by the tarball assembly), never a
 * literal `dev` or a service-file constant. `PORACODE_APP_VERSION` remains an
 * explicit override for layouts whose metadata cannot be read.
 */
export type ServerVersionSource = "artifact" | "environment" | "unknown";

export interface ServerVersionInfo {
  readonly version: string;
  readonly source: ServerVersionSource;
}

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;

export function readServerArtifactVersion(
  layout: ServerInstallLayout | undefined,
): string | undefined {
  if (layout === undefined) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(join(layout.root, "package.json"), "utf8")) as {
      version?: unknown;
    };
    return typeof parsed.version === "string" && VERSION_PATTERN.test(parsed.version)
      ? parsed.version
      : undefined;
  } catch {
    return undefined;
  }
}

export function resolveServerVersion(
  input: { readonly layout?: ServerInstallLayout; readonly env?: NodeJS.ProcessEnv } = {},
): ServerVersionInfo {
  const layout = input.layout ?? resolveOptionalServerInstallLayout();
  const artifact = readServerArtifactVersion(layout);
  if (artifact !== undefined) return { version: artifact, source: "artifact" };
  const declared = (input.env ?? process.env).PORACODE_APP_VERSION?.trim();
  if (declared !== undefined && declared.length > 0 && declared !== "dev") {
    return { version: declared, source: "environment" };
  }
  return { version: "unknown", source: "unknown" };
}
