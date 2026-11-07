import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  authenticateAcpAgent,
  probeAcpCapabilities,
  withAcpAuthenticationOwnership,
} from "./probe";

const fixture = fileURLToPath(new URL("./fixtures/fake-acp-agent.mjs", import.meta.url));

describe("owned ACP authentication retirement", () => {
  it.each([false, true])(
    "joins the real fixture process and pipes after cancellation: %s",
    async (cancelled) => {
      const root = mkdtempSync(join(tmpdir(), "poracode-acp-auth-"));
      const marker = join(root, "authenticate.pid");
      const controller = new AbortController();
      const reason = new Error("Fixture authentication cancelled");
      let closed = false;
      const pending = authenticateAcpAgent(process.execPath, [fixture], "fixture-approval", {
        signal: controller.signal,
        processCwd: root,
        env: {
          FAKE_AUTH_METHOD: "fixture-approval",
          FAKE_AUTH_MARKER: marker,
          FAKE_HANG_AUTH: cancelled ? "1" : "0",
          FAKE_SELF_DESTRUCT_MS: "20000",
        },
        onProcess: (process) => {
          void process.closed.then(() => {
            closed = true;
          });
        },
      });
      const result = pending.then(
        () => undefined,
        (error: unknown) => error,
      );
      try {
        await vi.waitFor(() => expect(existsSync(marker)).toBe(true), { timeout: 5000 });
        if (cancelled) controller.abort(reason);
        expect(await result).toBe(cancelled ? reason : undefined);
        expect(closed).toBe(true);
        const pid = Number(readFileSync(marker, "utf8"));
        expect(() => process.kill(pid, 0)).toThrow("ESRCH");
      } finally {
        controller.abort(reason);
        await result;
        rmSync(root, { recursive: true, force: true });
      }
    },
    15000,
  );

  it("refuses pre-cancelled authentication before creating any provider process", async () => {
    const controller = new AbortController();
    controller.abort(new Error("Fixture pre-cancelled"));
    const started = vi.fn<() => void>();
    await expect(
      authenticateAcpAgent(process.execPath, [fixture], "fixture-approval", {
        signal: controller.signal,
        onProcess: started,
      }),
    ).rejects.toThrow("pre-cancelled");
    expect(started).not.toHaveBeenCalled();
  });

  it("includes a held post-login verification probe in the same cancellation and pipe-close join", async () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-acp-auth-verify-"));
    const marker = join(root, "verify.pid");
    const controller = new AbortController();
    let started = 0;
    let closed = 0;
    const pending = withAcpAuthenticationOwnership(
      {
        signal: controller.signal,
        onProcess: (process) => {
          started++;
          void process.closed.then(() => {
            closed++;
          });
        },
      },
      () =>
        probeAcpCapabilities(process.execPath, [fixture], root, {
          processCwd: root,
          env: {
            FAKE_AUTH_METHOD: "fixture-approval",
            FAKE_AUTH_MARKER: marker,
            FAKE_HANG_AUTH: "1",
            FAKE_SELF_DESTRUCT_MS: "20000",
          },
          authenticateMethodIds: ["fixture-approval"],
        }),
    );
    try {
      await vi.waitFor(() => expect(existsSync(marker)).toBe(true), { timeout: 5000 });
      controller.abort();
      await pending;
      expect(started).toBe(1);
      expect(closed).toBe(1);
      expect(() => process.kill(Number(readFileSync(marker, "utf8")), 0)).toThrow("ESRCH");
    } finally {
      controller.abort();
      await pending;
      rmSync(root, { recursive: true, force: true });
    }
  }, 15000);
});
