import { once } from "node:events";
import {
  createReadStream,
  mkdirSync,
  mkdtempSync,
  rmSync,
  truncateSync,
  writeFileSync,
  type ReadStream,
} from "node:fs";
import { createServer } from "node:http";
import { connect, type AddressInfo } from "node:net";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pipeOwnedFileResponse } from "./fileResponseStream";

describe("owned file response retirement", () => {
  it.each(["disconnect", "grant-revoked"])(
    "joins reader close and releases its descriptor on %s",
    async (retirement) => {
      mkdirSync("tmp/issue-806", { recursive: true });
      const root = mkdtempSync("tmp/issue-806/stream-");
      const path = join(root, "large.mp4");
      writeFileSync(path, "fixture");
      truncateSync(path, 64 * 1024 * 1024);
      const controller = new AbortController();
      let reader!: ReadStream;
      let transfer!: Promise<void>;
      const server = createServer((_req, res) => {
        res.writeHead(200, { "content-type": "video/mp4", "content-length": 64 * 1024 * 1024 });
        reader = createReadStream(path);
        transfer = pipeOwnedFileResponse(reader, res, undefined, controller.signal);
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const socket = connect((server.address() as AddressInfo).port, "127.0.0.1");
      try {
        await once(socket, "connect");
        socket.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n`);
        await once(socket, "data");
        expect(reader.closed).toBe(false);
        if (retirement === "disconnect") socket.destroy();
        else controller.abort();
        await transfer;
        expect(reader.closed).toBe(true);
        expect((reader as ReadStream & { fd: number | null }).fd).toBeNull();
      } finally {
        socket.destroy();
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
