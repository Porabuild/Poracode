import type { ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import {
  HOST_RESOURCE_BUSY_CODE,
  HOST_RESOURCE_POLICY_UNAVAILABLE_CODE,
  HostResourceAdmissionRefusalError,
} from "@/shared/hostResourceAdmission";
import { RemoteHttpError } from "../auth";
import { writeError } from "./httpResponses";

/**
 * The single HTTP mapping for typed host-resource-admission refusals: both
 * refusal codes become a definite 429, and only `host_resource_busy` carries
 * the `Retry-After` hint. The JSON body stays the canonical remote error shape,
 * so every existing client parses exactly what it did.
 */

class FakeResponse {
  statusCode = 200;
  readonly headers = new Map<string, string>();
  private readonly chunks: string[] = [];

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  appendHeader(name: string, value: string): void {
    this.setHeader(name, value);
  }

  end(body?: string | Buffer): void {
    if (body !== undefined) this.chunks.push(body.toString());
  }

  get json(): { error: { code: string; message: string } } {
    return JSON.parse(this.chunks.join("")) as { error: { code: string; message: string } };
  }
}

function write(error: unknown) {
  const res = new FakeResponse();
  writeError(res as unknown as ServerResponse, error);
  return { status: res.statusCode, headers: res.headers, body: res.json };
}

describe("writeError host-resource-admission mapping", () => {
  it("maps a busy refusal to a definite 429 with the retry hint", () => {
    const result = write(
      new HostResourceAdmissionRefusalError("Host terminal-shell capacity is full.", {
        code: HOST_RESOURCE_BUSY_CODE,
        retryAfterMs: 1_500,
      }),
    );
    expect(result.status).toBe(429);
    expect(result.headers.get("retry-after")).toBe("2");
    expect(result.body.error).toEqual({
      code: HOST_RESOURCE_BUSY_CODE,
      message: "Host terminal-shell capacity is full.",
    });
  });

  it("maps an unavailable policy to 429 without promising a retry", () => {
    const result = write(
      new HostResourceAdmissionRefusalError(
        "Host resource admission policy is unavailable; new counted starts are refused.",
        { code: HOST_RESOURCE_POLICY_UNAVAILABLE_CODE },
      ),
    );
    expect(result.status).toBe(429);
    expect(result.headers.has("retry-after")).toBe(false);
    expect(result.body.error.code).toBe(HOST_RESOURCE_POLICY_UNAVAILABLE_CODE);
  });

  it("never maps an unrelated error carrying a code property", () => {
    const result = write(Object.assign(new Error("handoff unconfirmed"), { code: "other_code" }));
    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe("internal_error");
  });

  it("leaves the existing RemoteHttpError behavior intact", () => {
    const uncertain = write(
      new RemoteHttpError(
        "command_outcome_uncertain",
        "Remote command outcome is uncertain and was not repeated.",
        409,
      ),
    );
    expect(uncertain.status).toBe(409);
    expect(uncertain.headers.has("retry-after")).toBe(false);

    const overloaded = write(new RemoteHttpError("principal_busy", "Too much work.", 429, 2_500));
    expect(overloaded.status).toBe(429);
    expect(overloaded.headers.get("retry-after")).toBe("3");
  });
});
