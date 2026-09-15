import { describe, expect, it } from "vitest";
import { buildDevinAcpArgs, buildDevinArgs, buildDevinOneShotArgs } from "./argv";
import { buildDevinProbeCapabilities, devinDetectionSpec } from "./detection";
import { parseDevinCredentials } from "./credentials";
import { createDevinAdapter } from "./index";
import { extractSemverFromVersionOutput } from "../base";

describe("Devin provider", () => {
  it("never starts ACP for terminal presentation", async () => {
    expect(
      await createDevinAdapter().createStructuredSession?.({
        threadId: "terminal-thread",
        projectLocation: { kind: "posix", path: "/project" },
        config: { model: "" },
        presentationMode: "terminal",
      }),
    ).toBeUndefined();
  });
  it("puts model selection after the ACP subcommand", () => {
    expect(buildDevinAcpArgs({ model: "swe", approvalPolicy: "smart" })).toEqual([
      "acp",
      "--model",
      "swe",
    ]);
  });
  it("passes the initial prompt as one positional argument with smart approvals", () => {
    expect(buildDevinArgs({ model: "swe-1-6-fast" }, "--help\n$(echo no)")).toEqual([
      "--respect-workspace-trust",
      "false",
      "--permission-mode",
      "smart",
      "--model",
      "swe-1-6-fast",
      "--",
      "--help\n$(echo no)",
    ]);
  });
  it("resumes an exact opaque session without dropping the prompt", () => {
    const adapter = createDevinAdapter();
    expect(
      adapter.buildResumeArgv({ kind: "posix", path: "/project" }, { model: "" }, "next", {
        providerSessionId: "heavy-basin",
        discoveredAt: "2026-09-10T00:00:00Z",
      }).args,
    ).toEqual([
      "--respect-workspace-trust",
      "false",
      "--permission-mode",
      "smart",
      "--resume",
      "heavy-basin",
      "--",
      "next",
    ]);
  });
  it("defers plan prompts and never launches them with bypass", () => {
    const config = { model: "", mode: "plan" as const, approvalPolicy: "bypass" };
    const adapter = createDevinAdapter();
    expect(buildDevinArgs(config, "plan this")).toEqual([
      "--respect-workspace-trust",
      "false",
      "--permission-mode",
      "normal",
    ]);
    expect(adapter.shouldDeferPromptToTerminal?.(config)).toBe(true);
    expect(adapter.buildTerminalPreInputs?.(config)).toEqual([["/plan", "@wait:200", "\r"]]);
  });
  it("keeps one-shots noninteractive and preserves prompts", () => {
    expect(buildDevinOneShotArgs(undefined, "title")).toEqual([
      "--permission-mode",
      "bypass",
      "--respect-workspace-trust",
      "false",
      "-p",
      "title",
    ]);
    const adapter = createDevinAdapter();
    expect(adapter.capabilities.supportsOneShot).toBe(true);
    expect(adapter.buildOneShotCommand?.("swe", undefined, "title")?.stdin).toBe("");
  });
  it("keeps login and logout available if ACP probing fails", () => {
    expect(buildDevinProbeCapabilities(undefined)).toMatchObject({
      authLogoutSupported: true,
      authMethods: [{ type: "terminal" }],
    });
    // Devin session/new succeeds even logged out; this signal is not auth proof.
    expect(buildDevinProbeCapabilities({ authState: "authenticated" })).not.toHaveProperty(
      "authState",
    );
    expect(devinDetectionSpec.update).toMatchObject({
      installer: { posix: { binary: "sh" } },
      homebrewCask: "devin-cli",
    });
  });
  it("parses the observed version without the build hash", () => {
    expect(extractSemverFromVersionOutput("devin 3000.10.21 (611c1cba)")).toBe("3000.10.21");
  });
  it.each(["", 'windsurf_api_key = ""', "invalid TOML", "windsurf_api_key = 42"])(
    "rejects empty or malformed credentials: %s",
    (content) => {
      expect(parseDevinCredentials(content)).toBeUndefined();
    },
  );
  it("reads the token and configured server without exposing unrelated data", () => {
    expect(
      parseDevinCredentials(
        'windsurf_api_key = "example"\napi_server_url = "https://server.codeium.com"',
      ),
    ).toEqual({ accessToken: "example", raw: { baseUrl: "https://server.codeium.com" } });
  });
});

it("delimits terminal pastes before submitting multiline input", () => {
  expect(createDevinAdapter().buildDirectInput?.("line one\nline two")).toEqual([
    "\x1b[200~",
    "line one\nline two",
    "\x1b[201~",
    "@wait:500",
    "\r",
  ]);
});
