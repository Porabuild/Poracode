import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkRemoteV3Generated, writeRemoteV3Generated } from "./writeGenerated";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export function runRemoteV3Cli(argv: readonly string[]): number {
  const check = argv.includes("--check");
  if (check) {
    const errors = checkRemoteV3Generated(repositoryRoot);
    if (errors.length > 0) {
      process.stderr.write(`${errors.join("\n")}\n`);
      return 1;
    }
    process.stdout.write("protocol/remote/v3/generated is up to date\n");
    return 0;
  }
  writeRemoteV3Generated(repositoryRoot);
  process.stdout.write("wrote protocol/remote/v3/generated\n");
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("cli.ts")) {
  process.exitCode = runRemoteV3Cli(process.argv.slice(2));
}
