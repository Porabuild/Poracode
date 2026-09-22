import { beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({
  activation: null as null | {
    readonly seq: number;
    readonly client: { environment(): Promise<unknown> };
  },
}));

vi.mock("@/renderer/hostTransport/loopbackHttpWsTransport", () => ({
  readManagedLoopbackActivation: () => transport.activation,
}));

import {
  managedRootSupportsProjectCommandResults,
  managedRootSupportsThreadLaunchMetadata,
  __resetManagedRootLaunchMetadataCapabilityForTest,
} from "./rootLaunchMetadataCapability";

interface DescriptorOptions {
  readonly versions?: readonly number[];
  readonly reject?: boolean;
}

function activate(options: DescriptorOptions = {}): { readonly environmentCalls: number } {
  const counter = { environmentCalls: 0 };
  transport.activation = {
    seq: (transport.activation?.seq ?? 0) + 1,
    client: {
      environment: async () => {
        counter.environmentCalls += 1;
        if (options.reject) throw new Error("descriptor unavailable");
        return {
          capabilities: {
            threadLaunchMetadata: { versions: options.versions ?? [1] },
          },
        };
      },
    },
  };
  return counter;
}

describe("managed-root launch-metadata capability", () => {
  beforeEach(() => {
    transport.activation = null;
    __resetManagedRootLaunchMetadataCapabilityForTest();
  });

  it("is false without a live activation", async () => {
    transport.activation = null;
    await expect(managedRootSupportsThreadLaunchMetadata()).resolves.toBe(false);
  });

  it("resolves the advertised version once per activation and caches it", async () => {
    const counter = activate({ versions: [1] });
    await expect(managedRootSupportsThreadLaunchMetadata()).resolves.toBe(true);
    await expect(managedRootSupportsThreadLaunchMetadata()).resolves.toBe(true);
    expect(counter.environmentCalls).toBe(1);
  });

  it("treats an absent capability version as unsupported", async () => {
    activate({ versions: [] });
    await expect(managedRootSupportsThreadLaunchMetadata()).resolves.toBe(false);
  });

  it("revalidates on a new activation and never inherits the retired verdict", async () => {
    activate({ versions: [] });
    await expect(managedRootSupportsThreadLaunchMetadata()).resolves.toBe(false);
    const next = activate({ versions: [1] });
    await expect(managedRootSupportsThreadLaunchMetadata()).resolves.toBe(true);
    expect(next.environmentCalls).toBe(1);
    // The successor's verdict is now the cached one; the retired verdict is gone.
    await expect(managedRootSupportsThreadLaunchMetadata()).resolves.toBe(true);
    expect(next.environmentCalls).toBe(1);
  });

  it("falls back to unsupported when the descriptor read fails", async () => {
    const counter = activate({ reject: true });
    await expect(managedRootSupportsThreadLaunchMetadata()).resolves.toBe(false);
    expect(counter.environmentCalls).toBe(1);
  });

  it("falls back to unsupported when the client has no environment entry at all", async () => {
    transport.activation = {
      seq: 5,
      client: {} as { environment(): Promise<unknown> },
    };
    await expect(managedRootSupportsThreadLaunchMetadata()).resolves.toBe(false);
    await expect(managedRootSupportsProjectCommandResults()).resolves.toBe(false);
  });

  it("discards a descriptor that resolves after its activation was replaced", async () => {
    let releaseOld: (value: unknown) => void = () => {};
    const oldFetch = new Promise((resolve) => {
      releaseOld = resolve;
    });
    transport.activation = {
      seq: 1,
      client: { environment: () => oldFetch },
    };
    const launched = managedRootSupportsThreadLaunchMetadata();
    // The authority is replaced while the retired descriptor is in flight.
    activate({ versions: [] });
    releaseOld({ capabilities: { threadLaunchMetadata: { versions: [1] } } });
    // The retired host's "supported" verdict must not be handed to a launch
    // that will run against its successor.
    await expect(launched).resolves.toBe(false);
  });

  it("reads both capability verdicts from ONE descriptor fetch and caches them", async () => {
    let environmentCalls = 0;
    transport.activation = {
      seq: 6,
      client: {
        environment: async () => {
          environmentCalls += 1;
          return {
            capabilities: {
              threadLaunchMetadata: { versions: [1] },
              projectCommandResults: { versions: [1] },
            },
          };
        },
      },
    };
    await expect(managedRootSupportsProjectCommandResults()).resolves.toBe(true);
    await expect(managedRootSupportsThreadLaunchMetadata()).resolves.toBe(true);
    expect(environmentCalls).toBe(1);
  });

  it("keeps the bounded project-result capability false when only one is advertised", async () => {
    transport.activation = {
      seq: 7,
      client: {
        environment: async () => ({
          capabilities: { threadLaunchMetadata: { versions: [1] } },
        }),
      },
    };
    await expect(managedRootSupportsThreadLaunchMetadata()).resolves.toBe(true);
    await expect(managedRootSupportsProjectCommandResults()).resolves.toBe(false);
  });
});
