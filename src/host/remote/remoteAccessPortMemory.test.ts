import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_REMOTE_ACCESS_PORT } from "./config";
import {
  REMOTE_ACCESS_PORT_MEMORY_FILE,
  REMOTE_ACCESS_PORT_MEMORY_VERSION,
  listeningPortOf,
  preferredRemoteAccessPort,
  rememberRemoteAccessPort,
} from "./remoteAccessPortMemory";

describe("remote access port memory", () => {
  let baseDir: string;
  const memoryFile = () => join(baseDir, REMOTE_ACCESS_PORT_MEMORY_FILE);

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "poracode-port-memory-"));
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("prefers the default port for a host root written before the memory existed", () => {
    // A pre-upgrade root has only the identity file; its clients were paired
    // against the default port unless it was taken.
    writeFileSync(
      join(baseDir, "remote-access-identity.json"),
      JSON.stringify({ desktopId: "host", label: "Host" }),
    );
    expect(preferredRemoteAccessPort(baseDir, "0.0.0.0")).toBe(DEFAULT_REMOTE_ACCESS_PORT);
  });

  it("remembers each bind host's port separately", () => {
    rememberRemoteAccessPort(baseDir, "0.0.0.0", 49153);
    rememberRemoteAccessPort(baseDir, "127.0.0.1", 49160);

    expect(preferredRemoteAccessPort(baseDir, "0.0.0.0")).toBe(49153);
    expect(preferredRemoteAccessPort(baseDir, "127.0.0.1")).toBe(49160);
    expect(JSON.parse(readFileSync(memoryFile(), "utf8"))).toEqual({
      version: REMOTE_ACCESS_PORT_MEMORY_VERSION,
      ports: { "0.0.0.0": 49153, "127.0.0.1": 49160 },
    });
  });

  it("replaces a malformed memory file", () => {
    writeFileSync(memoryFile(), "{not json");
    expect(preferredRemoteAccessPort(baseDir, "0.0.0.0")).toBe(DEFAULT_REMOTE_ACCESS_PORT);

    rememberRemoteAccessPort(baseDir, "0.0.0.0", 49155);
    expect(preferredRemoteAccessPort(baseDir, "0.0.0.0")).toBe(49155);
  });

  it("ignores and never overwrites a memory file from a newer version", () => {
    const future = JSON.stringify({
      version: REMOTE_ACCESS_PORT_MEMORY_VERSION + 1,
      ports: { "0.0.0.0": 49170 },
    });
    writeFileSync(memoryFile(), future);

    expect(preferredRemoteAccessPort(baseDir, "0.0.0.0")).toBe(DEFAULT_REMOTE_ACCESS_PORT);
    rememberRemoteAccessPort(baseDir, "0.0.0.0", 49152);
    expect(readFileSync(memoryFile(), "utf8")).toBe(future);
  });

  it("reads the listening port from a server's local base URL", () => {
    expect(listeningPortOf("http://127.0.0.1:49153")).toBe(49153);
    expect(listeningPortOf("not a url")).toBeNull();
  });
});
