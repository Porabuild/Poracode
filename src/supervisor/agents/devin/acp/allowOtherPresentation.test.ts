import { describe, expect, it } from "vitest";
import {
  CreateElicitationRequest as AcpCreateElicitationRequest,
  type CreateElicitationRequest,
} from "@agentclientprotocol/sdk";
import { normalizeAcpElicitationResponse } from "../../acp/sessionElicitation";
import { makeConfigSyncSession } from "../../acp/sessionTestFixture";
import { projectQualifiedAllowOtherPresentation } from "./allowOtherPresentation";

const CUSTOM = "Q17_OTHER_WIRE_7dcb321c";

function qualifiedRequest(): CreateElicitationRequest {
  return {
    sessionId: "clover-scabiosa",
    mode: "form",
    message: "Pick a color",
    requestedSchema: {
      type: "object",
      required: ["q0"],
      properties: {
        q0: {
          type: "string",
          title: "Color",
          oneOf: [
            { const: "Blue", title: "Blue" },
            { const: "Green", title: "Green" },
          ],
        },
      },
    },
    _meta: { "cognition.ai/allowOther": true },
  };
}

function property(request: CreateElicitationRequest, key: string): Record<string, unknown> {
  if (!AcpCreateElicitationRequest.isForm(request)) throw new Error("expected a form");
  const schema = request.requestedSchema.properties?.[key];
  return schema && typeof schema === "object" ? schema : {};
}

describe("projectQualifiedAllowOtherPresentation", () => {
  it("exposes a custom answer for the one qualified string choice and keeps the native reply", async () => {
    const request = qualifiedRequest();
    const presentation = projectQualifiedAllowOtherPresentation(request);

    expect(property(request, "q0").allowCustom).toBeUndefined();
    expect(property(presentation, "q0").allowCustom).toBe(true);
    expect(presentation).not.toBe(request);

    const reply = {
      action: "accept",
      content: { q0: CUSTOM },
      _meta: request._meta,
    };
    expect(normalizeAcpElicitationResponse(reply, request)).toEqual({
      action: "accept",
      content: { q0: CUSTOM },
      _meta: { "cognition.ai/allowOther": true },
    });

    const { listener, session } = makeConfigSyncSession({
      projectElicitationPresentation: projectQualifiedAllowOtherPresentation,
    });
    const pending = (
      session as unknown as {
        handleElicitationRequest: (params: CreateElicitationRequest) => Promise<unknown>;
      }
    ).handleElicitationRequest(request);
    const opened = listener.onRuntimeEvent.mock.calls
      .map(
        ([event]) =>
          event as {
            type?: string;
            requestId?: string;
            payload?: { details?: { acpElicitation?: CreateElicitationRequest } };
          },
      )
      .find((event) => event.type === "request.opened");
    expect(property(opened?.payload?.details?.acpElicitation ?? request, "q0").allowCustom).toBe(
      true,
    );
    expect(property(request, "q0").allowCustom).toBeUndefined();

    await session.resolveServerRequest(opened!.requestId!, reply);
    await expect(pending).resolves.toEqual({
      action: "accept",
      content: { q0: CUSTOM },
      _meta: { "cognition.ai/allowOther": true },
    });
  });

  it("leaves every other elicitation shape closed", () => {
    const absent = qualifiedRequest();
    delete (absent as { _meta?: unknown })._meta;
    expect(projectQualifiedAllowOtherPresentation(absent)).toBe(absent);

    const flaggedOff = qualifiedRequest();
    flaggedOff._meta = { "cognition.ai/allowOther": false };
    expect(projectQualifiedAllowOtherPresentation(flaggedOff)).toBe(flaggedOff);

    const multi = qualifiedRequest();
    if (!AcpCreateElicitationRequest.isForm(multi)) throw new Error("expected a form");
    multi.requestedSchema.properties = {
      ...multi.requestedSchema.properties,
      q1: { type: "string", title: "Other" },
    };
    expect(projectQualifiedAllowOtherPresentation(multi)).toBe(multi);

    const array = qualifiedRequest();
    if (!AcpCreateElicitationRequest.isForm(array)) throw new Error("expected a form");
    array.requestedSchema.properties = {
      tags: {
        type: "array",
        items: { enum: ["Blue"] },
      },
    };
    expect(projectQualifiedAllowOtherPresentation(array)).toBe(array);
  });
});
