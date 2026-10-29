import { execFile, spawn, type ChildProcess } from "node:child_process";
import { stat } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { ChildProcessLifetime } from "@/shared/childProcessLifetime";

export class DeviceWorkspaceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}

export async function findDeviceTool(
  name: string,
  candidates: string[] = [],
): Promise<string | null> {
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  for (const path of [
    ...candidates,
    ...(process.env.PATH ?? "")
      .split(delimiter)
      .filter(Boolean)
      .map((dir) => join(dir, executable)),
  ]) {
    if (
      await stat(path).then(
        (entry) => entry.isFile(),
        () => false,
      )
    )
      return path;
  }
  return null;
}

export async function runDeviceCommand(
  file: string,
  args: string[],
  signal: AbortSignal,
  timeout = 15_000,
): Promise<Buffer> {
  signal.throwIfAborted();
  const result = Promise.withResolvers<Buffer>();
  const child = execFile(
    file,
    args,
    { encoding: "buffer", windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
    (error, stdout, stderr) => {
      if (error) {
        result.reject(
          new DeviceWorkspaceError(
            "device_command_failed",
            stderr.toString().trim().slice(0, 2000) || error.message,
          ),
        );
      } else result.resolve(stdout);
    },
  );
  const lifetime = new ChildProcessLifetime(child);
  const stop = () => {
    void lifetime.stop().catch(result.reject);
  };
  const timer = setTimeout(stop, timeout);
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  try {
    const output = await result.promise;
    signal.throwIfAborted();
    return output;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
    await lifetime.closed;
  }
}

export function launchDeviceProcess(file: string, args: string[]): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: "ignore", windowsHide: true });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve(child);
    });
  });
}
