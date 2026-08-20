import { describe, expect, it } from "vitest";
import {
  buildKimiProbeCapabilities,
  hasKimiCredential,
  hasKimiOAuthCredential,
  kimiDefaultCapabilities,
  kimiDetectionSpec,
  kimiTerminalAuthMethod,
  normalizeKimiProbeEfforts,
} from "./detection";

describe("hasKimiCredential", () => {
  it("detects a non-empty api_key under [providers.*]", () => {
    const toml = ["[providers.moonshot]", 'api_key = "sk-real-value"'].join("\n");
    expect(hasKimiCredential(toml)).toBe(true);
  });

  it("detects an oauth sub-table", () => {
    const toml = ["[providers.moonshot.oauth]", 'access_token = "tok-123"'].join("\n");
    expect(hasKimiCredential(toml)).toBe(true);
  });

  it("detects an inline oauth table with a value", () => {
    const toml = '[providers.moonshot]\noauth = { access_token = "tok-123" }';
    expect(hasKimiCredential(toml)).toBe(true);
  });

  it("does not treat a managed OAuth storage reference as a live credential", () => {
    const toml = [
      '[providers."managed:kimi-code"]',
      'api_key = "oauth-placeholder"',
      '[providers."managed:kimi-code".oauth]',
      'storage = "file"',
      'key = "kimi-code"',
    ].join("\n");
    expect(hasKimiCredential(toml)).toBe(false);
  });

  it("returns false for a config with no credentials", () => {
    const toml = ["[settings]", 'theme = "dark"', "", "[providers.moonshot]"].join("\n");
    expect(hasKimiCredential(toml)).toBe(false);
  });

  it("returns false for an empty api_key", () => {
    expect(hasKimiCredential('[providers.moonshot]\napi_key = ""')).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(hasKimiCredential("")).toBe(false);
  });
});

describe("hasKimiOAuthCredential", () => {
  it("detects Kimi's persisted OAuth token", () => {
    expect(hasKimiOAuthCredential('{"access_token":"tok-123"}')).toBe(true);
  });

  it("rejects missing or malformed token data", () => {
    expect(hasKimiOAuthCredential("{}")).toBe(false);
    expect(hasKimiOAuthCredential("not-json")).toBe(false);
  });
});

describe("kimiDetectionSpec", () => {
  it("builds login commands from the detected executable path", () => {
    expect(kimiDetectionSpec.kind).toBe("kimi");
    expect(kimiDetectionSpec.label).toBe("Kimi Code");
    expect(kimiDetectionSpec.binary).toBe("kimi");
    expect(typeof kimiDetectionSpec.loginCommand).toBe("function");
    if (typeof kimiDetectionSpec.loginCommand !== "function") return;
    expect(
      kimiDetectionSpec.loginCommand({
        location: { kind: "windows", path: "C:\\repo" },
        executablePath: "C:\\Users\\demo\\.kimi-code\\bin\\kimi.exe",
      }),
    ).toBe("& 'C:\\Users\\demo\\.kimi-code\\bin\\kimi.exe' acp --login");
    expect(
      kimiDetectionSpec.loginCommand({
        location: {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/demo/repo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\repo",
        },
        executablePath: "/home/demo/.kimi-code/bin/kimi",
      }),
    ).toBe("'/home/demo/.kimi-code/bin/kimi' acp --login");
  });

  it("ships a non-interactive installer update and the npm version probe", () => {
    // `kimi upgrade` is an interactive TUI, so there is no `builtIn` updater.
    expect(kimiDetectionSpec.update?.builtIn).toBeUndefined();
    expect(kimiDetectionSpec.update?.npm).toBe("@moonshot-ai/kimi-code");
    expect(kimiDetectionSpec.update?.installer).toEqual({
      posix: {
        binary: "sh",
        args: ["-c", "curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash"],
      },
      windows: {
        binary: "powershell.exe",
        args: [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "irm https://code.kimi.com/kimi-code/install.ps1 | iex",
        ],
      },
    });
  });

  it("reports credential state through the capabilities probe", () => {
    expect(kimiDetectionSpec.authProbes).toBeUndefined();
    expect(typeof kimiDetectionSpec.capabilitiesProbe).toBe("function");
  });
});

