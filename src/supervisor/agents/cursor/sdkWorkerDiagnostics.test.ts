import { describe, expect, it } from "vitest";
import { CursorSdkWorkerDiagnostics } from "./sdkWorkerDiagnostics";

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
});
