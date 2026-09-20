import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_REMOTE_ACCESS_HOST,
  DEFAULT_REMOTE_ACCESS_PORT,
  LAN_BIND_HOST,
  PLAINTEXT_LAN_ACK_ENV,
  classifyBindHostExposure,
  detectLanIpv4Address,
  detectTailnetIpv4Address,
  remoteAccessAdvertisedHost,
  remoteAccessBindRefusal,
  remoteAccessHost,
  remoteAccessPairingAppUrl,
  remoteAccessPort,
  resolveRemoteAccessBind,
  resolveRemoteAccessPort,
  remoteTlsCertPaths,
  remoteTlsConfigured,
} from "./config";

const ENV_KEYS = [
  "PORACODE_REMOTE_ACCESS_ADVERTISED_HOST",
  "PORACODE_REMOTE_ACCESS_HOST",
  "PORACODE_REMOTE_BIND_MODE",
  "PORACODE_ALLOW_PLAINTEXT_LAN",
  "PORACODE_REMOTE_ACCESS_PAIRING_APP_URL",
  "PORACODE_REMOTE_ACCESS_PORT",
] as const;

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

function ipv4(address: string, internal = false) {
  return {
    address,
    cidr: `${address}/24`,
    family: "IPv4" as const,
    internal,
    mac: "00:00:00:00:00:00",
    netmask: "255.255.255.0",
  };
}

describe("remote access config", () => {
  it("defaults to the loopback bind host and pairing defaults without forcing a port", () => {
    expect(DEFAULT_REMOTE_ACCESS_HOST).toBe("127.0.0.1");
    expect(remoteAccessHost()).toBe(DEFAULT_REMOTE_ACCESS_HOST);
    expect(remoteAccessPort()).toBeUndefined();
    expect(remoteAccessPairingAppUrl()).toBeUndefined();
  });

  it("accepts explicit overrides", () => {
    process.env.PORACODE_REMOTE_ACCESS_ADVERTISED_HOST = "mobile-test.poracode.local";
    process.env.PORACODE_REMOTE_ACCESS_HOST = "127.0.0.1";
    process.env.PORACODE_REMOTE_ACCESS_PORT = "49999";
    process.env.PORACODE_REMOTE_ACCESS_PAIRING_APP_URL = "https://preview.poracodeapp.com";

    expect(remoteAccessAdvertisedHost()).toBe("mobile-test.poracode.local");
    expect(remoteAccessHost()).toBe("127.0.0.1");
    expect(remoteAccessPort()).toBe(49999);
    expect(remoteAccessPairingAppUrl()).toBe("https://preview.poracodeapp.com");
  });

  it("scans the dynamic/private range when no port is configured", async () => {
    const checked: number[] = [];
    const port = await resolveRemoteAccessPort({
      host: "127.0.0.1",
      rangeEnd: DEFAULT_REMOTE_ACCESS_PORT + 3,
      isAvailable: async (candidate) => {
        checked.push(candidate);
        return candidate === DEFAULT_REMOTE_ACCESS_PORT + 2;
      },
    });

    expect(port).toBe(DEFAULT_REMOTE_ACCESS_PORT + 2);
    expect(checked).toEqual([
      DEFAULT_REMOTE_ACCESS_PORT,
      DEFAULT_REMOTE_ACCESS_PORT + 1,
      DEFAULT_REMOTE_ACCESS_PORT + 2,
    ]);
  });

  it("keeps an explicit port authoritative without probing", async () => {
    const isAvailable = vi.fn<(port: number, host: string) => Promise<boolean>>();

    await expect(
      resolveRemoteAccessPort({ host: "127.0.0.1", port: 49999, isAvailable }),
    ).resolves.toBe(49999);
    expect(isAvailable).not.toHaveBeenCalled();
  });

  it("falls back to automatic selection for an invalid environment port", async () => {
    process.env.PORACODE_REMOTE_ACCESS_PORT = "not-a-port";

    await expect(
      resolveRemoteAccessPort({
        rangeStart: 52000,
        rangeEnd: 52000,
        isAvailable: async () => true,
      }),
    ).resolves.toBe(52000);
  });

  it("detects a preferred LAN IPv4 address across interface naming styles", () => {
    expect(
      detectLanIpv4Address({
        lo0: [ipv4("127.0.0.1", true)],
        "vEthernet (WSL)": [ipv4("172.25.80.1")],
        "Wi-Fi": [ipv4("192.168.1.42")],
      }),
    ).toBe("192.168.1.42");
  });

  it("prefers Linux physical network interfaces over container bridges", () => {
    expect(
      detectLanIpv4Address({
        docker0: [ipv4("172.17.0.1")],
        wlan0: [ipv4("10.1.2.3")],
      }),
    ).toBe("10.1.2.3");
  });

  it("advertises the LAN address when binding to every interface", () => {
    expect(
      remoteAccessAdvertisedHost({
        bindHost: LAN_BIND_HOST,
        interfaces: {
          en0: [ipv4("10.0.0.25")],
        },
      }),
    ).toBe("10.0.0.25");
  });
});

