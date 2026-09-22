#!/usr/bin/env node
import { PoracodeLauncherError } from "../lib/errors.mjs";
import { runCli } from "../lib/launcher.mjs";

try {
  process.exitCode = await runCli();
} catch (error) {
  if (error instanceof PoracodeLauncherError) {
    process.stderr.write(`[poracode] ${error.message}\n`);
    if (error.hint) process.stderr.write(`[poracode] ${error.hint}\n`);
  } else {
    process.stderr.write(
      `[poracode] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
  }
  process.exitCode = 1;
}
