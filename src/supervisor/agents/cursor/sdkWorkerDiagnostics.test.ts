import { describe, expect, it, vi } from "vitest";
import { CursorSdkWorkerDiagnostics, WorkerDiagnosticError } from "./sdkWorkerDiagnostics";

const loadCursorSdkMock = vi.hoisted(() => vi.fn<typeof import("./sdkLoader").loadCursorSdk>());

vi.mock("./sdkLoader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./sdkLoader")>();
  return { ...actual, loadCursorSdk: loadCursorSdkMock };
});

import { CursorSdkWorkerRuntime } from "./sdkWorkerRuntime";

describe("Cursor SDK worker diagnostics", () => {
  it("redacts credential-shaped MCP configuration without corrupting ordinary values", () => {
    const diagnostics = new CursorSdkWorkerDiagnostics();
    diagnostics.rememberMcpSecrets({
      stdio: {
        command: "fixture",
        args: [
          "--mode",
          "stdio",
          "--api-key",
          "argument-api-key",
          "--client-secret=argument-client-secret",
          "-H",
          "Content-Type: application/json",
          "-H",
          "Authorization: Bearer argument-authorization-token",
        ],
        env: {
          MODE: "test",
          DEBUG: "1",
          MCP_PRIVATE_ENV: "private-env-value",
          SERVICE_API_KEY: "api-key-value",
          accessToken: "camel-access-token",
          clientSecret: "camel-client-secret",
          DATABASE_URL:
            "postgres://ordinary-user:db%20password@db.example.test/app?sslmode=require",
          SENTRY_DSN: "https://dsn-public-token@errors.example.test/42",
          SERVICE_URL: "https://service.example.test/path?mode=test&apiKey=query%2Fcredential",
        },
      },
      http: {
        type: "http",
        url: "https://remote-user:remote%20password@example.test/mcp?accessToken=remote%2Ftoken",
        headers: {
          "Content-Type": "application/json",
          "X-Test": "yes",
          Authorization: "Bearer authorization-token",
          "X-API-Key": "header-api-key",
        },
        auth: {
          CLIENT_ID: "public-client-id",
          CLIENT_SECRET: "oauth-client-secret",
        },
      },
    });

    const sanitized = diagnostics.sanitizePayload({
      id: "run-1-test",
      text: [
        "mode=test",
        "debug=1",
        "content=application/json",
        "header=yes",
        "argument-mode=stdio",
        "argument-api-key",
        "argument-client-secret",
        "Content-Type: application/json",
        "Bearer argument-authorization-token",
        "argument-authorization-token",
        "private-env-value",
        "api-key-value",
        "camel-access-token",
        "camel-client-secret",
        "ordinary-user",
        "db%20password",
        "db password",
        "dsn-public-token",
        "query%2Fcredential",
        "query/credential",
        "remote-user",
        "remote%20password",
        "remote password",
        "remote%2Ftoken",
        "remote/token",
        "Bearer authorization-token",
        "authorization-token",
        "header-api-key",
        "oauth-client-secret",
      ].join(" / "),
    });

    expect(sanitized.id).toBe("run-1-test");
    expect(sanitized.text).toContain(
      "mode=test / debug=1 / content=application/json / header=yes / argument-mode=stdio",
    );
    expect(sanitized.text).toContain("Content-Type: application/json");
    expect(sanitized.text).not.toMatch(
      /argument-api-key|argument-client-secret|argument-authorization-token|private-env-value|api-key-value|authorization-token|header-api-key|oauth-client-secret/u,
    );
    expect(sanitized.text).not.toMatch(
      /camel-access-token|camel-client-secret|ordinary-user|db(?:%20| )password|dsn-public-token|query(?:%2F|\/)credential/u,
    );
    expect(sanitized.text).not.toMatch(
      /remote-user|remote(?:%20| )password|remote(?:%2F|\/)token/u,
    );
    expect(sanitized.text.match(/\[REDACTED\]/gu)).toHaveLength(23);
  });

  it("attaches resolved SDK metadata to serialized post-discovery errors", () => {
    const diagnostics = new CursorSdkWorkerDiagnostics();
    const resolved = {
      sdkVersion: "1.4.2",
      source: "global-npm" as const,
      packageRoot: "/opt/homebrew/lib/node_modules/@cursor/sdk",
    };

    const fromDiagnostic = diagnostics.serializeError(
      new WorkerDiagnosticError("auth_missing", "Cursor API key required", resolved),
    );
    expect(fromDiagnostic).toMatchObject({
      code: "auth_missing",
      sdk: resolved,
    });

    const fromCatalogError = diagnostics.serializeError(
      Object.assign(new Error("Unauthorized"), { name: "AuthenticationError", status: 401 }),
      resolved,
    );
    expect(fromCatalogError).toMatchObject({
      code: "auth_invalid",
      sdk: resolved,
    });
  });

  it("forwards discovery.pinFallbackOnly and preserves resolved SDK metadata on auth_missing", async () => {
    loadCursorSdkMock.mockReset().mockResolvedValue({
      ok: false,
      diagnostic: {
        code: "auth_missing",
        message: "Cursor API key required",
        recoverable: true,
        details: {
          environmentVariable: "CURSOR_API_KEY",
          packageRoot: "/opt/homebrew/lib/node_modules/@cursor/sdk",
          sdkVersion: "1.4.2",
          source: "global-npm",
        },
      },
    });
    const runtime = new CursorSdkWorkerRuntime();

    await expect(
      runtime.load(
        {
          pinnedRoot: {
            packageRoot: "/Users/me/.local/share/fnm/node_modules/@cursor/sdk",
            source: "global-npm",
          },
          pinFallbackOnly: true,
        },
        "/workspace",
      ),
    ).rejects.toMatchObject({
      code: "auth_missing",
      sdk: {
        sdkVersion: "1.4.2",
        source: "global-npm",
        packageRoot: "/opt/homebrew/lib/node_modules/@cursor/sdk",
      },
    });

    expect(loadCursorSdkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pinnedRoot: {
          packageRoot: "/Users/me/.local/share/fnm/node_modules/@cursor/sdk",
          source: "global-npm",
        },
        pinFallbackOnly: true,
      }),
      expect.objectContaining({ importModule: expect.any(Function) }),
    );
    expect(runtime.resolvedMetadata).toEqual({
      sdkVersion: "1.4.2",
      source: "global-npm",
      packageRoot: "/opt/homebrew/lib/node_modules/@cursor/sdk",
    });
  });
});
