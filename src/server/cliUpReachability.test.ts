import { isAbsolute, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  describeUpReachability,
  planUpSettings,
  profileTlsPaths,
  promptReachability,
  relayHostOf,
  resolveUpBindChoice,
  savedHostLocalNote,
  savedHostOverrideNote,
  savedTlsPair,
  tailnetUnavailableNote,
  upReachabilityView,
} from "./cliUpReachability";

function promptIO(answer: string) {
  const written: string[] = [];
  const questions: string[] = [];
  return {
    written,
    questions,
    io: {
      ask: async (question: string) => {
        questions.push(question);
        return answer;
      },
      write: (text: string) => {
        written.push(text);
      },
    },
  };
}

describe("promptReachability", () => {
  it("marks the saved choice, detects addresses and defaults to it", async () => {
    const { io, written, questions } = promptIO("");
    const choice = await promptReachability(
      { current: "tailnet", tailnetAddress: "100.64.0.7", lanAddress: "192.168.1.20" },
      io,
    );
    expect(choice).toBe("tailnet");
    const menu = written.join("");
    expect(menu).toContain("How should your other devices reach this machine?");
    expect(menu).toContain("1. Tailscale: only devices on your tailnet (100.64.0.7) (current)");
    expect(menu).toContain(
      "2. Local network: devices on the same network (192.168.1.20), over HTTPS with a self-signed certificate",
    );
    expect(menu).toContain("3. This machine only: no other device can connect");
    expect(questions).toEqual(["Choice [1]: "]);
  });

  it("maps numbered answers and shows the relay and missing Tailscale notes", async () => {
    const { io, written } = promptIO("2");
    const choice = await promptReachability({ relayHost: "relay.example" }, io);
    expect(choice).toBe("lan");
    const menu = written.join("");
    expect(menu).toContain("Tailscale is not running on this machine");
    expect(menu).toContain("; the relay at relay.example keeps working");
    expect(menu).not.toContain("(192.168");
  });

  it("names the configured certificate for a saved custom TLS pair", async () => {
    const { io, written } = promptIO("2");
    await promptReachability({ customTls: true }, io);
    expect(written.join("")).toContain("over HTTPS with your configured certificate");
    const { io: plain, written: plainWritten } = promptIO("2");
    await promptReachability({}, plain);
    expect(plainWritten.join("")).toContain("over HTTPS with a self-signed certificate");
  });

  it("defaults to Tailscale when it is detected and nothing is saved", async () => {
    const { io, questions } = promptIO("");
    const choice = await promptReachability({ tailnetAddress: "100.64.0.7" }, io);
    expect(choice).toBe("tailnet");
    expect(questions).toEqual(["Choice [1]: "]);
  });

  it("asks without a default when nothing is detected or saved", async () => {
    const { io, questions } = promptIO("3");
    const choice = await promptReachability({}, io);
    expect(choice).toBe("local");
    expect(questions).toEqual(["Choice: "]);
  });

  it("rejects invalid input and an empty answer without a default", async () => {
    await expect(promptReachability({}, promptIO("x").io)).rejects.toThrow(
      "Choose 1, 2 or 3; nothing was changed.",
    );
    await expect(promptReachability({}, promptIO("").io)).rejects.toThrow(
      "Choose 1, 2 or 3; nothing was changed.",
    );
  });
});

