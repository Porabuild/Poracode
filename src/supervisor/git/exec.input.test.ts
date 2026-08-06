import { describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { execGit } from "./exec";

const location: ProjectLocation = { kind: "posix", path: process.cwd() };

describe("execGit stdin", () => {
  it("reports an early child exit without leaking an unhandled stdin EPIPE", async () => {
    await expect(
      execGit(location, ["poracode-invalid-subcommand"], {
        input: "x".repeat(1024 * 1024),
      }),
    ).rejects.toThrow(/git command/i);
  });
});
