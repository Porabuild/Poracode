import { spawn } from "node:child_process";

/** Speak Chrome's stdio framing to a registered launcher, as the browser does. */
export function callNativeHost(
  launcher: string,
  args: readonly string[],
  request: unknown,
  env: NodeJS.ProcessEnv = process.env,
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const child = spawn(launcher, args, { stdio: ["pipe", "pipe", "inherit"], env });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", reject);
    child.on("close", () => {
      const output = Buffer.concat(chunks);
      if (output.length < 4) return reject(new Error("no reply"));
      const length = output.readUInt32LE(0);
      resolve(JSON.parse(output.subarray(4, 4 + length).toString("utf8")));
    });
    const body = Buffer.from(JSON.stringify(request), "utf8");
    const header = Buffer.alloc(4);
    header.writeUInt32LE(body.length, 0);
    child.stdin.end(Buffer.concat([header, body]));
  });
}