describe("resolveUpBindChoice", () => {
  it("keeps the saved bind mode for a relay-only flag", async () => {
    const choice = await resolveUpBindChoice({
      flagChoice: undefined,
      relayFlagged: true,
      interactive: false,
      saved: {},
    });
    expect(choice).toBeUndefined();
  });

  it("fails non-interactively naming the flags when nothing is saved", async () => {
    await expect(
      resolveUpBindChoice({
        flagChoice: undefined,
        relayFlagged: false,
        interactive: false,
        saved: {},
      }),
    ).rejects.toThrow(/--tailnet.*--lan.*--local-only.*Nothing was changed/u);
  });

  it("keeps saved settings non-interactively when anything is saved", async () => {
    for (const saved of [
      { bindMode: "tailnet" as const },
      { host: "127.0.0.1" },
      { relayUrl: "https://relay.example" },
    ]) {
      await expect(
        resolveUpBindChoice({
          flagChoice: undefined,
          relayFlagged: false,
          interactive: false,
          saved,
        }),
      ).resolves.toBeUndefined();
    }
  });

  it("asks with the saved choice, addresses and relay host when interactive", async () => {
    let seen: unknown;
    const choice = await resolveUpBindChoice({
      flagChoice: undefined,
      relayFlagged: false,
      interactive: true,
      saved: { bindMode: "tailnet", relayUrl: "wss://user:pw@relay.example/socket" },
      tailnetAddress: "100.64.0.7",
      lanAddress: "192.168.1.20",
      choose: async (input) => {
        seen = input;
        return "lan";
      },
    });
    expect(choice).toBe("lan");
    expect(seen).toEqual({
      current: "tailnet",
      tailnetAddress: "100.64.0.7",
      lanAddress: "192.168.1.20",
      relayHost: "relay.example",
    });
  });

  it("forwards customTls to the prompt when a custom pair is saved", async () => {
    let seen: unknown;
    await resolveUpBindChoice({
      flagChoice: undefined,
      relayFlagged: false,
      interactive: true,
      saved: { bindMode: "lan", tlsCert: "/certs/custom.crt", tlsKey: "/certs/custom.key" },
      customTls: true,
      choose: async (input) => {
        seen = input;
        return "local";
      },
    });
    expect(seen).toMatchObject({ current: "lan", customTls: true });
  });
});

describe("profileTlsPaths and savedTlsPair", () => {
  it("returns absolute paths for a relative profile", () => {
    const paths = profileTlsPaths("relative/profile");
    expect(isAbsolute(paths.certPath)).toBe(true);
    expect(isAbsolute(paths.keyPath)).toBe(true);
    expect(paths.certPath).toBe(resolve("relative/profile", "tls", "server.crt"));
    expect(paths.keyPath).toBe(resolve("relative/profile", "tls", "server.key"));
  });

  it("classifies saved pairs against the profile's own paths", () => {
    const profile = "/profiles/main";
    const tls = profileTlsPaths(profile);
    expect(savedTlsPair({}, profile)).toEqual({
      savedPair: false,
      savedIsProfileTls: false,
      customTls: false,
    });
    expect(savedTlsPair({ tlsCert: tls.certPath, tlsKey: tls.keyPath }, profile)).toEqual({
      savedPair: true,
      savedIsProfileTls: true,
      customTls: false,
    });
    expect(
      savedTlsPair({ tlsCert: "/certs/custom.crt", tlsKey: "/certs/custom.key" }, profile),
    ).toEqual({ savedPair: true, savedIsProfileTls: false, customTls: true });
    // A lone TLS path is not a pair.
    expect(savedTlsPair({ tlsCert: tls.certPath }, profile)).toEqual({
      savedPair: false,
      savedIsProfileTls: false,
      customTls: false,
    });
  });
});