describe("kimiDefaultCapabilities", () => {
  it("advertises manual/auto/yolo approval policies with a yolo bypass posture", () => {
    expect(kimiDefaultCapabilities.approvalPolicies?.map((p) => p.id)).toEqual([
      "default",
      "auto",
      "yolo",
    ]);
    expect(kimiDefaultCapabilities.bypassPermissions).toEqual({ approvalPolicy: "yolo" });
    expect(kimiDefaultCapabilities.defaultApprovalPolicy).toBe("auto");
  });

  it("supports both terminal and GUI presentation", () => {
    expect(kimiDefaultCapabilities.presentationModes).toEqual(["terminal", "gui"]);
    expect(kimiDefaultCapabilities.modes).toEqual(["agent", "plan"]);
  });
});

describe("normalizeKimiProbeEfforts", () => {
  it("returns nothing without a probe", () => {
    expect(normalizeKimiProbeEfforts(undefined)).toEqual({});
  });

  // K2.7 offers thinking as a state, not a ladder. Keeping the single `on`
  // (rather than reporting no levels) is what lets Poracode put the session back
  // into that state — Kimi otherwise keeps the previous model's tier across a
  // model switch. The composer draws no picker for a one-option list.
  it("keeps the untiered `on` as an untiered model's only level", () => {
    expect(normalizeKimiProbeEfforts({ efforts: ["on"], defaultEffort: "on" })).toEqual({
      efforts: ["on"],
      defaultEffort: "on",
    });
  });

  // Kimi's own picker shows K2.7 as `On` / `Off (Unsupported)`; `off` is not a
  // level the model can actually run at.
  it("reduces an on/off thinking switch to `on`", () => {
    expect(
      normalizeKimiProbeEfforts({ modelEfforts: { "kimi-for-coding": ["on", "off"] } }),
    ).toEqual({ modelEfforts: { "kimi-for-coding": ["on"] } });
  });

  it("keeps multi-value effort tiers with their default", () => {
    expect(
      normalizeKimiProbeEfforts({
        efforts: ["low", "medium", "high"],
        defaultEffort: "medium",
      }),
    ).toEqual({ efforts: ["low", "medium", "high"], defaultEffort: "medium" });
  });

  it("drops the untiered `on` from a real tier ladder", () => {
    expect(
      normalizeKimiProbeEfforts({ efforts: ["low", "high", "max", "on"], defaultEffort: "on" }),
    ).toEqual({
      efforts: ["low", "high", "max"],
      // `on` is not a tier, so the probed default cannot stand — prefer `high`.
      defaultEffort: "high",
    });
  });

  it("resolves each model's default against its own levels", () => {
    expect(
      normalizeKimiProbeEfforts({
        modelEfforts: {
          "kimi-for-coding": ["on"],
          k3: ["low", "medium", "high"],
        },
        modelDefaultEfforts: { "kimi-for-coding": "on", k3: "on", orphan: "on" },
      }),
    ).toEqual({
      modelEfforts: { "kimi-for-coding": ["on"], k3: ["low", "medium", "high"] },
      // K2.7 keeps `on`; K3's untiered default becomes `high`; a model with
      // neither its own levels nor a global list gets nothing.
      modelDefaultEfforts: { "kimi-for-coding": "on", k3: "high" },
    });
  });

  it("keeps a probed model default that is valid for its levels", () => {
    expect(
      normalizeKimiProbeEfforts({
        modelEfforts: { k3: ["low", "high"] },
        modelDefaultEfforts: { k3: "low" },
      }),
    ).toEqual({
      modelEfforts: { k3: ["low", "high"] },
      modelDefaultEfforts: { k3: "low" },
    });
  });

  // Probed from kimi 0.33.0 with the CLI's persisted model on K2.7: the baseline
  // is `["on"]` and only the K3 models carry their own list.
  it("normalizes the real Kimi 0.33 payload probed from K2.7", () => {
    expect(
      normalizeKimiProbeEfforts({
        efforts: ["on"],
        defaultEffort: "on",
        modelEfforts: {
          "kimi-code/k3": ["low", "high", "max", "on"],
          "kimi-code/k3-256k": ["low", "high", "max", "on"],
        },
        modelDefaultEfforts: {
          "kimi-code/kimi-for-coding": "on",
          "kimi-code/kimi-for-coding-highspeed": "on",
          "kimi-code/k3": "on",
          "kimi-code/k3-256k": "on",
        },
      }),
    ).toEqual({
      // The K2.7 models have no list of their own and inherit this one.
      efforts: ["on"],
      defaultEffort: "on",
      modelEfforts: {
        "kimi-code/k3": ["low", "high", "max"],
        "kimi-code/k3-256k": ["low", "high", "max"],
      },
      modelDefaultEfforts: {
        "kimi-code/kimi-for-coding": "on",
        "kimi-code/kimi-for-coding-highspeed": "on",
        "kimi-code/k3": "high",
        "kimi-code/k3-256k": "high",
      },
    });
  });

  // `session/new` starts on whichever model the Kimi CLI last persisted, so the
  // baseline can just as easily be K3's ladder. K2.7 must not inherit it.
  it("normalizes the same payload probed from a K3 model", () => {
    expect(
      normalizeKimiProbeEfforts({
        efforts: ["low", "high", "max", "on"],
        defaultEffort: "on",
        modelEfforts: {
          "kimi-code/kimi-for-coding": ["on"],
          "kimi-code/kimi-for-coding-highspeed": ["on"],
        },
        modelDefaultEfforts: {
          "kimi-code/kimi-for-coding": "on",
          "kimi-code/kimi-for-coding-highspeed": "on",
          "kimi-code/k3": "on",
          "kimi-code/k3-256k": "on",
        },
      }),
    ).toEqual({
      efforts: ["low", "high", "max"],
      defaultEffort: "high",
      modelEfforts: {
        "kimi-code/kimi-for-coding": ["on"],
        "kimi-code/kimi-for-coding-highspeed": ["on"],
      },
      modelDefaultEfforts: {
        "kimi-code/kimi-for-coding": "on",
        "kimi-code/kimi-for-coding-highspeed": "on",
        "kimi-code/k3": "high",
        "kimi-code/k3-256k": "high",
      },
    });
  });
});

