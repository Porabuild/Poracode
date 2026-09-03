import { describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { terminateChildProcessTree } from "@/shared/processTree";
import { probeMuseModelCatalog } from "./probe";
import { MSP_SCHEMA_FINGERPRINT, MSP_SCHEMA_VERSION } from "./protocol";
import type {
  MspRpcErrorFrame,
  MspRpcNotification,
  MspRpcRequest,
  MspRpcSuccess,
} from "./protocol";
import type { MuseMspTransport, MuseMspTransportListener } from "./stdioTransport";

vi.mock("@/shared/processTree", () => ({
  terminateChildProcessTree: vi.fn<(child: unknown) => void>(),
}));

/** In-memory `muse serve`: answers initialize + model/list like the real host. */
class ScriptedServeHost implements MuseMspTransport {
  readonly written: Array<MspRpcRequest | MspRpcNotification | MspRpcSuccess | MspRpcErrorFrame> =
    [];
  listener: MuseMspTransportListener | undefined;
  constructor(
    private readonly catalog: Record<string, unknown>,
    private readonly failHandshake = false,
    private readonly initSchema: Record<string, unknown> = {
      fingerprint: MSP_SCHEMA_FINGERPRINT,
      version: MSP_SCHEMA_VERSION,
    },
    private readonly neverAnswer = false,
  ) {}

  setListener(listener: MuseMspTransportListener): void {
    this.listener = listener;
  }

  write(message: MspRpcRequest | MspRpcNotification | MspRpcSuccess | MspRpcErrorFrame): void {
    this.written.push(message);
    if (this.neverAnswer) return;
    if (!("method" in message)) return;
    const { method } = message;
    if (method !== "initialize" && method !== "model/list") return;
    const id = "id" in message ? message.id : undefined;
    if (method === "initialize" && typeof id === "number") {
      if (this.failHandshake) {
        queueMicrotask(() =>
          this.listener?.onMessage({
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "bad init", data: { kind: "invalidParams" } },
          }),
        );
      } else {
        queueMicrotask(() =>
          this.listener?.onMessage({
            jsonrpc: "2.0",
            id,
            result: {
              serverInfo: { name: "muse", version: "1.0.2" },
              schema: this.initSchema,
            },
          }),
        );
      }
    } else if (method === "model/list" && typeof id === "number") {
      queueMicrotask(() => this.listener?.onMessage({ jsonrpc: "2.0", id, result: this.catalog }));
    }
    // `initialized` and anything else need no answer.
  }

  dispose(): void {}
}

const LIVE_CATALOG = {
  models: [
    {
      modelId: "muse-spark-1.3",
      displayLabel: "Muse Spark 1.3",
      contextLimit: 1_048_576,
      cost: null,
      description: null,
      isActive: false,
      isDefault: true,
      providerId: "meta",
      releaseDate: "2026-09-02",
      profileId: null,
    },
    {
      modelId: "muse-spark-1.3-contributor",
      displayLabel: "Muse Spark 1.3 Contributor",
      contextLimit: 1_048_576,
      cost: null,
      description: null,
      isActive: false,
      isDefault: false,
      providerId: "meta",
      releaseDate: "2026-09-02",
      profileId: null,
    },
  ],
  profileId: null,
  providerId: "meta",
  source: "providerCatalog",
};

const location = { kind: "posix", path: "/tmp/proj" } as ProjectLocation;

function spawnHostFor(catalog: Record<string, unknown>, failHandshake = false) {
  const host = new ScriptedServeHost(catalog, failHandshake);
  const calls: Array<{ args: unknown }> = [];
  const spawnHost = async (...args: unknown[]) => {
    calls.push({ args });
    return { child: { pid: 4242 } as never, transport: host };
  };
  return { host, calls, spawnHost };
}