describe("remote access bind modes (Gate 6 item 4.1)", () => {
  it("resolves the loopback default when no bind configuration is present", () => {
    const bind = resolveRemoteAccessBind();
    expect(bind).toMatchObject({
      mode: "loopback",
      host: "127.0.0.1",
      source: "default",
      refusalReason: null,
    });
    expect(bind.warnings).toEqual([]);
  });

  it("resolves the tailnet bind to the Tailscale interface IPv4 when present", () => {
    process.env.PORACODE_REMOTE_BIND_MODE = "tailnet";

    expect(
      resolveRemoteAccessBind({
        interfaces: {
          lo0: [ipv4("127.0.0.1", true)],
          en0: [ipv4("192.168.1.42")],
          Tailscale: [ipv4("100.84.12.7")],
        },
      }),
    ).toMatchObject({ mode: "tailnet", host: "100.84.12.7", source: "bind-mode" });
  });

  it("detects a tailnet address in the CGNAT range even on an unnamed interface", () => {
    expect(
      detectTailnetIpv4Address({
        utun5: [ipv4("100.101.3.4")],
        en0: [ipv4("192.168.1.42")],
      }),
    ).toBe("100.101.3.4");
    // Outside 100.64.0.0/10 → not a tailnet address.
    expect(
      detectTailnetIpv4Address({
        en0: [ipv4("100.20.30.40")],
      }),
    ).toBeUndefined();
  });

  it("falls back to loopback with a warning when tailnet mode finds no Tailscale interface", () => {
    process.env.PORACODE_REMOTE_BIND_MODE = "tailnet";

    const bind = resolveRemoteAccessBind({
      interfaces: {
        lo0: [ipv4("127.0.0.1", true)],
        en0: [ipv4("192.168.1.42")],
      },
    });
    expect(bind).toMatchObject({
      mode: "tailnet",
      host: "127.0.0.1",
      source: "bind-mode",
      refusalReason: null,
    });
    expect(bind.warnings.join(" ")).toContain("falling back to the loopback bind");
  });

  it("refuses the lan bind without the plaintext acknowledgement", () => {
    process.env.PORACODE_REMOTE_BIND_MODE = "lan";

    const bind = resolveRemoteAccessBind();
    expect(bind).toMatchObject({ mode: "lan", host: LAN_BIND_HOST, source: "bind-mode" });
    expect(bind.refusalReason).toContain("PORACODE_ALLOW_PLAINTEXT_LAN=1");
    // The resolved host throws the same refusal through the listen-host helper.
    expect(() => remoteAccessHost()).toThrow(/PORACODE_ALLOW_PLAINTEXT_LAN=1/);
  });

  it("resolves the lan bind with the acknowledgement and a loud plaintext warning", () => {
    process.env.PORACODE_REMOTE_BIND_MODE = "lan";
    process.env.PORACODE_ALLOW_PLAINTEXT_LAN = "1";

    const bind = resolveRemoteAccessBind();
    expect(bind).toMatchObject({
      mode: "lan",
      host: LAN_BIND_HOST,
      plaintextLanAcknowledged: true,
      refusalReason: null,
    });
    expect(bind.warnings.join(" ")).toContain("plaintext");
  });

  it("keeps an explicit loopback host override working verbatim", () => {
    process.env.PORACODE_REMOTE_ACCESS_HOST = "127.0.0.1";

    expect(remoteAccessHost()).toBe("127.0.0.1");
    const bind = resolveRemoteAccessBind();
    expect(bind).toMatchObject({
      mode: "loopback",
      host: "127.0.0.1",
      source: "explicit-host",
      refusalReason: null,
    });
    expect(bind.warnings).toEqual([]);
  });

  it("refuses an explicit LAN IP over plaintext without the acknowledgement", () => {
    process.env.PORACODE_REMOTE_ACCESS_HOST = "192.168.1.20";

    expect(() => remoteAccessHost()).toThrow(/PORACODE_ALLOW_PLAINTEXT_LAN=1/);
    const bind = resolveRemoteAccessBind();
    expect(bind).toMatchObject({
      mode: "lan",
      host: "192.168.1.20",
      source: "explicit-host",
    });
    expect(bind.refusalReason).toContain("PORACODE_ALLOW_PLAINTEXT_LAN=1");
    expect(bind.refusalReason).toContain("192.168.1.20");
  });

  it("accepts an explicit LAN IP with the plaintext acknowledgement", () => {
    process.env.PORACODE_REMOTE_ACCESS_HOST = "192.168.1.20";
    process.env.PORACODE_ALLOW_PLAINTEXT_LAN = "1";

    expect(remoteAccessHost()).toBe("192.168.1.20");
    expect(resolveRemoteAccessBind()).toMatchObject({
      mode: "lan",
      host: "192.168.1.20",
      plaintextLanAcknowledged: true,
      refusalReason: null,
    });
  });

  it("refuses an explicit all-interfaces host without the acknowledgement", () => {
    process.env.PORACODE_REMOTE_ACCESS_HOST = "0.0.0.0";

    expect(() => remoteAccessHost()).toThrow(/PORACODE_ALLOW_PLAINTEXT_LAN=1/);
    expect(resolveRemoteAccessBind().refusalReason).toContain("PORACODE_ALLOW_PLAINTEXT_LAN=1");

    process.env.PORACODE_ALLOW_PLAINTEXT_LAN = "1";
    expect(remoteAccessHost()).toBe("0.0.0.0");
    expect(resolveRemoteAccessBind().refusalReason).toBeNull();
  });

  it("lets an explicit loopback host resolve without warnings", () => {
    process.env.PORACODE_REMOTE_ACCESS_HOST = "127.0.0.1";

    const bind = resolveRemoteAccessBind();
    expect(bind).toMatchObject({ mode: "loopback", host: "127.0.0.1", source: "explicit-host" });
    expect(bind.warnings).toEqual([]);
  });

  it("notes that an explicit host wins over a configured bind mode", () => {
    process.env.PORACODE_REMOTE_ACCESS_HOST = "127.0.0.1";
    process.env.PORACODE_REMOTE_BIND_MODE = "lan";

    const bind = resolveRemoteAccessBind();
    expect(bind).toMatchObject({ mode: "loopback", host: "127.0.0.1" });
    expect(bind.refusalReason).toBeNull();
    expect(bind.warnings.join(" ")).toContain("PORACODE_REMOTE_BIND_MODE");
  });

  it("falls back to loopback with a warning for an unknown bind mode value", () => {
    process.env.PORACODE_REMOTE_BIND_MODE = "tialnet";

    const bind = resolveRemoteAccessBind();
    expect(bind).toMatchObject({ mode: "loopback", host: "127.0.0.1", refusalReason: null });
    expect(bind.warnings.join(" ")).toContain('Unknown PORACODE_REMOTE_BIND_MODE value "tialnet"');
  });

  it("classifies concrete bind hosts into exposure modes", () => {
    expect(classifyBindHostExposure("127.0.0.1")).toBe("loopback");
    expect(classifyBindHostExposure("localhost")).toBe("loopback");
    expect(classifyBindHostExposure("::1")).toBe("loopback");
    expect(classifyBindHostExposure("100.84.12.7")).toBe("tailnet");
    expect(classifyBindHostExposure("192.168.1.20")).toBe("lan");
    expect(classifyBindHostExposure("10.0.0.9")).toBe("lan");
    expect(classifyBindHostExposure("0.0.0.0")).toBe("lan");
  });

  it("computes the LAN-bind refusal from the host classification, acknowledgement, and TLS", () => {
    expect(remoteAccessBindRefusal("127.0.0.1")).toBeNull();
    expect(remoteAccessBindRefusal("192.168.1.20")).toContain("PORACODE_ALLOW_PLAINTEXT_LAN=1");
    expect(remoteAccessBindRefusal("0.0.0.0")).toContain("PORACODE_ALLOW_PLAINTEXT_LAN=1");
    expect(remoteAccessBindRefusal("::")).toContain("PORACODE_ALLOW_PLAINTEXT_LAN=1");
    expect(
      remoteAccessBindRefusal("0.0.0.0", {
        env: { [PLAINTEXT_LAN_ACK_ENV]: "1" },
      }),
    ).toBeNull();
    expect(
      remoteAccessBindRefusal("192.168.1.20", {
        env: { [PLAINTEXT_LAN_ACK_ENV]: "1" },
      }),
    ).toBeNull();
    expect(
      remoteAccessBindRefusal("192.168.1.20", {
        tlsConfigured: true,
      }),
    ).toBeNull();
    expect(
      remoteAccessBindRefusal("0.0.0.0", {
        env: { [PLAINTEXT_LAN_ACK_ENV]: "yes" },
      }),
    ).toContain("PORACODE_ALLOW_PLAINTEXT_LAN=1");
  });
});

