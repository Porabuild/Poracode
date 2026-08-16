import { describe, expect, it } from "vitest";
import { runtimeEventSchema } from "../../../contracts/runtimeEvent";
import {
  remoteWebSocketClientMessageSchema,
  remoteWebSocketServerMessageSchema,
} from "../../protocol";
import { REMOTE_CONTRACT_INVENTORY } from "../registry";
import { readProtocolManifest } from "../manifestRead";
import { compareUnicodeCodePoints } from "../unicodeOrder";

function discriminatedTypes(schema: unknown): string[] {
  const options = (schema as { options?: readonly unknown[] }).options ?? [];
  const names: string[] = [];
  for (const option of options) {
    const value = (option as { shape?: { type?: { value?: unknown } } }).shape?.type?.value;
    if (typeof value === "string") names.push(value);
  }
  return names.sort(compareUnicodeCodePoints);
}

describe("remote WS/runtime inventory goldens", () => {
  it("derives counts from protocol schemas and the v3 manifest", () => {
    const manifest = readProtocolManifest() as {
      formatVersion: number;
      protocolVersion: number;
      webSocket: {
        clientMessages: string[];
        serverMessages: string[];
        replayableEventTypes: string[];
        runtimeEventTypes: string[];
      };
    };
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.protocolVersion).toBe(3);

    const client = discriminatedTypes(remoteWebSocketClientMessageSchema);
    const server = discriminatedTypes(remoteWebSocketServerMessageSchema);
    const runtime = discriminatedTypes(runtimeEventSchema);

    expect(client).toEqual([...manifest.webSocket.clientMessages].sort(compareUnicodeCodePoints));
    expect(server).toEqual([...manifest.webSocket.serverMessages].sort(compareUnicodeCodePoints));
    expect(runtime).toEqual(
      [...manifest.webSocket.runtimeEventTypes].sort(compareUnicodeCodePoints),
    );

    expect(REMOTE_CONTRACT_INVENTORY.webSocketClientMessages).toBe(client.length);
    expect(REMOTE_CONTRACT_INVENTORY.webSocketServerMessages).toBe(server.length);
    expect(REMOTE_CONTRACT_INVENTORY.replayableEventTypes).toBe(
      manifest.webSocket.replayableEventTypes.length,
    );
    expect(REMOTE_CONTRACT_INVENTORY.runtimeEventTypes).toBe(runtime.length);
    expect(REMOTE_CONTRACT_INVENTORY.replayableEventTypes).toBe(14);
    expect(REMOTE_CONTRACT_INVENTORY.runtimeEventTypes).toBe(14);
    expect(REMOTE_CONTRACT_INVENTORY.webSocketClientMessages).toBe(8);
    expect(REMOTE_CONTRACT_INVENTORY.webSocketServerMessages).toBe(9);
  });
});
