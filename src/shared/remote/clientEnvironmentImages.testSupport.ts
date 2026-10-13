import {
  RemoteEnvironmentImageCache,
  type RemoteEnvironmentImageBytes,
  type RemoteEnvironmentImageCacheOptions,
} from "./clientEnvironmentImages";

interface ImageFetchCall {
  readonly requestPath: string;
  readonly signal: AbortSignal;
  resolve: (bytes: Uint8Array, contentType?: string) => void;
  reject: (error: unknown) => void;
}

/** Fetches deliberately remain settleable after abort to exercise owner fencing. */
export function createImageCacheHarness(options: Partial<RemoteEnvironmentImageCacheOptions> = {}) {
  const fetches: ImageFetchCall[] = [];
  const created: string[] = [];
  const revoked: string[] = [];
  const cache = new RemoteEnvironmentImageCache({
    fetchBytes: (requestPath, signal) =>
      new Promise<RemoteEnvironmentImageBytes>((resolve, reject) => {
        fetches.push({
          requestPath,
          signal,
          resolve: (bytes, contentType = "image/png") => resolve({ bytes, contentType }),
          reject,
        });
      }),
    createObjectUrl: () => {
      const url = `blob:${created.length + 1}`;
      created.push(url);
      return url;
    },
    revokeObjectUrl: (url) => {
      revoked.push(url);
    },
    ...options,
  });
  return { cache, fetches, created, revoked };
}
