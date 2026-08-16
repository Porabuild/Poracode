import { afterEach, describe, expect, it } from "vitest";
import { startLab } from "./helpers/testClient.ts";

describe("base-path discovery", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("serves discovery and advertised endpoints under a preserved base path", async () => {
    harness = await startLab({ basePath: "/tunnels/desktop-fixture-001" });
    const prefixed = await fetch(
      new URL("/tunnels/desktop-fixture-001/.well-known/poracode/environment", harness.httpBaseUrl),
    );
    expect(prefixed.status).toBe(200);
    const body = (await prefixed.json()) as {
      endpoints: { httpBaseUrl: string; wsBaseUrl: string };
    };
    expect(body.endpoints.httpBaseUrl).toContain("/tunnels/desktop-fixture-001");
    expect(body.endpoints.wsBaseUrl).toContain("/tunnels/desktop-fixture-001");

    const unprefixed = await fetch(
      new URL("/.well-known/poracode/environment", `http://127.0.0.1:${harness.hostPort}`),
    );
    expect(unprefixed.status).toBe(404);
  });
});
