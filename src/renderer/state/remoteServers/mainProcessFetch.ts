import { msg as sharedMsg } from "@/shared/messages";
import { RemoteClientError, type RemoteFetch } from "@/shared/remote/client";
import { hasAnyClientBridge, readClientRuntime } from "@/renderer/clientRuntime";
import { remoteHttpBridgeFetch } from "./remoteHttpBridgeClient";

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Remote requests run off Electron main in the narrow utility-process HTTP
 * bridge (facade 11), so no response body crosses the main process. Browser
 * hosts keep native `fetch` semantics. A failed bridge request rejects as the
 * shared status-zero transport error so remote actions apply the same offline
 * transition; there is no automatic replay or main-process fallback, and a
 * later call opens a fresh request.
 */
export const mainProcessFetch: RemoteFetch = async (url, init) => {
  if (hasAnyClientBridge() && readClientRuntime().host === "browser") {
    try {
      const body =
        typeof init?.body === "string"
          ? init.body
          : init?.body
            ? Uint8Array.from(init.body).buffer
            : undefined;
      return await window.fetch(url, {
        ...(init?.method ? { method: init.method } : {}),
        ...(init?.headers ? { headers: init.headers } : {}),
        ...(body !== undefined ? { body } : {}),
        ...(init?.signal ? { signal: init.signal } : {}),
      });
    } catch (error) {
      throw new RemoteClientError(sharedMsg("remote.server.unreachable"), 0, "network", {
        cause: error,
      });
    }
  }
  try {
    return await remoteHttpBridgeFetch(String(url), init);
  } catch (error) {
    if (init?.signal?.aborted || isAbortError(error)) {
      throw new DOMException("The remote request was cancelled.", "AbortError");
    }
    if (error instanceof RemoteClientError) throw error;
    throw new RemoteClientError(sharedMsg("remote.server.unreachable"), 0, "network", {
      cause: error,
    });
  }
};
