import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { LspSessionStatus } from "@/shared/lsp";
import { ServerInstance } from "./serverInstance";

const fakeServerSource = `
let input = Buffer.alloc(0);

function send(id, result) {
  const body = JSON.stringify({ jsonrpc: "2.0", id, result });
  process.stdout.write(
    "Content-Length: " + Buffer.byteLength(body, "utf8") + "\\r\\n\\r\\n" + body,
  );
}

function handle(message) {
  if (message.method === "initialize") {
    send(message.id, { capabilities: { completionProvider: { triggerCharacters: ["."] } } });
    return;
  }
  if (message.method === "textDocument/completion") {
    send(message.id, { items: [{ label: "from-fake-server", kind: 6 }] });
    return;
  }
  if (message.method === "shutdown") {
    send(message.id, null);
    return;
  }
  if (message.method === "exit") {
    process.exit(0);
  }
}

function drain() {
  while (input.length > 0) {
    const headerEnd = input.indexOf("\\r\\n\\r\\n");
    if (headerEnd < 0) return;

    const header = input.subarray(0, headerEnd).toString("utf8");
    const match = /Content-Length:\\s*(\\d+)/i.exec(header);
    if (!match) process.exit(1);

    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (input.length < bodyEnd) return;

    const body = input.subarray(bodyStart, bodyEnd).toString("utf8");
    input = input.subarray(bodyEnd);
    handle(JSON.parse(body));
  }
}

process.stdin.on("data", (chunk) => {
  input = Buffer.concat([input, chunk]);
  drain();
});
`;

describe("ServerInstance", () => {
  const instances: ServerInstance[] = [];

  afterEach(() => {
    for (const instance of instances.splice(0)) {
      instance.dispose();
    }
  });

  it("starts a language server and returns JSON-RPC request results", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "poracode-lsp-project-"));
    const serverPath = join(projectDir, "fake-lsp-server.mjs");
    await writeFile(serverPath, fakeServerSource, "utf8");

    const location: ProjectLocation =
      process.platform === "win32"
        ? { kind: "windows", path: projectDir }
        : { kind: "posix", path: projectDir };
    const statuses: LspSessionStatus[] = [];
    const instance = new ServerInstance(
      "test:lsp",
      {
        languageId: "fake",
        commands: [{ command: process.execPath, args: [serverPath] }],
        fileExtensions: [".fake"],
      },
      location,
      () => {},
      (status) => statuses.push(status),
    );
    instances.push(instance);

    await instance.start();
    const result = await instance.sendMessage({
      jsonrpc: "2.0",
      id: "completion-1",
      method: "textDocument/completion",
      params: {},
    });

    expect(statuses).toContain("ready");
    expect(result).toEqual({ items: [{ label: "from-fake-server", kind: 6 }] });
  });
});
