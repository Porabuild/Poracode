/** Cleanup failures must not leave a host alive after it has stopped accepting work. */
export async function shutdownBackendHost(options: {
  steps: readonly (() => void | Promise<void>)[];
  exitCode: number;
  reportError: (error: unknown) => void;
  exit: (code: number) => void;
}): Promise<void> {
  let exitCode = options.exitCode;
  try {
    for (const step of options.steps) {
      try {
        await step();
      } catch (error) {
        if (exitCode === 0) exitCode = 1;
        options.reportError(error);
      }
    }
  } finally {
    options.exit(exitCode);
  }
}
