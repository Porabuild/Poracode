import { describe, expect, it } from "vitest";
import type { MachineDescriptor } from "@/renderer/state/machines";
import { findProjectForMachine } from "./acpRegistryAuth";

function machine(overrides: Partial<MachineDescriptor>): MachineDescriptor {
  return {
    id: "local:native",
    ref: { host: "local", env: { kind: "native" } },
    kind: "local",
    label: "Mac mini",
    status: "online",
    ...overrides,
  };
}

describe("findProjectForMachine remote-client host ownership", () => {
  it("pins a remote client's local machine entry to its selected connection key", () => {
    const project = findProjectForMachine(machine({ desktopId: "connection-key" }), [], false, [], {
      allowHomeWithoutProject: true,
    });

    expect(project?.remoteServerId).toBe("connection-key");
    expect(project?.location).toMatchObject({
      kind: "posix",
      path: "~",
      remoteServerId: "connection-key",
    });
  });
});
