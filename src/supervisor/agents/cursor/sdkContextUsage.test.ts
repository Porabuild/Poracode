import { createHash } from "node:crypto";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cursorSdkStateRoot, readCursorSdkContextUsage } from "./sdkContextUsage";

const fakeStores = new Map<
  string,
  { agents: Map<string, string>; blobs: Map<string, Uint8Array> }
>();

vi.mock("../../runtime/sqliteRead", () => ({
  withReadonlyDb: async (dbPath: string, fn: (db: unknown) => unknown) => {
    const store = fakeStores.get(dbPath);
    if (!store) return undefined;
    return fn({
      prepare(sql: string) {
        return {
          get(param: unknown) {
            if (sql.includes("FROM agents")) {
              const ref = store.agents.get(String(param));
              return ref === undefined ? undefined : { latest_checkpoint_ref_json: ref };
            }
            const data = store.blobs.get(String(param));
            return data === undefined ? undefined : { data };
          },
        };
      },
    });
  },
}));

function varint(value: number): Buffer {
  const bytes: number[] = [];
  let remaining = BigInt(value);
  for (;;) {
    const byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining === 0n) {
      bytes.push(byte);
      break;
    }
    bytes.push(byte | 0x80);
  }
  return Buffer.from(bytes);
}

function field(fieldNo: number, value: number | string | Buffer): Buffer {
  if (typeof value === "number") {
    return Buffer.concat([varint((fieldNo << 3) | 0), varint(value)]);
  }
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return Buffer.concat([varint((fieldNo << 3) | 2), varint(bytes.length), bytes]);
}

function category(id: string, label: string, tokens: number): Buffer {
  return field(3, Buffer.concat([field(1, id), field(2, label), field(3, tokens)]));
}

function conversationStateBlob(used: number, max: number, categories: Buffer[]): Buffer {
  const breakdown = field(3, Buffer.concat(categories));
  const tokenDetails = Buffer.concat([field(1, used), field(2, max), breakdown]);
  return field(5, tokenDetails);
}

const AGENT_ID = "agent-12345678-9abc-def0-1234-56789abcdef0";

function installStore(stateRoot: string, blob: Uint8Array): string {
  const blobId = createHash("sha256").update(blob).digest("hex");
  fakeStores.set(join(stateRoot, "index.db"), {
    agents: new Map([[AGENT_ID, JSON.stringify({ blobId, storeKind: "local-agent-store" })]]),
    blobs: new Map(),
  });
  const agentDir = `agent-${createHash("sha256").update(AGENT_ID).digest("hex")}`;
  fakeStores.set(join(stateRoot, "agents", agentDir, "store.db"), {
    agents: new Map(),
    blobs: new Map([[blobId, blob]]),
  });
  return blobId;
}

describe("cursorSdkStateRoot", () => {
  it("mirrors the SDK default store layout for a workspace ref", () => {
    const root = cursorSdkStateRoot("E:\\work\\lightcode", "C:\\home\\tester");
    expect(root).toBe(
      join(
        "C:\\home\\tester",
        ".cursor",
        "projects",
        "E-work-lightcode",
        "sdk-agent-store",
        createHash("md5").update("E:\\work\\lightcode").digest("hex"),
      ),
    );
  });
});

describe("readCursorSdkContextUsage", () => {
  beforeEach(() => {
    fakeStores.clear();
  });

  it("decodes token details and categories from the checkpoint blob", async () => {
    const stateRoot = join("C:\\home\\tester", "store");
    const blob = conversationStateBlob(22_364, 200_000, [
      category("system_prompt", "System prompt", 468),
      category("tools", "Tool definitions", 7049),
      category("summarized_conversation", "Summarized conversation", 0),
      category("conversation", "Conversation", 14_847),
    ]);
    installStore(stateRoot, blob);

    const usage = await readCursorSdkContextUsage({
      cwd: "E:\\work\\lightcode",
      agentId: AGENT_ID,
      stateRoot,
    });

    expect(usage).toEqual({
      usedTokens: 22_364,
      maxTokens: 200_000,
      categories: [
        { id: "system_prompt", label: "System prompt", tokens: 468 },
        { id: "tools", label: "Tool definitions", tokens: 7049 },
        { id: "conversation", label: "Conversation", tokens: 14_847 },
      ],
    });
  });

  it("reads a WSL store from the caller-provided UNC home directory", async () => {
    const cwd = "/home/demo/repo";
    const homeDir = "\\\\wsl.localhost\\Ubuntu\\home\\demo";
    const stateRoot = cursorSdkStateRoot(cwd, homeDir);
    installStore(stateRoot, conversationStateBlob(120, 200_000, []));

    await expect(readCursorSdkContextUsage({ cwd, agentId: AGENT_ID, homeDir })).resolves.toEqual({
      usedTokens: 120,
      maxTokens: 200_000,
      categories: [],
    });
  });

  it("returns undefined when no checkpoint store exists", async () => {
    const usage = await readCursorSdkContextUsage({
      cwd: "E:\\work\\nowhere",
      agentId: AGENT_ID,
      stateRoot: join("C:\\home\\tester", "missing"),
    });
    expect(usage).toBeUndefined();
  });

  it("returns undefined for a malformed blob instead of throwing", async () => {
    const stateRoot = join("C:\\home\\tester", "broken");
    installStore(stateRoot, new Uint8Array([0x2a, 0xff, 0xff, 0xff, 0x7f, 0x01]));

    const usage = await readCursorSdkContextUsage({
      cwd: "E:\\work\\lightcode",
      agentId: AGENT_ID,
      stateRoot,
    });
    expect(usage).toBeUndefined();
  });
});
