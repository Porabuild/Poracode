import { readToolValuePath } from "../toolPresentationSource";

export function formatShellInvocation(cwd: string | undefined, command: string): string {
  const cmd = command.trim();
  if (!cmd) return "";
  if (cwd && cwd.length > 0) {
    const needsCd =
      !cmd.toLowerCase().startsWith("cd ") &&
      !/^(['"]).*\1\s+&&\s+/.test(cmd) &&
      !/^\(\s*cd\s/.test(cmd);
    if (needsCd) return `cd ${cwd.includes(" ") ? JSON.stringify(cwd) : cwd} && ${cmd}`;
  }
  return cmd;
}

function text(payload: unknown, path: string[]): string | undefined {
  const value = readToolValuePath(payload, path);
  return typeof value === "string" ? value : undefined;
}

export function readCommandInvocation(payload: unknown): string {
  const command = text(payload, ["command"]) || text(payload, ["args", "command"]) || "";
  const cwd = text(payload, ["cwd"])?.trim() ?? text(payload, ["args", "cwd"])?.trim();
  return formatShellInvocation(cwd, command);
}
