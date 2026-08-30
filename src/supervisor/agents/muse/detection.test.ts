import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import {
  MUSE_DEFAULT_MODEL_ID,
  museAuthJsonIsAuthenticated,
  museDefaultCapabilities,
  museDetectionSpec,
  museHasStoredCredentials,
} from "./detection";

describe("museAuthJsonIsAuthenticated", () => {
  it("returns true when providers is a non-empty object", () => {
    expect(
      museAuthJsonIsAuthenticated(
        JSON.stringify({ schema_version: 1, providers: { meta: { api_key: "secret" } } }),
      ),
    ).toBe(true);
  });

  it("returns false when providers is empty or missing", () => {
    expect(museAuthJsonIsAuthenticated(JSON.stringify({ schema_version: 1, providers: {} }))).toBe(
      false,
    );
    expect(museAuthJsonIsAuthenticated(JSON.stringify({ schema_version: 1 }))).toBe(false);
    expect(museAuthJsonIsAuthenticated(undefined)).toBe(false);
    expect(museAuthJsonIsAuthenticated("")).toBe(false);
    expect(museAuthJsonIsAuthenticated("not-json")).toBe(false);
  });

  it("never depends on config-dir existence alone", () => {
    // An empty providers map is the never-signed-in shape after first run.
    expect(museAuthJsonIsAuthenticated('{"schema_version":1,"providers":{}}')).toBe(false);
  });
});

describe("museHasStoredCredentials (temp dir, never touches ~/.config/muse)", () => {
  let configRoot: string;
  let previousXdg: string | undefined;
  let previousAuthPath: string | undefined;
  const location = { kind: "posix", path: "/tmp/muse-proj" } as ProjectLocation;

  beforeEach(() => {
    configRoot = mkdtempSync(join(tmpdir(), "muse-config-"));
    previousXdg = process.env["XDG_CONFIG_HOME"];
    previousAuthPath = process.env["MUSE_AUTH_PATH"];
    delete process.env["MUSE_AUTH_PATH"];
    process.env["XDG_CONFIG_HOME"] = configRoot;
  });

  afterEach(() => {
    if (previousXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
    else process.env["XDG_CONFIG_HOME"] = previousXdg;
    if (previousAuthPath === undefined) delete process.env["MUSE_AUTH_PATH"];
    else process.env["MUSE_AUTH_PATH"] = previousAuthPath;
    rmSync(configRoot, { recursive: true, force: true });
  });

  it("reports missing when auth.json is absent", () => {
    expect(museHasStoredCredentials(location)).toBe(false);
  });

  it("reports missing when providers is empty", () => {
    mkdirSync(join(configRoot, "muse"), { recursive: true });
    writeFileSync(
      join(configRoot, "muse", "auth.json"),
      JSON.stringify({ schema_version: 1, providers: {} }),
    );
    expect(museHasStoredCredentials(location)).toBe(false);
  });

  it("reports authenticated when providers has an entry (key names only)", () => {
    mkdirSync(join(configRoot, "muse"), { recursive: true });
    writeFileSync(
      join(configRoot, "muse", "auth.json"),
      JSON.stringify({
        schema_version: 1,
        providers: { meta: { obtained_via: "login" } },
      }),
    );
    expect(museHasStoredCredentials(location)).toBe(true);
  });

  it("honors the launcher's MUSE_AUTH_PATH override", () => {
    const authPath = join(configRoot, "custom", "credentials.json");
    mkdirSync(join(configRoot, "custom"), { recursive: true });
    writeFileSync(authPath, JSON.stringify({ schema_version: 1, providers: { meta: {} } }));
    process.env["MUSE_AUTH_PATH"] = authPath;

    expect(museHasStoredCredentials(location)).toBe(true);
  });
});

describe("museDetectionSpec", () => {
  it("declares identity, login, and version probe", () => {
    expect(museDetectionSpec.kind).toBe("muse");
    expect(museDetectionSpec.label).toBe("Muse Code");
    expect(museDetectionSpec.binary).toBe("muse");
    expect(museDetectionSpec.loginCommand).toBe("muse login");
    expect(museDetectionSpec.versionArgs).toEqual(["--version"]);
    expect(museDetectionSpec.baseSpawnEnv).toEqual({ MUSE_NO_AUTO_UPDATE: "1" });
  });

  it("ships installer-only update (no npm, no builtIn)", () => {
    expect(museDetectionSpec.update?.npm).toBeUndefined();
    expect(museDetectionSpec.update?.builtIn).toBeUndefined();
    expect(museDetectionSpec.update?.installer?.posix).toEqual({
      binary: "sh",
      args: ["-c", "curl -fsSL https://dev.meta.ai/install.sh | sh"],
    });
    expect(museDetectionSpec.update?.installer?.windows?.binary).toBe("powershell.exe");
  });

  it("advertises a terminal login method via capabilitiesProbe", async () => {
    expect(typeof museDetectionSpec.capabilitiesProbe).toBe("function");
    const result = await museDetectionSpec.capabilitiesProbe?.({
      location: { kind: "posix", path: "/tmp" },
      executablePath: "/usr/bin/muse",
    });
    expect(result?.authMethods).toEqual([
      { id: "muse-terminal-login", name: "Login", type: "terminal" },
    ]);
    expect(
      await museDetectionSpec.capabilitiesProbe?.({
        location: { kind: "posix", path: "/tmp" },
        executablePath: undefined,
      }),
    ).toBeUndefined();
  });

  it("registers auth probes for META_API_KEY and stored credentials", () => {
    expect(museDetectionSpec.authProbes).toHaveLength(2);
  });
});

describe("museDefaultCapabilities", () => {
  it("lists the static Muse models with 1.2 as default-first", () => {
    expect(museDefaultCapabilities.models[0]?.id).toBe(MUSE_DEFAULT_MODEL_ID);
    expect(museDefaultCapabilities.models.map((m) => m.id)).toEqual([
      "muse-spark-1.2",
      "muse-spark-1.2-contributor",
      "muse-spark-1.1",
    ]);
  });

  it("declares the full effort ladder with default high", () => {
    expect(museDefaultCapabilities.efforts).toEqual([
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "ultra",
    ]);
    expect(museDefaultCapabilities.defaultEffort).toBe("high");
  });

  it("maps approval policies and a yolo bypass posture", () => {
    expect(museDefaultCapabilities.approvalPolicies.map((p) => p.id)).toEqual([
      "untrusted",
      "on-request",
      "never",
      "yolo",
    ]);
    expect(museDefaultCapabilities.defaultApprovalPolicy).toBe("on-request");
    expect(museDefaultCapabilities.bypassPermissions).toEqual({ approvalPolicy: "yolo" });
  });

  it("advertises terminal-only with resume, direct input, and exec one-shots", () => {
    expect(museDefaultCapabilities.presentationModes).toEqual(["terminal"]);
    expect(museDefaultCapabilities.presentationMode).toBe("terminal");
    expect(museDefaultCapabilities.liveInputMode).toBe("terminal");
    expect(museDefaultCapabilities.supportsResume).toBe(true);
    expect(museDefaultCapabilities.supportsDirectInput).toBe(true);
    expect(museDefaultCapabilities.supportsOneShot).toBe(true);
    expect(museDefaultCapabilities.modes).toEqual(["agent"]);
  });
});
