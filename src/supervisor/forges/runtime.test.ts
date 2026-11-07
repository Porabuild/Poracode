import { describe, expect, it, vi } from "vitest";
import type { WslBridgeClient } from "../wsl/bridge/client";
import { resolveNodeForDistro } from "../wsl/runtime";
import { ForgeRuntime } from "./runtime";

vi.mock("../wsl/runtime", () => ({
  resolveNodeForDistro: vi.fn<() => Promise<{ nodePath: string }>>(async () => ({
    nodePath: "/home/fixture/.poracode/runtime/node",
  })),
}));

describe("source review runtime", () => {
  const location = {
    kind: process.platform === "win32" ? ("windows" as const) : ("posix" as const),
    path: process.cwd(),
  };

  it("feeds offline credential-helper input through stdin without placing it in argv", async () => {
    const runtime = new ForgeRuntime(() => undefined);
    const output = await runtime.run(
      location,
      process.execPath,
      ["-e", "process.stdin.pipe(process.stdout)"],
      {},
      false,
      "protocol=https\nhost=fixture.example\n\n",
    );
    expect(output).toBe("protocol=https\nhost=fixture.example\n\n");
  });

  it("builds added/deleted empty-file and renamed-file diffs without dropping the change", async () => {
    const runtime = new ForgeRuntime(() => undefined);
    expect(await runtime.patch(location, "empty.txt", null, "")).toContain("new file mode 100644");
    expect(await runtime.patch(location, "empty.txt", "", null)).toContain(
      "deleted file mode 100644",
    );
    expect(
      await runtime.patch(location, "new name.txt", "same\n", "same\n", "old name.txt"),
    ).toContain('rename from "old name.txt"\nrename to "new name.txt"');
    expect(await runtime.patch(location, "a.ts", "old\n", "new\n")).toContain("-old\n+new\n");
  });

  it("uses the distro's managed Node for environment, HTTP and stdin wrappers", async () => {
    const wsl = {
      kind: "wsl" as const,
      distro: "Fixture",
      linuxPath: "/repo",
      uncPath: "\\\\wsl.localhost\\Fixture\\repo",
    };
    const processExec = vi.fn<
      (
        location: unknown,
        input: { env?: Record<string, string> },
      ) => Promise<{ ok: boolean; exitCode: number; stdout: string; stderr: string }>
    >(async (_location: unknown, input: { env?: Record<string, string> }) => ({
      ok: true,
      exitCode: 0,
      stdout: input.env?.PORACODE_FORGE_REQUEST ? '{"status":200,"headers":{},"body":"{}"}' : "{}",
      stderr: "",
    }));
    const runtime = new ForgeRuntime(() => ({ processExec }) as unknown as WslBridgeClient);
    await runtime.environment(wsl);
    await runtime.http(wsl)({
      url: "https://fixture.example/api/user",
      method: "GET",
      headers: { Authorization: "fixture" },
    });
    await runtime.run(
      wsl,
      "cafe",
      ["auth", "http", "credential", "get"],
      { CAFE_TOKEN: "" },
      false,
      "host=fixture.example\n\n",
    );
    expect(resolveNodeForDistro).toHaveBeenCalledWith("Fixture");
    for (const call of processExec.mock.calls)
      expect(call[1]).toMatchObject({
        command: "/home/fixture/.poracode/runtime/node",
        cwd: "/repo",
        loginEnv: true,
      });
    expect(processExec.mock.calls.at(-1)?.[1].env?.PORACODE_FORGE_COMMAND).toBe(
      JSON.stringify({ binary: "cafe", args: ["auth", "http", "credential", "get"] }),
    );
  });
});