describe("probeMuseModelCatalog", () => {
  it("maps the live catalog and passes serve args through", async () => {
    const { host, calls, spawnHost } = spawnHostFor(LIVE_CATALOG);
    const result = await probeMuseModelCatalog(location, {
      executablePath: "/usr/bin/muse",
      probeEnv: { MUSE_NO_AUTO_UPDATE: "1" },
      spawnHost: spawnHost as never,
    });
    expect(result).toEqual({
      models: [
        { id: "muse-spark-1.3", label: "Muse Spark 1.3", contextLimit: 1_048_576, isDefault: true },
        {
          id: "muse-spark-1.3-contributor",
          label: "Muse Spark 1.3 Contributor",
          contextLimit: 1_048_576,
          isDefault: false,
        },
      ],
      source: "providerCatalog",
      providerId: "meta",
      profileId: null,
    });
    // Spawned the ephemeral trusted host with the resolved binary + probe env.
    const [spawnLocation, spawnOptions] = calls[0]!.args as [
      ProjectLocation,
      Record<string, unknown>,
    ];
    expect(spawnLocation).toEqual(location);
    expect(spawnOptions).toMatchObject({
      executablePath: "/usr/bin/muse",
      extraEnv: { MUSE_NO_AUTO_UPDATE: "1" },
      serveArgs: ["serve", "--no-session-log", "--trust-workspace"],
    });
    // Full handshake observed on the wire: initialize, initialized, model/list.
    expect(host.written.map((frame) => ("method" in frame ? frame.method : "<response>"))).toEqual([
      "initialize",
      "initialized",
      "model/list",
    ]);
  });

  it("returns empty catalogs (caller decides the fallback)", async () => {
    const { spawnHost } = spawnHostFor({
      models: [],
      profileId: "tbh",
      providerId: "meta",
      source: "bundledCatalog",
    });
    const result = await probeMuseModelCatalog(location, {
      executablePath: "/usr/bin/muse",
      spawnHost: spawnHost as never,
    });
    expect(result?.models).toEqual([]);
    expect(result?.source).toBe("bundledCatalog");
  });

  it("resolves undefined when the handshake fails or spawn throws", async () => {
    const failing = spawnHostFor(LIVE_CATALOG, true);
    await expect(
      probeMuseModelCatalog(location, {
        executablePath: "/usr/bin/muse",
        spawnHost: failing.spawnHost as never,
      }),
    ).resolves.toBeUndefined();

    const throwing = async () => {
      throw new Error("spawn ENOENT");
    };
    await expect(
      probeMuseModelCatalog(location, {
        executablePath: "/usr/bin/muse",
        spawnHost: throwing as never,
      }),
    ).resolves.toBeUndefined();
  });

  it("never spawns when already aborted", async () => {
    const { calls, spawnHost } = spawnHostFor(LIVE_CATALOG);
    const controller = new AbortController();
    controller.abort();
    await expect(
      probeMuseModelCatalog(location, {
        executablePath: "/usr/bin/muse",
        signal: controller.signal,
        spawnHost: spawnHost as never,
      }),
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("warns on schema drift but still returns the catalog", async () => {
    const host = new ScriptedServeHost(LIVE_CATALOG, false, {
      fingerprint: "sha256:drifted",
      version: 999,
    });
    const spawnHost = (async () => ({
      child: { pid: 4242 } as never,
      transport: host,
    })) as never;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = await probeMuseModelCatalog(location, {
        executablePath: "/usr/bin/muse",
        spawnHost,
      });
      expect(result?.models).toHaveLength(2);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("MSP schema drift"));
    } finally {
      warn.mockRestore();
    }
  });

  it("tears the host down on timeout", async () => {
    const terminate = vi.mocked(terminateChildProcessTree);
    terminate.mockClear();
    const host = new ScriptedServeHost(LIVE_CATALOG, false, undefined, true);
    const spawnHost = (async () => ({
      child: { pid: 4242 } as never,
      transport: host,
    })) as never;
    await expect(
      probeMuseModelCatalog(location, {
        executablePath: "/usr/bin/muse",
        timeoutMs: 100,
        spawnHost,
      }),
    ).resolves.toBeUndefined();
    expect(terminate).toHaveBeenCalled();
  });

  it("tears the host down on mid-flight abort", async () => {
    const terminate = vi.mocked(terminateChildProcessTree);
    terminate.mockClear();
    const host = new ScriptedServeHost(LIVE_CATALOG, false, undefined, true);
    const spawnHost = (async () => ({
      child: { pid: 4242 } as never,
      transport: host,
    })) as never;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);
    await expect(
      probeMuseModelCatalog(location, {
        executablePath: "/usr/bin/muse",
        timeoutMs: 5_000,
        signal: controller.signal,
        spawnHost,
      }),
    ).resolves.toBeUndefined();
    expect(terminate).toHaveBeenCalled();
  });
});
