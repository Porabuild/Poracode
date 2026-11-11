export const RUNTIME_ARTIFACT_MAX_BYTES: number;
export function downloadArtifact(
  entry: { readonly url: string; readonly sha256: string },
  destination: string,
  options?: {
    readonly allowHttp?: boolean;
    readonly maxBytes?: number;
    readonly fetchImpl?: (url: string) => Promise<Response>;
  },
): Promise<{ readonly sha256: string; readonly bytes: number; readonly source: string }>;
