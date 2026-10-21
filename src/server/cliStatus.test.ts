import { afterEach, describe, expect, it, vi } from "vitest";
import { hostServiceCapabilities } from "@/shared/hostControlProtocol";
import {
  requestHostStatusDetailsFromRunningServer,
  requestHostStatusFromRunningServer,
  type HostStatusDetailsResponse,
  type HostStatusResponse,
} from "./pairingControl";
import { parseStatusCliOptions, renderServerStatus, runServerStatus } from "./cliStatus";

vi.mock("./pairingControl", () => ({
  requestHostStatusDetailsFromRunningServer:
    vi.fn<typeof requestHostStatusDetailsFromRunningServer>(),
  requestHostStatusFromRunningServer: vi.fn<typeof requestHostStatusFromRunningServer>(),
}));

function fixture(): HostStatusDetailsResponse {
  return {
    requestId: "status-request",
    ownerGeneration: "selected-generation",
    description: {
      profileNamespace: "/fixture/profile",
      dataRoot: "/fixture/profile.host-v1",
      mode: "headless",
      state: "ready",
      endpoint: "https://fixture.test/old/",
      operations: ["describe", "issue-pairing"],
      capabilities: hostServiceCapabilities({ ssh: true }),
      remoteProtocolVersion: 12,
    },
    status: {
      profileNamespace: "/fixture/profile",
      dataRoot: "/fixture/profile.host-v1",
      mode: "headless",
      state: "ready",
      admission: "open",
      endpoint: "https://fixture.test/current/",
      build: {
        version: "2.0.0",
        root: "/fixture/runtime",
        layoutKind: "prefix",
        sourceRevision: "fixture-revision",
        entrypointSha256: "d".repeat(64),
      },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("server status CLI", () => {
  it("accepts only distinct status flags in either order", () => {
    expect(parseStatusCliOptions([])).toEqual({ json: false, details: false });
    for (const args of [
      ["--details", "--json"],
      ["--json", "--details"],
    ])
      expect(parseStatusCliOptions(args)).toEqual({ json: true, details: true });
    for (const args of [
      ["--json", "--json"],
      ["--details", "--details"],
      ["--start"],
      ["--details=true"],
    ])
      expect(() => parseStatusCliOptions(args)).toThrow("Usage:");
  });

  it("preserves the basic JSON shape and does not require the additive operation", async () => {
    const response = fixture();
    const basic: HostStatusResponse = {
      requestId: "describe-request",
      ownerGeneration: response.ownerGeneration,
      description: response.description,
    };
    vi.mocked(requestHostStatusFromRunningServer).mockResolvedValue(basic);
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runServerStatus("/selected/profile", { json: true, details: false });
    expect(output).toHaveBeenCalledExactlyOnceWith(`${JSON.stringify(basic)}\n`);
    expect(requestHostStatusFromRunningServer).toHaveBeenCalledExactlyOnceWith("/selected/profile");
    expect(requestHostStatusDetailsFromRunningServer).not.toHaveBeenCalled();
  });

  it("gives the detailed JSON view its own version and the latest authenticated status", async () => {
    const response = fixture();
    vi.mocked(requestHostStatusDetailsFromRunningServer).mockResolvedValue(response);
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runServerStatus("/selected/profile", { json: true, details: true });
    expect(JSON.parse(String(output.mock.calls[0]![0]))).toEqual({
      formatVersion: 1,
      view: "running-owner",
      requestId: response.requestId,
      ownerGeneration: response.ownerGeneration,
      status: response.status,
      capabilities: response.description.capabilities,
      remoteProtocolVersion: 12,
    });
    expect(requestHostStatusDetailsFromRunningServer).toHaveBeenCalledExactlyOnceWith(
      "/selected/profile",
    );
    expect(requestHostStatusFromRunningServer).not.toHaveBeenCalled();
  });

  it("does not turn an unsupported or changed owner into a successful basic fallback", async () => {
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    for (const message of ["unsupported owner", "owner generation changed"]) {
      vi.mocked(requestHostStatusDetailsFromRunningServer).mockRejectedValueOnce(
        new Error(message),
      );
      await expect(
        runServerStatus("/selected/profile", { json: true, details: true }),
      ).rejects.toThrow(message);
    }
    expect(output).not.toHaveBeenCalled();
    expect(requestHostStatusFromRunningServer).not.toHaveBeenCalled();
  });

  it("uses the current endpoint and escapes terminal control characters in reported identity", () => {
    const response = fixture();
    const text = renderServerStatus({
      ...response,
      status: {
        ...response.status,
        build: { ...response.status.build, version: "2.0\u001b[31m", root: "/runtime\nspoof" },
      },
    });
    expect(text).toContain("Endpoint (reported): https://fixture.test/current/");
    expect(text).not.toContain("https://fixture.test/old/");
    expect(text).toContain("Version: 2.0\\u001b[31m");
    expect(text).toContain("Running bundle: /runtime\\u000aspoof");
    expect(text).toContain("Entrypoint SHA256: " + "d".repeat(64));
    expect(text).not.toContain("\u001b");
  });

  it("explains draining, held admission and startup instead of inviting premature pairing", () => {
    const response = fixture();
    for (const [state, admission, guidance] of [
      ["stopping", "held", "owner is draining"],
      ["ready", "held", "Admission is held"],
      ["starting", "open", "owner is starting"],
    ] as const) {
      const text = renderServerStatus({
        ...response,
        status: { ...response.status, state, admission },
      });
      expect(text).toContain(guidance);
      expect(text).not.toContain("Use pair with");
    }
    expect(
      renderServerStatus({ ...response, status: { ...response.status, endpoint: null } }),
    ).toContain("not listening");
  });
});
