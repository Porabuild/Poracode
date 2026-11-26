import { describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import type { UsageSnapshot } from "@poracode/agents-usage";
import type { AgentStatus } from "@/shared/contracts";
import type { AgentAdapter } from "../base";
import {
  GET_COMMAND_MODEL_CONFIGS,
  GET_USER_STATUS,
  RETRIEVE_USER_QUOTA_SUMMARY,
} from "./antigravityLanguageServer";
import {
  scanAntigravityUsage,
  type AntigravityUsageRuntime,
  type AntigravityUsageScannerDeps,
} from "./antigravityUsageScanner";

const NOW = 1_717_000_000_000;
const RESET = Date.parse("2026-06-25T03:51:42Z");

const GEMINI_GROUP = {
  displayName: "Gemini Models",
  buckets: [
    { window: "5h", remainingFraction: 0.4, resetTime: "2026-06-25T03:51:42Z" },
    { window: "weekly", remainingFraction: 0.8 },
  ],
};

const CLAUDE_GROUP = {
  displayName: "Claude and GPT models",
  buckets: [
    { window: "5h", remainingFraction: 0.7 },
    { window: "weekly", remainingFraction: 0.9 },
  ],
};

const CLAUDE_GROUP_WITH_DIFFERENT_USAGE = {
  displayName: "Claude and GPT models",
  buckets: [
    { window: "5h", remainingFraction: 0.1 },
    { window: "weekly", remainingFraction: 0.2 },
  ],
};

const DYNAMIC_GEMINI_GROUP = {
  displayName: "Gemini 4 Argon",
  buckets: [{ window: "weekly", remainingFraction: 0.39, resetTime: "2026-10-24T08:59:08Z" }],
};

interface ModelQuota {
  label: string;
  remainingFraction: number;
}

function statusBody(plan?: string, models: ModelQuota[] = []): unknown {
  return {
    userStatus: {
      ...(plan ? { userTier: { name: plan } } : {}),
      ...(models.length > 0
        ? {
            clientModelConfigs: models.map((model) => ({
              label: model.label,
              quotaInfo: { remainingFraction: model.remainingFraction },
            })),
          }
        : {}),
    },
  };
}

function scannerDeps(
  handler: (port: number, path: string) => unknown,
  options: {
    ports?: number[];
    csrfTokens?: string[];
    resolveEndpoints?: AntigravityUsageScannerDeps["resolveEndpoints"];
    getRuntime?: AntigravityUsageScannerDeps["getRuntime"];
    readCliUsage?: AntigravityUsageScannerDeps["readCliUsage"];
    readAcpUsage?: AntigravityUsageScannerDeps["readAcpUsage"];
  } = {},
) {
  const queryLs = vi.fn<AntigravityUsageScannerDeps["queryLs"]>(async (port, path) =>
    handler(port, path),
  );
  return {
    queryLs,
    deps: {
      resolveEndpoints:
        options.resolveEndpoints ??
        (async () => ({
          ports: options.ports ?? [5001],
          csrfTokens: options.csrfTokens ?? ["csrf"],
        })),
      queryLs,
      ...(options.getRuntime ? { getRuntime: options.getRuntime } : {}),
      ...(options.readCliUsage ? { readCliUsage: options.readCliUsage } : {}),
      ...(options.readAcpUsage ? { readAcpUsage: options.readAcpUsage } : {}),
    },
  };
}

describe("scanAntigravityUsage", () => {
  it("returns the first grouped summary that measures Gemini quota and stops probing", async () => {
    const { deps, queryLs } = scannerDeps(
      (port, path) => {
        if (port !== 5001) throw new Error("a later endpoint must not be probed");
        if (path === GET_USER_STATUS) return statusBody("Google AI Pro");
        if (path === RETRIEVE_USER_QUOTA_SUMMARY) {
          return { groups: [GEMINI_GROUP, CLAUDE_GROUP] };
        }
        return undefined;
      },
      { ports: [5001, 5002], csrfTokens: ["tok"] },
    );

    await expect(scanAntigravityUsage(NOW, ["Ubuntu"], deps)).resolves.toEqual({
      providerId: "antigravity",
      status: "ok",
      plan: "Google AI Pro",
      fetchedAt: NOW,
      windows: [
        {
          id: "antigravity:gemini:session-5h",
          label: "Gemini · 5h",
          usedPercent: 60,
          resetsAt: RESET,
        },
        { id: "antigravity:gemini:weekly", label: "Gemini · Weekly", usedPercent: 20 },
        { id: "antigravity:claude:session-5h", label: "Claude · 5h", usedPercent: 30 },
        { id: "antigravity:claude:weekly", label: "Claude · Weekly", usedPercent: 10 },
      ],
    });
    expect(queryLs).toHaveBeenCalledTimes(2);
    expect(queryLs).toHaveBeenCalledWith(5001, GET_USER_STATUS, ["tok"]);
    expect(queryLs).toHaveBeenCalledWith(5001, RETRIEVE_USER_QUOTA_SUMMARY, ["tok"]);
  });

  it("treats a dynamically named Gemini group as a complete grouped answer", async () => {
    const { deps, queryLs } = scannerDeps(
      (port, path) => {
        if (port !== 5001) throw new Error("a later endpoint must not be probed");
        if (path === GET_USER_STATUS) return statusBody("Google AI Pro");
        if (path === RETRIEVE_USER_QUOTA_SUMMARY) {
          return { groups: [DYNAMIC_GEMINI_GROUP] };
        }
        return undefined;
      },
      { ports: [5001, 5002] },
    );

    const snapshot = await scanAntigravityUsage(NOW, [], deps);

    expect(snapshot.windows).toEqual([
      {
        id: "antigravity:gemini-4-argon:weekly",
        label: "Gemini 4 Argon · Weekly",
        usedPercent: 61,
        resetsAt: Date.parse("2026-10-24T08:59:08Z"),
      },
    ]);
    expect(queryLs).toHaveBeenCalledTimes(3);
  });

  it("supplements a dynamic Gemini group with same-endpoint legacy Gemini pools", async () => {
    const { deps } = scannerDeps((_port, path) => {
      if (path === GET_USER_STATUS) {
        return statusBody("Google AI Pro", [
          { label: "Gemini 3 Pro", remainingFraction: 0.5 },
          { label: "Gemini 3 Flash", remainingFraction: 0.25 },
        ]);
      }
      if (path === RETRIEVE_USER_QUOTA_SUMMARY) {
        return { groups: [DYNAMIC_GEMINI_GROUP, CLAUDE_GROUP] };
      }
      return undefined;
    });

    const snapshot = await scanAntigravityUsage(NOW, [], deps);

    expect(snapshot.plan).toBe("Google AI Pro");
    expect(snapshot.windows.map((window) => [window.id, window.usedPercent])).toEqual([
      ["antigravity:gemini-pro", 50],
      ["antigravity:gemini-flash", 75],
      ["antigravity:claude:session-5h", 30],
      ["antigravity:claude:weekly", 10],
      ["antigravity:gemini-4-argon:weekly", 61],
    ]);
  });

  it("replaces a partial first endpoint with a later full grouped summary", async () => {
    const { deps } = scannerDeps(
      (port, path) => {
        if (path === GET_USER_STATUS) {
          return statusBody(port === 5001 ? "Partial Plan" : "Full Plan");
        }
        if (path === RETRIEVE_USER_QUOTA_SUMMARY) {
          return port === 5001
            ? { groups: [CLAUDE_GROUP] }
            : { groups: [GEMINI_GROUP, CLAUDE_GROUP_WITH_DIFFERENT_USAGE] };
        }
        return undefined;
      },
      { ports: [5001, 5002] },
    );

    const snapshot = await scanAntigravityUsage(NOW, [], deps);

    expect(snapshot.plan).toBe("Full Plan");
    expect(snapshot.windows.map((window) => [window.id, window.usedPercent])).toEqual([
      ["antigravity:gemini:session-5h", 60],
      ["antigravity:gemini:weekly", 20],
      ["antigravity:claude:session-5h", 90],
      ["antigravity:claude:weekly", 80],
    ]);
  });

  it("prefers a grouped measured quota over another endpoint's legacy measured quota", async () => {
    const { deps } = scannerDeps(
      (port, path) => {
        if (path === GET_USER_STATUS) {
          return port === 5001
            ? statusBody("Legacy Plan", [
                { label: "Gemini 3 Pro", remainingFraction: 0.5 },
                { label: "Claude Opus", remainingFraction: 0.2 },
              ])
            : statusBody("Grouped Plan");
        }
        if (path === RETRIEVE_USER_QUOTA_SUMMARY) {
          return port === 5001 ? undefined : { groups: [CLAUDE_GROUP] };
        }
        return undefined;
      },
      { ports: [5001, 5002] },
    );

    const snapshot = await scanAntigravityUsage(NOW, [], deps);

    expect(snapshot.plan).toBe("Grouped Plan");
    expect(snapshot.windows.map((window) => window.id)).toEqual([
      "antigravity:claude:session-5h",
      "antigravity:claude:weekly",
    ]);
    expect(snapshot.windows.map((window) => window.usedPercent)).toEqual([30, 10]);
  });

  it("keeps the first grouped result instead of mixing a later endpoint's windows or plan", async () => {
    const { deps } = scannerDeps(
      (port, path) => {
        if (path === GET_USER_STATUS) {
          return statusBody(port === 5001 ? "First Plan" : "Second Plan");
        }
        if (path === RETRIEVE_USER_QUOTA_SUMMARY) {
          return {
            groups: [port === 5001 ? CLAUDE_GROUP : CLAUDE_GROUP_WITH_DIFFERENT_USAGE],
          };
        }
        return undefined;
      },
      { ports: [5001, 5002] },
    );

    const snapshot = await scanAntigravityUsage(NOW, [], deps);

    expect(snapshot.plan).toBe("First Plan");
    expect(snapshot.windows.map((window) => window.usedPercent)).toEqual([30, 10]);
  });

  it("retains the first grouped result when a later endpoint fails", async () => {
    const { deps } = scannerDeps(
      (port, path) => {
        if (port === 5002) throw new Error("endpoint went away");
        if (path === GET_USER_STATUS) return statusBody("Local Plan");
        if (path === RETRIEVE_USER_QUOTA_SUMMARY) return { groups: [CLAUDE_GROUP] };
        return undefined;
      },
      { ports: [5001, 5002] },
    );

    const snapshot = await scanAntigravityUsage(NOW, [], deps);

    expect(snapshot.status).toBe("ok");
    expect(snapshot.plan).toBe("Local Plan");
    expect(snapshot.windows.map((window) => window.id)).toEqual([
      "antigravity:claude:session-5h",
      "antigravity:claude:weekly",
    ]);
  });

  it("falls back to GetCommandModelConfigs on the same endpoint for legacy quota", async () => {
    const { deps, queryLs } = scannerDeps((port, path) => {
      if (port !== 5001) return undefined;
      if (path === GET_USER_STATUS) return statusBody();
      if (path === GET_COMMAND_MODEL_CONFIGS) {
        return statusBody(undefined, [{ label: "Gemini 3 Pro", remainingFraction: 0.5 }]);
      }
      return undefined;
    });

    const snapshot = await scanAntigravityUsage(NOW, [], deps);

    expect(snapshot.windows).toEqual([
      {
        id: "antigravity:gemini-pro",
        label: "Gemini Pro",
        usedPercent: 50,
        unit: "requests",
      },
    ]);
    expect(queryLs).toHaveBeenCalledWith(5001, GET_COMMAND_MODEL_CONFIGS, ["csrf"]);
  });

  it("supplements a Claude-only grouped summary with Gemini pools from the same endpoint", async () => {
    const { deps } = scannerDeps((_port, path) => {
      if (path === GET_USER_STATUS) {
        return statusBody("Google AI Pro", [
          { label: "Gemini 3 Pro", remainingFraction: 0.5 },
          { label: "Gemini 4 Argon", remainingFraction: 0.4 },
        ]);
      }
      if (path === RETRIEVE_USER_QUOTA_SUMMARY) return { groups: [CLAUDE_GROUP] };
      return undefined;
    });

    const snapshot = await scanAntigravityUsage(NOW, [], deps);

    expect(snapshot.plan).toBe("Google AI Pro");
    expect(snapshot.windows.map((window) => window.id)).toEqual([
      "antigravity:gemini-pro",
      "antigravity:gemini-argon",
      "antigravity:claude:session-5h",
      "antigravity:claude:weekly",
    ]);
  });

  it("supplements a Claude-only summary over the production loopback transport", async () => {
    const paths: string[] = [];
    const server = createServer((request, response) => {
      request.resume();
      request.on("end", () => {
        paths.push(request.url ?? "");
        const body =
          request.url === GET_USER_STATUS
            ? statusBody("Google AI Pro", [{ label: "Gemini 3 Pro", remainingFraction: 0.5 }])
            : request.url === RETRIEVE_USER_QUOTA_SUMMARY
              ? { groups: [CLAUDE_GROUP] }
              : undefined;
        if (!body) {
          response.writeHead(404).end();
          return;
        }
        response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("expected a TCP address");
      const snapshot = await scanAntigravityUsage(NOW, [], {
        resolveEndpoints: async () => ({ ports: [address.port], csrfTokens: [] }),
      });

      expect(paths).toHaveLength(2);
      expect(paths).toEqual(expect.arrayContaining([GET_USER_STATUS, RETRIEVE_USER_QUOTA_SUMMARY]));
      expect(snapshot).toMatchObject({
        status: "ok",
        plan: "Google AI Pro",
        windows: [
          { id: "antigravity:gemini-pro", usedPercent: 50 },
          { id: "antigravity:claude:session-5h", usedPercent: 30 },
          { id: "antigravity:claude:weekly", usedPercent: 10 },
        ],
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("presents an empty quota response as ok with the same endpoint's plan", async () => {
    const { deps } = scannerDeps((_port, path) => {
      if (path === GET_USER_STATUS) return statusBody("Google AI Pro");
      if (path === RETRIEVE_USER_QUOTA_SUMMARY) return { groups: [] };
      return undefined;
    });

    await expect(scanAntigravityUsage(NOW, [], deps)).resolves.toEqual({
      providerId: "antigravity",
      status: "ok",
      plan: "Google AI Pro",
      windows: [],
      fetchedAt: NOW,
    });
  });

  it("rejects an unrelated summary JSON object instead of treating it as an answer", async () => {
    const { deps } = scannerDeps((_port, path) => {
      if (path === RETRIEVE_USER_QUOTA_SUMMARY) return { unexpected: true };
      return undefined;
    });

    await expect(scanAntigravityUsage(NOW, [], deps)).resolves.toEqual({
      providerId: "antigravity",
      status: "app-not-running",
      windows: [],
      fetchedAt: NOW,
    });
  });

  it("presents a provider-shaped status without quota as ok context", async () => {
    const { deps } = scannerDeps((_port, path) => {
      if (path === GET_USER_STATUS) return statusBody("Google AI Pro");
      return undefined;
    });

    await expect(scanAntigravityUsage(NOW, [], deps)).resolves.toEqual({
      providerId: "antigravity",
      status: "ok",
      plan: "Google AI Pro",
      windows: [],
      fetchedAt: NOW,
    });
  });

  it("prefers a measured legacy result from a later endpoint over empty context", async () => {
    const { deps } = scannerDeps(
      (port, path) => {
        if (path === GET_USER_STATUS) {
          return port === 5001
            ? statusBody("Context Plan")
            : statusBody("Legacy Plan", [{ label: "Gemini 3 Pro", remainingFraction: 0.5 }]);
        }
        if (path === RETRIEVE_USER_QUOTA_SUMMARY && port === 5001) return { groups: [] };
        return undefined;
      },
      { ports: [5001, 5002] },
    );

    const snapshot = await scanAntigravityUsage(NOW, [], deps);

    expect(snapshot.plan).toBe("Legacy Plan");
    expect(snapshot.windows.map((window) => window.id)).toEqual(["antigravity:gemini-pro"]);
  });

  function runtimeStatus(overrides: Partial<AgentStatus> = {}): AgentStatus {
    return {
      kind: "antigravity",
      label: "Antigravity",
      installed: true,
      authState: "authenticated",
      capabilities: {},
      executablePath: "/opt/agy",
      runtimeVariants: {
        cli: {
          presentationMode: "terminal",
          installed: true,
          authState: "authenticated",
          authUsesProviderLogin: true,
          capabilities: {},
        },
        acp: {
          presentationMode: "gui",
          installed: true,
          authState: "authenticated",
          authUsesProviderLogin: true,
          capabilities: {},
        },
      },
      ...overrides,
    } as unknown as AgentStatus;
  }

  function usageRuntime(status: AgentStatus): AntigravityUsageRuntime {
    return { status, adapter: {} as AgentAdapter };
  }

  const CLI_SNAPSHOT: UsageSnapshot = {
    providerId: "antigravity",
    status: "ok",
    windows: [{ id: "antigravity:gemini:weekly", label: "Gemini · Weekly", usedPercent: 12 }],
    fetchedAt: NOW,
  };

  const ACP_SNAPSHOT: UsageSnapshot = {
    providerId: "antigravity",
    status: "ok",
    windows: [{ id: "antigravity:claude:weekly", label: "Claude · Weekly", usedPercent: 34 }],
    fetchedAt: NOW,
  };

  describe("scanAntigravityUsage signed-in runtime order", () => {
    it("uses the qualified CLI after an empty local probe and does not probe ACP", async () => {
      const readCliUsage = vi.fn<NonNullable<AntigravityUsageScannerDeps["readCliUsage"]>>(
        async () => CLI_SNAPSHOT,
      );
      const readAcpUsage = vi.fn<NonNullable<AntigravityUsageScannerDeps["readAcpUsage"]>>(
        async () => ACP_SNAPSHOT,
      );
      const resolveEndpoints = vi.fn<AntigravityUsageScannerDeps["resolveEndpoints"]>(async () => ({
        ports: [],
        csrfTokens: [],
      }));

      const snapshot = await scanAntigravityUsage(NOW, [], {
        getRuntime: async () => usageRuntime(runtimeStatus()),
        readCliUsage,
        readAcpUsage,
        resolveEndpoints,
        queryLs: vi.fn<AntigravityUsageScannerDeps["queryLs"]>(),
      });

      expect(snapshot).toBe(CLI_SNAPSHOT);
      expect(readCliUsage).toHaveBeenCalledWith(
        "/opt/agy",
        expect.objectContaining({ kind: "posix" }),
        NOW,
        expect.anything(),
      );
      expect(readAcpUsage).not.toHaveBeenCalled();
      expect(resolveEndpoints).toHaveBeenCalledOnce();
    });

    it("uses ACP when no CLI exists and keeps the ACP snapshot whole", async () => {
      const readCliUsage = vi.fn<NonNullable<AntigravityUsageScannerDeps["readCliUsage"]>>();
      const readAcpUsage = vi.fn<NonNullable<AntigravityUsageScannerDeps["readAcpUsage"]>>(
        async () => ACP_SNAPSHOT,
      );
      const status = runtimeStatus({
        executablePath: undefined,
        runtimeVariants: {
          cli: {
            presentationMode: "terminal",
            installed: false,
            authState: "missing",
            authUsesProviderLogin: true,
            capabilities: {} as never,
          },
          acp: {
            presentationMode: "gui",
            installed: true,
            authState: "authenticated",
            authUsesProviderLogin: true,
            capabilities: {} as never,
          },
        },
      });

      const snapshot = await scanAntigravityUsage(NOW, [], {
        getRuntime: async () => usageRuntime(status),
        readCliUsage,
        readAcpUsage,
        resolveEndpoints: async () => ({ ports: [], csrfTokens: [] }),
        queryLs: vi.fn<AntigravityUsageScannerDeps["queryLs"]>(),
      });

      expect(snapshot).toBe(ACP_SNAPSHOT);
      expect(readCliUsage).not.toHaveBeenCalled();
      expect(readAcpUsage).toHaveBeenCalledOnce();
    });

    it("falls from a failed CLI read to ACP and never merges their windows", async () => {
      const readCliUsage = vi.fn<NonNullable<AntigravityUsageScannerDeps["readCliUsage"]>>(
        async () => {
          throw new Error("CLI timed out");
        },
      );
      const readAcpUsage = vi.fn<NonNullable<AntigravityUsageScannerDeps["readAcpUsage"]>>(
        async () => ACP_SNAPSHOT,
      );

      const snapshot = await scanAntigravityUsage(NOW, [], {
        getRuntime: async () => usageRuntime(runtimeStatus()),
        readCliUsage,
        readAcpUsage,
        resolveEndpoints: async () => ({ ports: [], csrfTokens: [] }),
        queryLs: vi.fn<AntigravityUsageScannerDeps["queryLs"]>(),
      });

      expect(snapshot).toBe(ACP_SNAPSHOT);
      expect(readCliUsage).toHaveBeenCalledOnce();
      expect(readAcpUsage).toHaveBeenCalledOnce();
    });

    it("uses a measured local reading without launching CLI or ACP", async () => {
      const { deps, queryLs } = scannerDeps((_port, path) => {
        if (path === GET_USER_STATUS) return statusBody("Google AI Pro");
        if (path === RETRIEVE_USER_QUOTA_SUMMARY) return { groups: [CLAUDE_GROUP] };
        return undefined;
      });
      const readCliUsage = vi.fn<NonNullable<AntigravityUsageScannerDeps["readCliUsage"]>>(
        async () => CLI_SNAPSHOT,
      );
      const readAcpUsage = vi.fn<NonNullable<AntigravityUsageScannerDeps["readAcpUsage"]>>(
        async () => ACP_SNAPSHOT,
      );

      const snapshot = await scanAntigravityUsage(NOW, [], {
        ...deps,
        getRuntime: async () => usageRuntime(runtimeStatus()),
        readCliUsage,
        readAcpUsage,
      });

      expect(snapshot.status).toBe("ok");
      expect(snapshot.plan).toBe("Google AI Pro");
      expect(queryLs).toHaveBeenCalled();
      expect(readCliUsage).not.toHaveBeenCalled();
      expect(readAcpUsage).not.toHaveBeenCalled();
    });

    it("falls through an answered local context to a measured CLI reading", async () => {
      const { deps } = scannerDeps((_port, path) => {
        if (path === GET_USER_STATUS) return statusBody("Google AI Pro");
        return undefined;
      });
      const readCliUsage = vi.fn<NonNullable<AntigravityUsageScannerDeps["readCliUsage"]>>(
        async () => CLI_SNAPSHOT,
      );
      const readAcpUsage = vi.fn<NonNullable<AntigravityUsageScannerDeps["readAcpUsage"]>>(
        async () => ACP_SNAPSHOT,
      );

      const snapshot = await scanAntigravityUsage(NOW, [], {
        ...deps,
        getRuntime: async () => usageRuntime(runtimeStatus()),
        readCliUsage,
        readAcpUsage,
      });

      expect(snapshot).toBe(CLI_SNAPSHOT);
      expect(readCliUsage).toHaveBeenCalledOnce();
      expect(readAcpUsage).not.toHaveBeenCalled();
    });

    it("retains answered-but-unmeasured local context when fallbacks fail", async () => {
      const { deps } = scannerDeps((_port, path) => {
        if (path === GET_USER_STATUS) return statusBody("Google AI Pro");
        return undefined;
      });
      const readCliUsage = vi.fn<NonNullable<AntigravityUsageScannerDeps["readCliUsage"]>>(
        async () => {
          throw new Error("CLI failed");
        },
      );
      const readAcpUsage = vi.fn<NonNullable<AntigravityUsageScannerDeps["readAcpUsage"]>>(
        async () => undefined,
      );

      const snapshot = await scanAntigravityUsage(NOW, [], {
        ...deps,
        getRuntime: async () => usageRuntime(runtimeStatus()),
        readCliUsage,
        readAcpUsage,
      });

      expect(snapshot).toMatchObject({
        status: "ok",
        plan: "Google AI Pro",
        windows: [],
        fetchedAt: NOW,
      });
      expect(readCliUsage).toHaveBeenCalledOnce();
      expect(readAcpUsage).toHaveBeenCalledOnce();
    });

    it("skips the native Windows CLI and uses authenticated ACP", async () => {
      const readCliUsage = vi.fn<NonNullable<AntigravityUsageScannerDeps["readCliUsage"]>>();
      const readAcpUsage = vi.fn<NonNullable<AntigravityUsageScannerDeps["readAcpUsage"]>>(
        async () => ACP_SNAPSHOT,
      );
      const status = runtimeStatus({
        envKind: "windows",
        executablePath: "C:\\Tools\\agy.exe",
      });

      const snapshot = await scanAntigravityUsage(NOW, [], {
        getRuntime: async () => usageRuntime(status),
        readCliUsage,
        readAcpUsage,
        resolveEndpoints: async () => ({ ports: [], csrfTokens: [] }),
        queryLs: vi.fn<AntigravityUsageScannerDeps["queryLs"]>(),
      });

      expect(snapshot).toBe(ACP_SNAPSHOT);
      expect(readCliUsage).not.toHaveBeenCalled();
      expect(readAcpUsage).toHaveBeenCalledOnce();
    });
  });

  describe("scanAntigravityUsage WSL routing", () => {
    it("passes the supplied WSL distros to endpoint discovery", async () => {
      const resolveEndpoints = vi.fn<AntigravityUsageScannerDeps["resolveEndpoints"]>(async () => ({
        ports: [],
        csrfTokens: [],
      }));

      await scanAntigravityUsage(NOW, ["Ubuntu", "Debian"], { resolveEndpoints });

      expect(resolveEndpoints).toHaveBeenCalledTimes(1);
      expect(resolveEndpoints).toHaveBeenCalledWith(["Ubuntu", "Debian"]);
    });

    it("returns app-not-running when no endpoints are discovered", async () => {
      const queryLs = vi.fn<AntigravityUsageScannerDeps["queryLs"]>();
      const snapshot = await scanAntigravityUsage(NOW, [], {
        resolveEndpoints: async () => ({ ports: [], csrfTokens: [] }),
        queryLs,
      });

      expect(snapshot).toEqual({
        providerId: "antigravity",
        status: "app-not-running",
        windows: [],
        fetchedAt: NOW,
      });
      expect(queryLs).not.toHaveBeenCalled();
    });

    it("returns app-not-running when discovery throws", async () => {
      const queryLs = vi.fn<AntigravityUsageScannerDeps["queryLs"]>();
      await expect(
        scanAntigravityUsage(NOW, [], {
          resolveEndpoints: async () => {
            throw new Error("ps failed");
          },
          queryLs,
        }),
      ).resolves.toEqual({
        providerId: "antigravity",
        status: "app-not-running",
        windows: [],
        fetchedAt: NOW,
      });
      expect(queryLs).not.toHaveBeenCalled();
    });

    it("returns app-not-running when every local endpoint fails", async () => {
      const { deps } = scannerDeps(
        () => {
          throw new Error("connect ECONNREFUSED");
        },
        { ports: [5001, 5002] },
      );

      await expect(scanAntigravityUsage(NOW, [], deps)).resolves.toEqual({
        providerId: "antigravity",
        status: "app-not-running",
        windows: [],
        fetchedAt: NOW,
      });
    });
  });
});