describe("buildKimiProbeCapabilities", () => {
  const noCredentials = { hasAnyCredential: false, hasManagedOAuthCredential: false };

  it("passes models through from the probe", () => {
    const models = [{ id: "k3", label: "Kimi for Coding" }];
    expect(buildKimiProbeCapabilities({ models }, noCredentials).models).toEqual(models);
    expect(buildKimiProbeCapabilities(undefined, noCredentials).models).toBeUndefined();
  });

  it("preserves ACP thinking model capabilities", () => {
    expect(
      buildKimiProbeCapabilities({ thinkingModels: ["kimi-for-coding"] }, noCredentials)
        .thinkingModels,
    ).toEqual(["kimi-for-coding"]);
  });

  it("advertises the static terminal login method and prefers it", () => {
    const caps = buildKimiProbeCapabilities(undefined, noCredentials);
    expect(caps.authMethods).toEqual([kimiTerminalAuthMethod]);
    expect(caps.authMethods?.[0]?.id).toBe("kimi-terminal-login");
    expect(caps.preferTerminalLogin).toBe(true);
  });

  it("prefers the probe's authState over the credential fallback", () => {
    expect(
      buildKimiProbeCapabilities(
        { authState: "missing" },
        { hasAnyCredential: true, hasManagedOAuthCredential: false },
      ).authState,
    ).toBe("missing");
    expect(
      buildKimiProbeCapabilities({ authState: "authenticated" }, noCredentials).authState,
    ).toBe("authenticated");
  });

  it("falls back to credential files when the probe could not decide", () => {
    expect(
      buildKimiProbeCapabilities(undefined, {
        hasAnyCredential: true,
        hasManagedOAuthCredential: false,
      }).authState,
    ).toBe("authenticated");
    expect(buildKimiProbeCapabilities(undefined, noCredentials).authState).toBe("missing");
    expect(buildKimiProbeCapabilities({}, noCredentials).authState).toBe("missing");
  });

  it("reports logout support from the probe or a managed OAuth credential", () => {
    expect(
      buildKimiProbeCapabilities({ authLogoutSupported: true }, noCredentials).authLogoutSupported,
    ).toBe(true);
    expect(
      buildKimiProbeCapabilities(undefined, {
        hasAnyCredential: false,
        hasManagedOAuthCredential: true,
      }).authLogoutSupported,
    ).toBe(true);
    expect(
      buildKimiProbeCapabilities(undefined, noCredentials).authLogoutSupported,
    ).toBeUndefined();
  });
});
