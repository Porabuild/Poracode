import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteDesktopClient } from "@/shared/remote/client";
import type { RemoteFetch } from "@/shared/remote/clientTypes";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRecord } from "./types";
import { disposeDirectImageSession } from "./directImages";

const connectionKey = "image-host";
const path = "/tmp/attached.png";
const server: RemoteServerRecord = {
  connectionId: connectionKey,
  desktopId: connectionKey,
  label: "Image host",
  endpoint: "https://host.test/",
  accessToken: "access-test",
  scopes: ["session:read"],
  transport: { kind: "direct" },
};

describe("direct remote image session", () => {
  afterEach(() => {
    disposeDirectImageSession(connectionKey);
    vi.unstubAllGlobals();
    useRemoteServersStore.setState({ servers: [], runtime: {} });
  });

  it("reuses one client and one blob across a mounted thumbnail and later lightbox read", async () => {
    const revoke = vi.fn<(url: string) => void>();
    class ImageURL extends URL {
      static override createObjectURL = vi.fn<(blob: Blob) => string>(
        () => "blob:direct-attachment",
      );
      static override revokeObjectURL = revoke;
    }
    vi.stubGlobal("URL", ImageURL);
    let issued = 0;
    const fetch = vi.fn<RemoteFetch>((url) => {
      const request = new URL(String(url));
      if (request.pathname === "/api/files/image-ticket") {
        issued += 1;
        return Promise.resolve(
          new Response(JSON.stringify({ ticket: `lc_img_${issued}`, expiresAt: "2030-01-01" }), {
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return Promise.resolve(
        new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { "content-type": "image/png" },
        }),
      );
    });
    const clientFactory = vi.fn<(endpoint: string, accessToken?: string) => RemoteDesktopClient>(
      (endpoint, accessToken) => new RemoteDesktopClient(endpoint, accessToken, fetch),
    );
    useRemoteServersStore.setState({ servers: [server], clientFactory });

    const store = useRemoteServersStore.getState();
    const readiness = store.imageReadinessFor(connectionKey);
    expect(readiness?.resolvePath(path)).toBe("");
    expect(store.localImageUrl(connectionKey, path)).toBe("");
    await vi.waitFor(() => expect(readiness?.resolvePath(path)).toBe("blob:direct-attachment"));
    expect(store.localImageUrl(connectionKey, path)).toBe("blob:direct-attachment");
    expect(clientFactory).toHaveBeenCalledTimes(1);
    expect(issued).toBe(1);
    useRemoteServersStore.setState({
      servers: [{ ...server, accessToken: "repaired-access-test" }],
    });
    const replacement = store.imageReadinessFor(connectionKey);
    expect(replacement).not.toBe(readiness);
    expect(clientFactory).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenCalledWith("blob:direct-attachment");
    disposeDirectImageSession(connectionKey);
  });
});
