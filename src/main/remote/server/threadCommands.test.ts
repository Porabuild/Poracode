import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { FILE_SAVE_CONFLICT_MESSAGE } from "@/shared/fileSaveErrors";
import type { RemoteServerContext } from "./context";
import { writeError } from "./httpResponses";
import { runRemoteProcedure } from "./threadCommands";
import { RemoteHttpError } from "../auth";

// writeProjectFile passes the experiment-ownership gate before reaching the
// supervisor; give it a readable (experiment-free) durable state.
vi.mock("../../db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  dbGetState: vi.fn<() => string | null>(() => null),
}));

const LOCATION = { kind: "posix", path: "/repo" } as const;

function jsonBodyRequest(payload: unknown): IncomingMessage {
  return Readable.from([Buffer.from(JSON.stringify(payload))]) as unknown as IncomingMessage;
}

/** A body that fails on first read, so any body parse before auth would surface. */
function poisonedBodyRequest(): IncomingMessage {
  return (async function* body() {
    yield Buffer.from(JSON.stringify({ procedure: "listProjectTree", payload: {} }));
    throw new Error("body read before authentication");
  })() as unknown as IncomingMessage;
}

function createContext(
  callSupervisor: RemoteServerContext["options"]["callSupervisor"],
  requireBearer: RemoteServerContext["security"]["requireBearer"] = () => "token",
): RemoteServerContext {
  return {
    options: { callSupervisor } as RemoteServerContext["options"],
    security: { requireBearer },
  } as RemoteServerContext;
}

function writeConflictError(): Error {
  return new Error(FILE_SAVE_CONFLICT_MESSAGE);
}

describe("runRemoteProcedure file-save conflict mapping", () => {
  it("maps a writeProjectFile conflict to an actionable 409", async () => {
    const ctx = createContext(vi.fn().mockRejectedValue(writeConflictError()));
    await expect(
      runRemoteProcedure(
        ctx,
        jsonBodyRequest({
          procedure: "writeProjectFile",
          payload: {
            projectLocation: LOCATION,
            path: "README.md",
            content: "x",
            baseModifiedAtMs: 5,
          },
        }),
      ),
    ).rejects.toMatchObject({
      code: "file_save_conflict",
      status: 409,
      message: FILE_SAVE_CONFLICT_MESSAGE,
    });
  });

  it("maps a writeExternalFile conflict to an actionable 409", async () => {
    const ctx = createContext(vi.fn().mockRejectedValue(writeConflictError()));
    await expect(
      runRemoteProcedure(
        ctx,
        jsonBodyRequest({
          procedure: "writeExternalFile",
          payload: {
            projectLocation: LOCATION,
            absolutePath: "/notes.md",
            content: "x",
            baseModifiedAtMs: 5,
          },
        }),
      ),
    ).rejects.toMatchObject({
      code: "file_save_conflict",
      status: 409,
      message: FILE_SAVE_CONFLICT_MESSAGE,
    });
  });

  it("leaves successful writes untouched", async () => {
    const result = { modifiedAtMs: 123.5 };
    const scopes: string[][] = [];
    const ctx = createContext(vi.fn().mockResolvedValue(result), (_req, required) => {
      scopes.push([...required]);
      return "token";
    });
    await expect(
      runRemoteProcedure(
        ctx,
        jsonBodyRequest({
          procedure: "writeProjectFile",
          payload: {
            projectLocation: LOCATION,
            path: "README.md",
            content: "x",
            baseModifiedAtMs: 5,
          },
        }),
      ),
    ).resolves.toEqual(result);
    expect(scopes[1]).toEqual(["session:operate"]);
  });

  it("keeps unrelated procedures redacted even when the message matches", async () => {
    const internal = writeConflictError();
    const ctx = createContext(vi.fn().mockRejectedValue(internal));
    await expect(
      runRemoteProcedure(
        ctx,
        jsonBodyRequest({
          procedure: "readProjectFile",
          payload: { projectLocation: LOCATION, path: "README.md" },
        }),
      ),
    ).rejects.toSatisfy((error: unknown) => !(error instanceof RemoteHttpError));
  });

  it("keeps near-miss write failures redacted", async () => {
    const ctx = createContext(
      vi.fn().mockRejectedValue(new Error(`save failed: ${FILE_SAVE_CONFLICT_MESSAGE}`)),
    );
    await expect(
      runRemoteProcedure(
        ctx,
        jsonBodyRequest({
          procedure: "writeProjectFile",
          payload: {
            projectLocation: LOCATION,
            path: "README.md",
            content: "x",
            baseModifiedAtMs: 5,
          },
        }),
      ),
    ).rejects.toSatisfy((error: unknown) => !(error instanceof RemoteHttpError));
  });

  it("authenticates before reading the body", async () => {
    const ctx = createContext(vi.fn(), () => {
      throw new RemoteHttpError("missing_access_token", "Missing access token.", 401);
    });
    await expect(runRemoteProcedure(ctx, poisonedBodyRequest())).rejects.toMatchObject({
      code: "missing_access_token",
      status: 401,
    });
  });
});

function captureResponse(): { res: ServerResponse; bodies: string[]; statuses: number[] } {
  const bodies: string[] = [];
  const statuses: number[] = [];
  const res = {
    set statusCode(value: number) {
      statuses.push(value);
    },
    setHeader: () => undefined,
    end: (body?: string) => {
      bodies.push(body ?? "");
    },
  } as unknown as ServerResponse;
  return { res, bodies, statuses };
}

describe("writeError file-save conflict contract", () => {
  it("writes the conflict as 409 with the canonical message", () => {
    const { res, bodies, statuses } = captureResponse();
    writeError(res, new RemoteHttpError("file_save_conflict", FILE_SAVE_CONFLICT_MESSAGE, 409));
    expect(statuses).toEqual([409]);
    expect(JSON.parse(bodies[0]!)).toEqual({
      error: { code: "file_save_conflict", message: FILE_SAVE_CONFLICT_MESSAGE },
    });
  });

  it("redacts internal write failures as a generic 500", () => {
    const { res, bodies, statuses } = captureResponse();
    writeError(res, writeConflictError());
    expect(statuses).toEqual([500]);
    const body = JSON.parse(bodies[0]!) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("internal_error");
    expect(body.error.message).toBe("Internal server error.");
    expect(bodies[0]).not.toContain("changed on disk");
  });
});
