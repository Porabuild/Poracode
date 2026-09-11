// Execution-only wrapper for clients that cannot set an MCP server's cwd.
// Inherited descriptors preserve every protocol message and capability.
import spawn from "cross-spawn";
import type { McpServer } from "@/shared/contracts";

const configKey = "PORACODE_MCP_STDIO_CONFIG";
const encoded = process.env[configKey];
if (!encoded) throw new Error("Missing MCP stdio launch configuration");
const config = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
  version: number;
  server: McpServer;
};
if (config.version !== 1 || config.server.transport.type !== "stdio") {
  throw new Error("Unsupported MCP stdio launch configuration");
}
const transport = config.server.transport;
const env = { ...process.env, ...transport.env };
delete env[configKey];
const child = spawn(transport.command, transport.args, {
  ...(transport.cwd ? { cwd: transport.cwd } : {}),
  env,
  stdio: "inherit",
  windowsHide: true,
});
child.once("error", () => {
  process.stderr.write("Poracode could not start the MCP server.\n");
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    child.kill(signal);
    const timer = setTimeout(() => child.kill("SIGKILL"), 1000);
    timer.unref();
    child.once("exit", () => clearTimeout(timer));
  });
}
