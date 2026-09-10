import { describe, expect, it } from "vitest";
import { msg } from "@/shared/messages";
import { REMOTE_FOLLOW_UP_QUEUE_PROCEDURES } from "./procedures";
import { RemoteClientError, RemoteDesktopClient } from "./client";

function errorResponse(status: number, code: string): Response {
  return new Response(
    JSON.stringify({ error: { code, message: `server rejected the request (${code})` } }),
    { status, headers: { "content-type": "application/json" } },
  );
}

describe("remote queued follow-up transport", () => {
  it.each([
    [403, "git_procedure_not_allowed"],
    [404, "not_found"],
  ] as const)(
    "reports an explicit unsupported error for an older host (%s/%s)",
    async (status, code) => {
      const client = new RemoteDesktopClient(
        "https://desktop.example.test",
        "access-token",
        async () => errorResponse(status, code),
      );

      for (const procedure of REMOTE_FOLLOW_UP_QUEUE_PROCEDURES) {
        await expect(client.callRemoteProcedure(procedure, {})).rejects.toMatchObject({
          status: 501,
          code: "follow_up_queue_unsupported",
          message: msg("supervisor.followUpQueue.unsupported"),
        });
      }
    },
  );

  it("never rewrites a non-queue passthrough failure as a queue capability miss", async () => {
    const client = new RemoteDesktopClient(
      "https://desktop.example.test",
      "access-token",
      async () => errorResponse(403, "git_procedure_not_allowed"),
    );

    await expect(client.callRemoteProcedure("setPendingSteer", {})).rejects.toMatchObject({
      status: 403,
      code: "git_procedure_not_allowed",
    } satisfies Partial<RemoteClientError>);
  });
});
