export const RUNTIME_PAYLOAD_PROJECTION_MODULE: string;
export const RUNTIME_PAYLOAD_PROJECTION_FILE: string;
export function runtimePayloadProjectionDirectory(root: string): string;
export function createRuntimePayloadProjectionSource(
  root: string,
  options?: { fileUrlImports?: boolean },
): { directory: string; files: string[]; source: string };
export function resolveRuntimePayloadProjectionModule(
  specifier: string,
): { url: string; shortCircuit: true } | undefined;
export function loadRuntimePayloadProjectionModule(
  url: string,
  root: string,
): { format: "module"; shortCircuit: true; source: string } | undefined;
