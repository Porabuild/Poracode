import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteDesktopClient } from "@/shared/remote/client";

/**
 * Managed project-command result adoption: `projectCommandResults` v1 is
 * declared per request ONLY when the live activation's descriptor advertised
 * it, and the bounded mode always carries an explicit per-operation command
 * id. An incapable (or unreachable) descriptor keeps the complete legacy
 * request — no unsupported declaration, no blocked command.
 */

const transport = vi.hoisted(() => ({
  activation: null as null | { seq: number; endpoint: string; client: RemoteDesktopClient },
}));

vi.mock("@/renderer/hostTransport/loopbackHttpWsTransport", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, readManagedLoopbackActivation: () => transport.activation };
});

const { sendManagedRootProjectCommand } = await import("./rootCatalogCommands");
const { __resetManagedRootLaunchMetadataCapabilityForTest } =
  await import("./rootLaunchMetadataCapability");

interface ProjectCommandCall {
  readonly command: { readonly kind: string };
  readonly options: { readonly commandId?: string; readonly result?: "bounded" } | undefined;
}

function fakeActivation(options: {
  readonly capability?: boolean;
  readonly rejectDescriptor?: boolean;
  readonly environmentMissing?: boolean;
}): { readonly calls: ProjectCommandCall[] } {
  const calls: ProjectCommandCall[] = [];
  transport.activation = {
    seq: 1,
    endpoint: "http://127.0.0.1:1234",
    client: {
      ...(options.environmentMissing
        ? {}
        : {
            environment: async () => {
              if (options.rejectDescriptor) throw new Error("descriptor unavailable");
              return {
                capabilities:
                  options.capability === false ? {} : { projectCommandResults: { versions: [1] } },
              };
            },
          }),
      projectCommand: async (command: unknown, commandOptions?: unknown) => {
        calls.push({
          command: command as { kind: string },
          options: commandOptions as ProjectCommandCall["options"],
        });
        return { ok: true, project: { id: "p-1" } };
      },
    } as unknown as RemoteDesktopClient,
  };
  return { calls };
}

describe("managed project-command bounded result adoption", () => {
  beforeEach(() => {
    transport.activation = null;
    __resetManagedRootLaunchMetadataCapabilityForTest();
  });

  it("declares the bounded result mode with an explicit per-operation id when advertised", async () => {
    const { calls } = fakeActivation({ capability: true });
    const response = await sendManagedRootProjectCommand({
      kind: "update",
      projectId: "p-1",
      patch: { name: "Renamed" },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command.kind).toBe("update");
    expect(calls[0]?.options?.result).toBe("bounded");
    expect(calls[0]?.options?.commandId).toEqual(expect.any(String));
    // The canonical bounded acknowledgement, never the complete list.
    expect(response).toEqual({ ok: true, project: { id: "p-1" } });
    expect("projects" in response).toBe(false);
  });

  it("keeps the complete legacy request for a host that does not advertise it", async () => {
    const { calls } = fakeActivation({ capability: false });
    await sendManagedRootProjectCommand({
      kind: "update",
      projectId: "p-1",
      patch: { name: "Renamed" },
    });
    expect(calls[0]?.options).toBeUndefined();
    expect(calls[0]?.options?.result).toBeUndefined();
  });

  it("keeps the complete legacy request when the descriptor read fails", async () => {
    const { calls } = fakeActivation({ rejectDescriptor: true });
    await sendManagedRootProjectCommand({
      kind: "update",
      projectId: "p-1",
      patch: { name: "Renamed" },
    });
    expect(calls[0]?.options).toBeUndefined();
  });

  it("keeps the complete legacy request when the client has no descriptor entry", async () => {
    const { calls } = fakeActivation({ environmentMissing: true });
    await sendManagedRootProjectCommand({
      kind: "update",
      projectId: "p-1",
      patch: { name: "Renamed" },
    });
    expect(calls[0]?.options).toBeUndefined();
  });

  it("always gives a catalog kind its receipt identity, declared or not", async () => {
    const { calls } = fakeActivation({ capability: false });
    await sendManagedRootProjectCommand({
      kind: "reorder",
      projectId: "p-1",
      targetProjectId: "p-2",
      placement: "after",
    });
    expect(calls[0]?.options?.commandId).toEqual(expect.any(String));
    expect(calls[0]?.options?.result).toBeUndefined();
  });

  it("refuses locally (no request) when the desktop's own server is not connected", async () => {
    transport.activation = null;
    await expect(
      sendManagedRootProjectCommand({
        kind: "update",
        projectId: "p-1",
        patch: { name: "Renamed" },
      }),
    ).rejects.toThrow(/not connected/i);
  });
});
