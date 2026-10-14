import { describe, expect, it, vi } from "vitest";
import { shutdownBackendHost } from "./shutdown";

describe("shutdownBackendHost", () => {
  it("continues cleanup after disposal and database failures, then exits unsuccessfully", async () => {
    const actions: string[] = [];
    const serviceFailure = new Error("service disposal failed");
    const databaseFailure = new Error("before-close hook failed");
    const reportError = vi.fn<(error: unknown) => void>();
    await shutdownBackendHost({
      steps: [
        async () => {
          actions.push("services");
          throw serviceFailure;
        },
        () => {
          actions.push("supervisor");
        },
        async () => {
          actions.push("flush");
        },
        () => {
          actions.push("database");
          throw databaseFailure;
        },
      ],
      exitCode: 0,
      reportError,
      exit: (code) => {
        actions.push(`exit:${code}`);
      },
    });
    expect(actions).toEqual(["services", "supervisor", "flush", "database", "exit:1"]);
    expect(reportError.mock.calls).toEqual([[serviceFailure], [databaseFailure]]);
  });

  it.each([0, 2])(
    "preserves the requested exit code %i after successful cleanup",
    async (exitCode) => {
      const exit = vi.fn<(code: number) => void>();
      await shutdownBackendHost({
        steps: [],
        exitCode,
        reportError: vi.fn<(error: unknown) => void>(),
        exit,
      });
      expect(exit).toHaveBeenCalledWith(exitCode);
    },
  );
});
