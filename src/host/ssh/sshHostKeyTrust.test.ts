import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseHostKeyObservations,
  parseSshResolvedConfig,
  SshHostKeyTrust,
  SshHostKeyTrustError,
  sshKeyFingerprint,
  sshKnownHostsLookupName,
  type SshCommandExecutor,
  type SshHostKeyObservation,
} from "./sshHostKeyTrust";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempDir(): string {
  const root = mkdtempSync(join(tmpdir(), "poracode-trust-test-"));
  roots.push(root);
  return root;
}

const blobA = Buffer.from("ssh-ed25519 fixture key A").toString("base64");
const blobB = Buffer.from("ssh-ed25519 fixture key B").toString("base64");
const blobRsa = Buffer.from("ssh-rsa fixture key C").toString("base64");
const fingerprintA = sshKeyFingerprint(blobA)!;

function observation(keyType: string, blob: string): SshHostKeyObservation {
  return {
    keyType,
    keyBlob: blob,
    fingerprint: sshKeyFingerprint(blob)!,
    hostField: "host.example",
  };
}

class FakeExecutor implements SshCommandExecutor {
  readonly calls: Array<{ command: string; args: readonly string[] }> = [];
  private readonly responses = new Map<string, { stdout: string; stderr?: string }>();
  private readonly failures = new Map<string, Error>();

  respond(command: string, args: readonly string[], stdout: string): void {
    this.responses.set(`${command} ${args.join(" ")}`, { stdout });
  }

  fail(command: string, args: readonly string[], error: Error): void {
    this.failures.set(`${command} ${args.join(" ")}`, error);
  }

  run(command: string, args: readonly string[]): Promise<{ stdout: string; stderr: string }> {
    this.calls.push({ command, args });
    const key = `${command} ${args.join(" ")}`;
    const failure = this.failures.get(key);
    if (failure) return Promise.reject(failure);
    const response = this.responses.get(key);
    if (response === undefined) {
      return Promise.reject(new Error(`Unexpected command: ${key}`));
    }
    return Promise.resolve({ stdout: response.stdout, stderr: response.stderr ?? "" });
  }
}

describe("ssh host-key trust parsing", () => {
  it("computes OpenSSH SHA256 fingerprints", () => {
    expect(sshKeyFingerprint(Buffer.from("hello").toString("base64"))).toBe(
      "SHA256:LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ",
    );
    expect(sshKeyFingerprint("not base64!")).toBeNull();
  });

  it("resolves effective host, port, alias, and known-hosts lookup name", () => {
    const parsed = parseSshResolvedConfig(
      ["host build", "hostname 10.0.0.7", "port 2222", "hostkeyalias build-alias", "user dev"].join(
        "\n",
      ),
    );
    expect(parsed).toEqual({ host: "10.0.0.7", port: 2222, hostKeyAlias: "build-alias" });
    expect(sshKnownHostsLookupName(parsed!)).toBe("build-alias");
    expect(sshKnownHostsLookupName({ host: "example.com", port: 22 })).toBe("example.com");
    expect(sshKnownHostsLookupName({ host: "example.com", port: 2200 })).toBe("[example.com]:2200");
    expect(parseSshResolvedConfig("port 2222")).toBeNull();
  });

  it("parses known-hosts lines, skips comments/markers, and prefers ed25519", () => {
    const text = [
      "# Host host.example found: line 3",
      "@revoked host.example ssh-ed25519 " + blobB,
      "@cert-authority *.example ssh-ed25519 " + blobB,
      `host.example ssh-rsa ${blobRsa}`,
      `host.example ssh-ed25519 ${blobA}`,
      `host.example ssh-ed25519 ${blobA}`,
    ].join("\n");
    const observations = parseHostKeyObservations(text);
    expect(observations).toHaveLength(2);
    expect(observations[0]).toMatchObject({ keyType: "ssh-ed25519", fingerprint: fingerprintA });
    expect(observations[1]?.keyType).toBe("ssh-rsa");
  });
});

describe("SshHostKeyTrust", () => {
  it("resolves a target through ssh -G without connecting", async () => {
    const executor = new FakeExecutor();
    executor.respond("ssh", ["-G", "-p", "2222", "build"], "hostname 10.0.0.7\nport 2222\n");
    const trust = new SshHostKeyTrust({ executor });
    await expect(trust.resolveTarget({ target: "build", port: 2222 })).resolves.toEqual({
      host: "10.0.0.7",
      port: 2222,
      lookupName: "[10.0.0.7]:2222",
    });
  });

  it("probes offered keys with ssh-keyscan and returns the preferred fingerprint", async () => {
    const executor = new FakeExecutor();
    executor.respond(
      "ssh-keyscan",
      ["-T", "15", "-p", "2222", "10.0.0.7"],
      `# 10.0.0.7:2222 SSH-2.0-OpenSSH\n10.0.0.7 ssh-rsa ${blobRsa}\n10.0.0.7 ssh-ed25519 ${blobA}\n`,
    );
    const trust = new SshHostKeyTrust({ executor });
    const probe = await trust.probe({
      host: "10.0.0.7",
      port: 2222,
      lookupName: "[10.0.0.7]:2222",
    });
    expect(probe.preferred).toMatchObject({ keyType: "ssh-ed25519", fingerprint: fingerprintA });
    expect(probe.observations).toHaveLength(2);
  });

  it("fails closed when the probe yields no usable host key", async () => {
    const executor = new FakeExecutor();
    executor.respond("ssh-keyscan", ["-T", "15", "-p", "22", "host.example"], "# nothing\n");
    const trust = new SshHostKeyTrust({ executor });
    await expect(
      trust.probe({ host: "host.example", port: 22, lookupName: "host.example" }),
    ).rejects.toBeInstanceOf(SshHostKeyTrustError);
  });

  it("reads trusted system known-hosts entries and tolerates a missing file", async () => {
    const executor = new FakeExecutor();
    executor.fail(
      "ssh-keygen",
      ["-F", "host.example", "-f", "/home/dev/.ssh/known_hosts"],
      new Error("no file"),
    );
    executor.respond(
      "ssh-keygen",
      ["-F", "host.example", "-f", "/etc/ssh/known_hosts"],
      `# Host host.example found: line 1\nhost.example ssh-ed25519 ${blobA}\n`,
    );
    const trust = new SshHostKeyTrust({
      executor,
      systemKnownHostsFiles: ["/home/dev/.ssh/known_hosts", "/etc/ssh/known_hosts"],
    });
    const system = await trust.readSystemTrust({
      host: "host.example",
      port: 22,
      lookupName: "host.example",
    });
    expect(system.observations).toHaveLength(1);
    expect(system.observations[0]?.fingerprint).toBe(fingerprintA);
  });

  it("writes a policy file with exactly the accepted lines", async () => {
    const executor = new FakeExecutor();
    const trust = new SshHostKeyTrust({ executor });
    const path = join(tempDir(), "known-hosts", "env.known_hosts");
    const target = { host: "host.example", port: 22, lookupName: "host.example" };
    await trust.writeKnownHostsFile(path, [
      trust.knownHostsLine(observation("ssh-ed25519", blobA), target),
    ]);
    const contents = readFileSync(path, "utf8");
    expect(contents).toContain(`host.example ssh-ed25519 ${blobA}`);
  });

  it.skipIf(process.platform === "win32")("writes the policy file owner-only", async () => {
    const executor = new FakeExecutor();
    const trust = new SshHostKeyTrust({ executor });
    const path = join(tempDir(), "known-hosts", "env.known_hosts");
    await trust.writeKnownHostsFile(path, []);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});
