import { describe, expect, it } from "vitest";
import type { AgentCapability, AgentStatus } from "@/shared/contracts";
import {
  authRowKey,
  statusForRuntimeVariant,
  statusHasAuthenticatedLogout,
  statusNeedsInteractiveLogin,
  unsignedInteractiveRuntimes,
} from "./authHelpers";

const capabilities: AgentCapability = {
  models: [{ id: "auto", label: "Auto" }],
  efforts: [],
  modelEfforts: {},
  modes: [],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  settingDefs: [],
};

function status(input: Partial<AgentStatus> = {}): AgentStatus {
  return {
    kind: "antigravity",
    label: "Antigravity",
    installed: true,
    authState: "authenticated",
    capabilities,
    ...input,
  };
}

describe("unsignedInteractiveRuntimes", () => {
  it("returns an installed Chat runtime that still needs provider login", () => {
    const current = status({
      runtimeVariants: {
        cli: {
          presentationMode: "terminal",
          installed: true,
          authState: "authenticated",
          authUsesProviderLogin: true,
          capabilities,
        },
        acp: {
          presentationMode: "gui",
          installed: true,
          authState: "missing",
          authUsesProviderLogin: true,
          capabilities,
        },
      },
    });

    expect(unsignedInteractiveRuntimes(current).map((runtime) => runtime.presentationMode)).toEqual(
      ["gui"],
    );
  });

  it("ignores runtimes that do not use provider login", () => {
    const current = status({
      runtimeVariants: {
        sdk: {
          presentationMode: "gui",
          installed: true,
          authState: "missing",
          authUsesProviderLogin: false,
          capabilities,
        },
      },
    });

    expect(unsignedInteractiveRuntimes(current)).toEqual([]);
  });
});

describe("statusNeedsInteractiveLogin", () => {
  it("still needs login when the root is signed in but a Chat runtime is not", () => {
    expect(
      statusNeedsInteractiveLogin(
        status({
          runtimeVariants: {
            cli: {
              presentationMode: "terminal",
              installed: true,
              authState: "authenticated",
              authUsesProviderLogin: true,
              capabilities,
            },
            acp: {
              presentationMode: "gui",
              installed: true,
              authState: "missing",
              authUsesProviderLogin: true,
              capabilities,
            },
          },
        }),
      ),
    ).toBe(true);
  });

  it("does not need login when every installed runtime is signed in", () => {
    expect(
      statusNeedsInteractiveLogin(
        status({
          runtimeVariants: {
            cli: {
              presentationMode: "terminal",
              installed: true,
              authState: "authenticated",
              authUsesProviderLogin: true,
              capabilities,
            },
            acp: {
              presentationMode: "gui",
              installed: true,
              authState: "authenticated",
              authUsesProviderLogin: true,
              capabilities,
            },
          },
        }),
      ),
    ).toBe(false);
  });
});

describe("statusHasAuthenticatedLogout", () => {
  it("does not offer logout for an unsigned Chat runtime even when the CLI is signed in", () => {
    expect(
      statusHasAuthenticatedLogout(
        status({
          authLogoutSupported: true,
          runtimeVariants: {
            cli: {
              presentationMode: "terminal",
              installed: true,
              authState: "authenticated",
              authUsesProviderLogin: true,
              capabilities,
            },
            acp: {
              presentationMode: "gui",
              installed: true,
              authState: "missing",
              authUsesProviderLogin: true,
              authLogoutSupported: true,
              capabilities,
            },
          },
        }),
        undefined,
      ),
    ).toBe(false);
  });

  it("offers logout once a logout-capable runtime is signed in", () => {
    expect(
      statusHasAuthenticatedLogout(
        status({
          authLogoutSupported: true,
          runtimeVariants: {
            acp: {
              presentationMode: "gui",
              installed: true,
              authState: "authenticated",
              authUsesProviderLogin: true,
              authLogoutSupported: true,
              capabilities,
            },
          },
        }),
        undefined,
      ),
    ).toBe(true);
  });
});

describe("statusForRuntimeVariant", () => {
  it("keeps one runtime's auth and login command off the sibling row", () => {
    const current = status({
      authState: "authenticated",
      loginCommand: "agy",
      authMethods: [{ type: "terminal", id: "cli-login", name: "CLI login", args: [] }],
      runtimeVariants: {
        cli: {
          presentationMode: "terminal",
          installed: true,
          version: "1.1.27",
          authState: "authenticated",
          authUsesProviderLogin: true,
          loginCommand: "agy",
          authMethods: [{ type: "terminal", id: "cli-login", name: "CLI login", args: [] }],
          capabilities,
        },
        acp: {
          presentationMode: "gui",
          installed: true,
          version: "1.1.1",
          authState: "missing",
          authUsesProviderLogin: true,
          authLogoutSupported: true,
          authMethods: [{ id: "oauth-personal", name: "Log in with Google" }],
          capabilities,
        },
      },
    });

    const cli = statusForRuntimeVariant(current, "cli");
    expect(cli.installed).toBe(true);
    expect(cli.authState).toBe("authenticated");
    expect(cli.loginCommand).toBe("agy");
    expect(cli.authMethods).toEqual([
      { type: "terminal", id: "cli-login", name: "CLI login", args: [] },
    ]);

    const acp = statusForRuntimeVariant(current, "acp");
    expect(acp.authState).toBe("missing");
    expect(acp.loginCommand).toBeUndefined();
    expect(acp.authMethods).toEqual([{ id: "oauth-personal", name: "Log in with Google" }]);
    expect(statusNeedsInteractiveLogin(acp)).toBe(true);
    expect(statusNeedsInteractiveLogin(cli)).toBe(false);
  });
});

describe("authRowKey", () => {
  const variant = {
    presentationMode: "terminal" as const,
    installed: true,
    authState: "authenticated" as const,
    authUsesProviderLogin: true,
    capabilities,
  };

  it("keeps the plain environment key for a status that is not runtime-scoped", () => {
    expect(authRowKey(status())).toBe(authRowKey(status({ runtimeVariants: {} })));
    expect(authRowKey(status({ runtimeVariants: { cli: variant, acp: variant } }))).toBe(
      authRowKey(status()),
    );
  });

  it("separates sibling runtime rows that share one environment", () => {
    const current = status({
      envKind: "windows",
      runtimeVariants: { cli: variant, acp: { ...variant, presentationMode: "gui" } },
    });
    const cli = authRowKey(statusForRuntimeVariant(current, "cli"));
    const acp = authRowKey(statusForRuntimeVariant(current, "acp"));
    expect(cli).not.toBe(acp);
    expect(cli).toBe(authRowKey(statusForRuntimeVariant(current, "cli")));
  });
});
