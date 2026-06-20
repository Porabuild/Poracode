import { describe, expect, it } from "vitest";
import { createUsageCollectorRegistry } from "./registry";
import { createFakeHost } from "./testHost";

describe("createUsageCollectorRegistry", () => {
  it("exposes the built-in provider descriptors", () => {
    const reg = createUsageCollectorRegistry();
    expect(
      reg
        .descriptors()
        .map((d) => d.id)
        .sort(),
    ).toEqual(["claude", "codex", "commandcode", "copilot", "cursor", "factory", "gemini", "grok"]);
    expect(reg.has("claude")).toBe(true);
    expect(reg.has("nope")).toBe(false);
  });

  it("collectAll returns one snapshot per provider, auth-missing without tokens", async () => {
    const snaps = await createUsageCollectorRegistry().collectAll(undefined, createFakeHost());
    expect(snaps).toHaveLength(8);
    expect(snaps.every((s) => s.status === "auth-missing")).toBe(true);
  });

  it("yields an unsupported snapshot for an unknown provider", async () => {
    const snap = await createUsageCollectorRegistry().collect("ghost", createFakeHost());
    expect(snap.status).toBe("unsupported");
    expect(snap.providerId).toBe("ghost");
  });

  it("catches a collector throwing into an error snapshot (no leak)", async () => {
    const reg = createUsageCollectorRegistry([
      {
        descriptor: {
          id: "boom",
          label: "Boom",
          mechanism: "oauth-endpoint",
          needsLogin: false,
          windowIds: [],
        },
        collect: () => Promise.reject(new Error("kaboom")),
      },
    ]);
    const snap = await reg.collect("boom", createFakeHost());
    expect(snap.status).toBe("error");
    expect(snap.error).toBe("kaboom");
  });

  it("accepts a caller-supplied extra collector", () => {
    const reg = createUsageCollectorRegistry([
      {
        descriptor: {
          id: "cursor",
          label: "Cursor",
          mechanism: "cookie",
          needsLogin: true,
          windowIds: ["monthly"],
        },
        collect: (host) =>
          Promise.resolve({
            providerId: "cursor",
            status: "ok" as const,
            windows: [],
            fetchedAt: host.now(),
          }),
      },
    ]);
    expect(reg.has("cursor")).toBe(true);
    expect(reg.descriptors().find((d) => d.id === "cursor")?.needsLogin).toBe(true);
  });
});