describe("planUpSettings", () => {
  const profile = "/profiles/main";

  it("writes loopback for a fresh local choice without needing a restart", () => {
    const plan = planUpSettings({
      saved: {},
      choice: "local",
      relayUrl: undefined,
      profile,
      tlsFilesExist: false,
    });
    expect(plan.patch).toEqual({ bindMode: "loopback" });
    expect(plan.configureArgs).toEqual(["--bind-mode", "loopback"]);
    expect(plan.write).toBe(true);
    expect(plan.restartNeeded).toBe(false);
  });

  it("does not write when the choice matches the saved config", () => {
    const plan = planUpSettings({
      saved: { bindMode: "tailnet" },
      choice: "tailnet",
      relayUrl: undefined,
      profile,
      tlsFilesExist: false,
    });
    expect(plan.write).toBe(false);
    expect(plan.restartNeeded).toBe(false);
    expect(plan.configureArgs).toEqual(["--bind-mode", "tailnet"]);
  });

  it("plans LAN with profile TLS paths and restarts while TLS is missing", () => {
    const missing = planUpSettings({
      saved: { bindMode: "tailnet" },
      choice: "lan",
      relayUrl: undefined,
      profile,
      tlsFilesExist: false,
    });
    expect(missing.patch).toEqual({
      bindMode: "lan",
      tlsCert: profileTlsPaths(profile).certPath,
      tlsKey: profileTlsPaths(profile).keyPath,
    });
    expect(missing.configureArgs).toEqual([
      "--bind-mode",
      "lan",
      "--tls-cert",
      "/profiles/main/tls/server.crt",
      "--tls-key",
      "/profiles/main/tls/server.key",
    ]);
    expect(missing.write).toBe(true);
    expect(missing.restartNeeded).toBe(true);

    const present = planUpSettings({
      saved: {
        bindMode: "lan",
        tlsCert: "/profiles/main/tls/server.crt",
        tlsKey: "/profiles/main/tls/server.key",
      },
      choice: "lan",
      relayUrl: undefined,
      profile,
      tlsFilesExist: true,
    });
    expect(present.write).toBe(false);
    expect(present.restartNeeded).toBe(false);
  });

  it("keeps a saved custom TLS pair when LAN is chosen", () => {
    const saved = {
      bindMode: "lan" as const,
      tlsCert: "/certs/custom.crt",
      tlsKey: "/certs/custom.key",
    };
    const plan = planUpSettings({
      saved,
      choice: "lan",
      relayUrl: undefined,
      profile,
      tlsFilesExist: false,
    });
    expect(plan.patch).toEqual({ bindMode: "lan" });
    expect(plan.configureArgs).toEqual(["--bind-mode", "lan"]);
    expect(plan.write).toBe(false);
    expect(plan.restartNeeded).toBe(false);
    expect(plan.createProfileTls).toBe(false);

    const switched = planUpSettings({
      saved: { ...saved, bindMode: "tailnet" },
      choice: "lan",
      relayUrl: undefined,
      profile,
      tlsFilesExist: false,
    });
    expect(switched.patch).toEqual({ bindMode: "lan" });
    expect(switched.write).toBe(true);
    expect(switched.restartNeeded).toBe(true);
    expect(switched.createProfileTls).toBe(false);
  });

  it("creates profile TLS for a saved profile pair whose files are missing", () => {
    const plan = planUpSettings({
      saved: {
        bindMode: "lan",
        tlsCert: "/profiles/main/tls/server.crt",
        tlsKey: "/profiles/main/tls/server.key",
      },
      choice: "lan",
      relayUrl: undefined,
      profile,
      tlsFilesExist: false,
    });
    expect(plan.patch).toEqual({ bindMode: "lan" });
    expect(plan.write).toBe(false);
    expect(plan.createProfileTls).toBe(true);
    expect(plan.restartNeeded).toBe(true);
  });

  it("never creates TLS when a saved LAN is kept without a new choice", () => {
    for (const saved of [
      { bindMode: "lan" as const },
      {
        bindMode: "lan" as const,
        tlsCert: "/profiles/main/tls/server.crt",
        tlsKey: "/profiles/main/tls/server.key",
      },
      {
        bindMode: "lan" as const,
        tlsCert: "/certs/custom.crt",
        tlsKey: "/certs/custom.key",
      },
    ]) {
      const plan = planUpSettings({
        saved,
        choice: undefined,
        relayUrl: undefined,
        profile,
        tlsFilesExist: false,
      });
      expect(plan.patch).toEqual({});
      expect(plan.write).toBe(false);
      expect(plan.restartNeeded).toBe(false);
      expect(plan.createProfileTls).toBe(false);
    }
  });

  it("restarts when the relay changes but not for an identical one", () => {
    const changed = planUpSettings({
      saved: { relayUrl: "https://a.example" },
      choice: undefined,
      relayUrl: "https://b.example",
      profile,
      tlsFilesExist: false,
    });
    expect(changed.write).toBe(true);
    expect(changed.restartNeeded).toBe(true);
    expect(changed.configureArgs).toEqual(["--relay-url", "https://b.example"]);

    const same = planUpSettings({
      saved: { relayUrl: "https://a.example" },
      choice: undefined,
      relayUrl: "https://a.example",
      profile,
      tlsFilesExist: false,
    });
    expect(same.write).toBe(false);
    expect(same.restartNeeded).toBe(false);
  });
});

