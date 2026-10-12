import { createServer } from "node:https";
import { once } from "node:events";
import { describe, it, expect } from "vitest";
import { generateSelfSignedTlsMaterial } from "@/host/remote/server/tlsMaterial";
import { pinnedHttpsFetch } from "./pinnedHttpsFetch";

describe("pinned HTTPS transport", () => {
  it("accepts the exact self-signed leaf and refuses a swapped leaf before sending credentials", async () => {
    const material = generateSelfSignedTlsMaterial();
    const replacement = generateSelfSignedTlsMaterial();
    let requests = 0;
    const server = createServer(material, (_req, res) => {
      requests += 1;
      res.end("ok");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing address");
    const url = `https://127.0.0.1:${address.port}/`;
    try {
      expect(
        await (
          await pinnedHttpsFetch(
            url,
            { headers: { authorization: "Bearer secret" } },
            material.fingerprint,
          )
        ).text(),
      ).toBe("ok");
      server.setSecureContext(replacement);
      await expect(
        pinnedHttpsFetch(
          url,
          { headers: { authorization: "Bearer secret" } },
          material.fingerprint,
        ),
      ).rejects.toThrow("certificate_fingerprint_mismatch");
      expect(requests).toBe(1);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