describe("remote access TLS config (Gate 6 item 4.2)", () => {
  const CERT_ENV = "PORACODE_REMOTE_TLS_CERT";
  const KEY_ENV = "PORACODE_REMOTE_TLS_KEY";
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of [CERT_ENV, KEY_ENV]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  function setTls(certPath: string | undefined, keyPath: string | undefined): void {
    saved[CERT_ENV] = process.env[CERT_ENV];
    saved[KEY_ENV] = process.env[KEY_ENV];
    if (certPath === undefined) delete process.env[CERT_ENV];
    else process.env[CERT_ENV] = certPath;
    if (keyPath === undefined) delete process.env[KEY_ENV];
    else process.env[KEY_ENV] = keyPath;
  }

  it("reports TLS as unconfigured when neither path is set", () => {
    setTls(undefined, undefined);
    expect(remoteTlsCertPaths()).toBeNull();
    expect(remoteTlsConfigured()).toBe(false);
  });

  it("surfaces a partial configuration so the loader can refuse it loudly", () => {
    setTls("/etc/poracode/tls/cert.pem", undefined);
    expect(remoteTlsCertPaths()).toEqual({ certPath: "/etc/poracode/tls/cert.pem", keyPath: "" });
    expect(remoteTlsConfigured()).toBe(false);

    setTls(undefined, "/etc/poracode/tls/key.pem");
    expect(remoteTlsCertPaths()).toEqual({ certPath: "", keyPath: "/etc/poracode/tls/key.pem" });
    expect(remoteTlsConfigured()).toBe(false);
  });

  it("reports both paths when configured", () => {
    setTls("/etc/poracode/tls/cert.pem", "/etc/poracode/tls/key.pem");
    expect(remoteTlsCertPaths()).toEqual({
      certPath: "/etc/poracode/tls/cert.pem",
      keyPath: "/etc/poracode/tls/key.pem",
    });
    expect(remoteTlsConfigured()).toBe(true);
  });

  it("lets a TLS-backed wildcard bind skip the plaintext-LAN acknowledgement", () => {
    expect(remoteAccessBindRefusal("0.0.0.0", { tlsConfigured: true })).toBeNull();
    expect(remoteAccessBindRefusal("0.0.0.0", { tlsConfigured: false })).toMatch(
      /Refusing to bind/,
    );
    // The explicit-host path behaves the same: classified lan, but encrypted.
    const resolution = resolveRemoteAccessBind({
      env: {
        PORACODE_REMOTE_ACCESS_HOST: "0.0.0.0",
        [CERT_ENV]: "/cert.pem",
        [KEY_ENV]: "/key.pem",
      },
    });
    expect(resolution.mode).toBe("lan");
    expect(resolution.refusalReason).toBeNull();
    expect(resolution.tlsConfigured).toBe(true);
  });

  it("lets a TLS-backed explicit LAN IP skip the plaintext-LAN acknowledgement", () => {
    const resolution = resolveRemoteAccessBind({
      env: {
        PORACODE_REMOTE_ACCESS_HOST: "192.168.1.5",
        [CERT_ENV]: "/cert.pem",
        [KEY_ENV]: "/key.pem",
      },
    });
    expect(resolution.mode).toBe("lan");
    expect(resolution.host).toBe("192.168.1.5");
    expect(resolution.refusalReason).toBeNull();
    expect(resolution.tlsConfigured).toBe(true);
  });

  it("passes tlsConfigured through the named lan-mode resolution", () => {
    setTls(undefined, undefined);
    const plaintext = resolveRemoteAccessBind({ env: { PORACODE_REMOTE_BIND_MODE: "lan" } });
    expect(plaintext.tlsConfigured).toBe(false);
    expect(plaintext.refusalReason).toMatch(/Refusing to bind/);

    const encrypted = resolveRemoteAccessBind({
      env: { PORACODE_REMOTE_BIND_MODE: "lan" },
      tlsConfigured: true,
    });
    expect(encrypted.mode).toBe("lan");
    expect(encrypted.refusalReason).toBeNull();
    expect(encrypted.warnings.join(" ")).toContain("TLS material is configured");
  });
});
