import { arrayBufferToBase64 } from "@/shared/base64";
import type { IpcProcedurePayload } from "@/shared/ipc";
import { msg as sharedMsg } from "@/shared/messages";
import { RemoteClientError, type RemoteFetch } from "@/shared/remote/client";
import { readBridge } from "@/renderer/bridge";
import { readClientRuntime } from "@/renderer/clientRuntime";

/**
 * Remote requests run in the main process to avoid renderer CORS. Normalize
 * IPC fetch failures into the shared status-zero transport error so every
 * remote action can apply the same offline transition.
 */
export const mainProcessFetch: RemoteFetch = async (url, init) => {
  if ((window.poracodeHost || window.poracode) && readClientRuntime().host === "browser") {
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
  const result = await readBridge()
    .remoteHttpRequest({
      url: String(url),
      ...(init?.method
        ? {
            method: init.method as NonNullable<IpcProcedurePayload<"remoteHttpRequest">["method"]>,
          }
        : {}),
      ...(init?.headers ? { headers: init.headers } : {}),
      ...(typeof init?.body === "string"
        ? { body: init.body }
        : init?.body
          ? { bodyBase64: arrayBufferToBase64(init.body) }
          : {}),
    })
    .catch((error: unknown) => {
      throw new RemoteClientError(sharedMsg("remote.server.unreachable"), 0, "network", {
        cause: error,
      });
    });
  const nullBody =
    result.status < 200 || result.status === 204 || result.status === 205 || result.status === 304;
  return new Response(nullBody ? null : result.body, {
    status: result.status,
    headers: result.headers,
  });
};
