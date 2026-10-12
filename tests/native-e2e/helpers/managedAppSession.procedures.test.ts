import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { createProcedureBridge } from "../../../src/shared/ipc/bridge";
import {
  createClientProcedureInvocation,
  parseClientProcedureInvocation,
} from "../../../src/shared/ipc/invocation";
import { ManagedCdpClient } from "./managedAppSession";

describe("qualification client procedures", () => {
  it("uses the loaded renderer facade and preserves no-argument and payload calls", async () => {
    const received: Array<{ name: string; args: unknown[] }> = [];
    const host = {
      invokeProcedure: async (invocation: unknown) => {
        const parsed = parseClientProcedureInvocation(invocation);
        received.push(parsed);
        return parsed.name;
      },
    };
    const window = {
      poracodeHost: host,
      poracode: createProcedureBridge((name, args) =>
        host.invokeProcedure(createClientProcedureInvocation(name, args)),
      ),
    };
    const client = {
      evaluate: async (expression: string) => runInNewContext(expression, { window }),
    } as unknown as ManagedCdpClient;

    await expect(
      ManagedCdpClient.prototype.invokeProcedure.call(client, "dbGetProjects"),
    ).resolves.toBe("dbGetProjects");
    await expect(
      ManagedCdpClient.prototype.invokeProcedure.call(client, "dbGetThreadsPage", { limit: 2 }),
    ).resolves.toBe("dbGetThreadsPage");
    expect(received).toEqual([
      { name: "dbGetProjects", args: [] },
      { name: "dbGetThreadsPage", args: [{ limit: 2 }] },
    ]);
  });
});