describe("upReachabilityView and text", () => {
  it("derives custom reachability from a saved host and safe relay hosts", () => {
    expect(relayHostOf("https://user:pw@relay.example/x")).toBe("relay.example");
    expect(relayHostOf("not a url")).toBeUndefined();
    const view = upReachabilityView({
      savedHost: "192.168.1.50",
      bindMode: "lan",
      relayUrl: "https://user:pw@relay.example/x",
    });
    expect(view.reachability).toBe("custom");
    expect(view.reachable).toBe(true);
    expect(view.relayHost).toBe("relay.example");
    expect(view.savedHost).toBe("192.168.1.50");
    expect(describeUpReachability(view)).toBe(
      "The server listens on your saved host 192.168.1.50 and through the relay at relay.example.",
    );
  });

  it("treats a custom host by its exposure: loopback stays local, LAN is reachable", () => {
    const loopback = upReachabilityView({ savedHost: "127.0.0.1" });
    expect(loopback.reachability).toBe("custom");
    expect(loopback.reachable).toBe(false);
    expect(
      upReachabilityView({ savedHost: "127.0.0.1", relayUrl: "https://r.example" }).reachable,
    ).toBe(true);
    expect(upReachabilityView({ savedHost: "192.168.1.50" }).reachable).toBe(true);
    expect(upReachabilityView({ savedHost: "100.64.0.7" }).reachable).toBe(true);
  });

  it("covers local, tailnet and LAN lines", () => {
    expect(describeUpReachability(upReachabilityView({ bindMode: "loopback" }))).toBe(
      "Only this machine can connect.",
    );
    expect(
      describeUpReachability(
        upReachabilityView({ bindMode: "loopback", relayUrl: "https://r.example" }),
      ),
    ).toBe("Other devices reach this machine only through the relay at r.example.");
    expect(
      describeUpReachability(
        upReachabilityView({ bindMode: "tailnet", tailnetAddress: "100.64.0.7" }),
      ),
    ).toBe("Other devices reach this machine through Tailscale at 100.64.0.7.");
    expect(describeUpReachability(upReachabilityView({ bindMode: "tailnet" }))).toBe(
      "Other devices will reach this machine through Tailscale once it runs here.",
    );
    expect(
      describeUpReachability(upReachabilityView({ bindMode: "lan", lanAddress: "192.168.1.20" })),
    ).toBe(
      "Devices on your local network reach this machine at 192.168.1.20 over HTTPS with a self-signed certificate.",
    );
    expect(describeUpReachability(upReachabilityView({ bindMode: "lan", customTls: true }))).toBe(
      "Devices on your local network reach this machine over HTTPS.",
    );
  });

  it("builds the tailnet, saved-host and saved-host-local notes", () => {
    expect(tailnetUnavailableNote({ hasService: true, prefix: "/p" })).toContain(
      "poracode service restart --prefix /p",
    );
    expect(tailnetUnavailableNote({ hasService: false })).toContain("until Tailscale runs");
    expect(savedHostOverrideNote("192.168.1.50")).toContain("poracode configure --unset host");
    expect(savedHostLocalNote("127.0.0.1")).toBe(
      "Your saved host 127.0.0.1 keeps the server on this machine; remove it with: poracode configure --unset host",
    );
  });
});
