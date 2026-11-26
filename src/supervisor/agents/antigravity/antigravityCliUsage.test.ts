import { describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { readAntigravityCliUsage, type AntigravityCliUsageDeps } from "./antigravityCliUsage";

const NOW = 1_717_000_000_000;
const EXE = "/opt/agy";
const POSIX: ProjectLocation = { kind: "posix", path: "/work/project" };
const WSL: ProjectLocation = {
  kind: "wsl",
  distro: "Ubuntu",
  linuxPath: "/home/me/project",
  uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\project",
};

const VALID_REPORT = JSON.stringify({
  conversation_id: "",
  status: "SUCCESS",
  response: "Synthetic quota report",
  duration_seconds: 0,
  num_turns: 0,
  command: {
    name: "usage",
    data: {
      description: "Models share limits",
      groups: [
        {
          name: "Gemini Models",
          buckets: [
            {
              id: "gemini-5h",
              name: "Five Hour Limit Remaining",
              window: "5h",
              remaining_fraction: 0.95,
              reset_time: "2026-09-13T03:48:04Z",
            },
            {
              id: "gemini-weekly",
              name: "Weekly Limit Remaining",
              window: "weekly",
              remaining_fraction: 0.86,
              reset_time: "2026-09-17T18:40:27Z",
            },
          ],
        },
        {
          name: "Claude and GPT models",
          buckets: [
            {
              id: "3p-5h",
              name: "Five Hour Limit Remaining",
              window: "5h",
              remaining_fraction: 1,
              reset_time: "2026-09-13T05:29:19Z",
            },
            {
              id: "3p-weekly",
              name: "Weekly Limit Remaining",
              window: "weekly",
              remaining_fraction: 0.89,
              reset_time: "2026-09-17T02:38:46Z",
            },
          ],
        },
      ],
    },
  },
});

function runner() {
  return vi.fn<AntigravityCliUsageDeps["runCommand"]>();
}

function version(stdout = "agy 1.1.11\n") {
  return { ok: true, stdout, stderr: "" };
}

function report(stdout: string) {
  return { ok: true, stdout, stderr: "" };
}

function reportWith(data: unknown, status = "SUCCESS", name = "usage"): string {
  return JSON.stringify({ status, command: { name, data } });
}

function bucket(overrides: Record<string, unknown> = {}) {
  return {
    id: "gemini-weekly",
    name: "Weekly Limit Remaining",
    window: "weekly",
    remaining_fraction: 0.86,
    reset_time: "2026-09-17T18:40:27Z",
    ...overrides,
  };
}

describe("readAntigravityCliUsage", () => {
  it("reads quota groups alongside other command data", async () => {
    const run = runner();
    run.mockResolvedValueOnce(version()).mockResolvedValueOnce(
      report(
        reportWith({
          response: { description: "Quota report" },
          groups: [{ name: "Gemini Models", buckets: [bucket()] }],
        }),
      ),
    );

    await expect(
      readAntigravityCliUsage(EXE, POSIX, NOW, { runCommand: run }),
    ).resolves.toMatchObject({
      windows: [{ id: "antigravity:gemini:weekly", usedPercent: 14 }],
    });
  });

  it("forwards the abort signal into the command runner", async () => {
    const controller = new AbortController();
    const run = runner();
    run.mockResolvedValueOnce(version()).mockResolvedValueOnce(report(VALID_REPORT));

    await readAntigravityCliUsage(EXE, POSIX, NOW, {
      runCommand: run,
      signal: controller.signal,
    });

    expect(run.mock.calls[0]?.[3]?.signal).toBe(controller.signal);
    expect(run.mock.calls[1]?.[3]?.signal).toBe(controller.signal);
  });

  it("does not run print usage for an unresolved or pre-1.1.11 version", async () => {
    for (const stdout of ["", "unknown", "agy 1.1.10\n", "1.1.11-beta.1"]) {
      const run = runner();
      run.mockResolvedValue(version(stdout));
      await expect(
        readAntigravityCliUsage(EXE, POSIX, NOW, { runCommand: run }),
      ).resolves.toBeUndefined();
      expect(run).toHaveBeenCalledTimes(1);
      expect(run.mock.calls[0]?.[2]).toEqual(["--version"]);
    }
  });

  it("does not run print usage when --version fails or times out", async () => {
    const run = runner();
    run.mockResolvedValue({ ok: false, stdout: "", stderr: "timed out" });

    await expect(
      readAntigravityCliUsage(EXE, POSIX, NOW, { runCommand: run }),
    ).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[2]).toEqual(["--version"]);
  });

  it("runs version then the exact print usage command from a neutral cwd", async () => {
    const run = runner();
    run.mockResolvedValueOnce(version()).mockResolvedValueOnce(report(VALID_REPORT));

    const snapshot = await readAntigravityCliUsage(EXE, POSIX, NOW, { runCommand: run });

    const [versionLocation, versionExe, versionArgs, versionOptions] = run.mock.calls[0]!;
    expect(versionLocation.kind).toBe("posix");
    const versionPosix = versionLocation as Extract<ProjectLocation, { kind: "posix" }>;
    expect(versionPosix.path).not.toBe(POSIX.path);
    expect(versionExe).toBe(EXE);
    expect(versionArgs).toEqual(["--version"]);
    expect(versionOptions?.env).toMatchObject({ AGY_CLI_DISABLE_AUTO_UPDATE: "true" });
    expect(versionOptions?.timeoutMs).toBeGreaterThan(0);
    expect(versionOptions?.posixCwd).toBe(versionPosix.path);
    expect(versionOptions?.env?.BROWSER).toContain("open");
    expect(versionOptions?.env?.PATH).toContain(versionPosix.path);

    const [, usageExe, usageArgs, usageOptions] = run.mock.calls[1]!;
    expect(usageExe).toBe(EXE);
    expect(usageArgs).toEqual(["-p", "/usage", "--output-format", "json"]);
    expect(usageOptions?.timeoutMs).toBeGreaterThan(0);
    expect(usageOptions?.env).toMatchObject({ AGY_CLI_DISABLE_AUTO_UPDATE: "true" });

    expect(snapshot).toMatchObject({
      providerId: "antigravity",
      status: "ok",
      fetchedAt: NOW,
    });
    expect(
      snapshot?.windows.map((window) => [window.id, window.usedPercent, window.resetsAt]),
    ).toEqual([
      ["antigravity:gemini:session-5h", 5, Date.parse("2026-09-13T03:48:04Z")],
      ["antigravity:gemini:weekly", 14, Date.parse("2026-09-17T18:40:27Z")],
      ["antigravity:claude:session-5h", 0, Date.parse("2026-09-13T05:29:19Z")],
      ["antigravity:claude:weekly", 11, Date.parse("2026-09-17T02:38:46Z")],
    ]);
  });

  it("uses the WSL distro with /tmp as the neutral cwd and suppresses xdg-open", async () => {
    const run = runner();
    run.mockResolvedValueOnce(version()).mockResolvedValueOnce(report(VALID_REPORT));

    await readAntigravityCliUsage(EXE, WSL, NOW, { runCommand: run });

    const [wslLocation, wslExe, wslArgs, wslOptions] = run.mock.calls[0]!;
    expect(wslLocation).toEqual(WSL);
    expect(wslExe).toBe(EXE);
    expect(wslArgs).toEqual(["--version"]);
    expect(wslOptions?.wslLinuxCwd).toBe("/tmp");
    expect(wslOptions?.posixCwd).toBeUndefined();
    expect(wslOptions?.env).toMatchObject({
      AGY_CLI_DISABLE_AUTO_UPDATE: "true",
      BROWSER: "/bin/true",
    });
  });

  it.each([
    ["normal model output", JSON.stringify({ status: "SUCCESS", response: "Here is your answer" })],
    ["error status", reportWith({ groups: [bucket()] }, "ERROR")],
    ["unrelated command", reportWith({ groups: [bucket()] }, "SUCCESS", "models")],
    ["empty groups", reportWith({ groups: [] })],
    ["missing groups", reportWith({})],
    ["disabled bucket", reportWith({ groups: [{ buckets: [bucket({ disabled: true })] }] })],
    [
      "missing remaining fraction",
      reportWith({ groups: [{ buckets: [bucket({ remaining_fraction: undefined })] }] }),
    ],
    ["zero reset", reportWith({ groups: [{ buckets: [bucket({ reset_time: 0 })] }] })],
    [
      "invalid reset",
      reportWith({ groups: [{ buckets: [bucket({ reset_time: "not-a-date" })] }] }),
    ],
    ["empty stdout", ""],
    ["invalid json", "not-json"],
  ])("returns unavailable for %s", async (_name, payload) => {
    const run = runner();
    run.mockResolvedValueOnce(version());
    if (payload !== undefined) run.mockResolvedValueOnce(report(payload));

    await expect(
      readAntigravityCliUsage(EXE, POSIX, NOW, { runCommand: run }),
    ).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("accepts measured buckets without an optional id when cadence is known", async () => {
    const run = runner();
    run.mockResolvedValueOnce(version()).mockResolvedValueOnce(
      report(
        reportWith({
          groups: [
            {
              displayName: "Gemini Models",
              buckets: [
                {
                  window: "weekly",
                  remaining: { case: "remainingFraction", value: 0.8 },
                  resetTime: "2026-09-17T18:40:27Z",
                },
              ],
            },
          ],
        }),
      ),
    );

    const snapshot = await readAntigravityCliUsage(EXE, POSIX, NOW, { runCommand: run });

    expect(snapshot?.windows).toEqual([
      {
        id: "antigravity:gemini:weekly",
        label: "Gemini · Weekly",
        usedPercent: 20,
        resetsAt: Date.parse("2026-09-17T18:40:27Z"),
      },
    ]);
  });

  it("rejects a measured bucket whose cadence the shared parser cannot use", async () => {
    const run = runner();
    run.mockResolvedValueOnce(version()).mockResolvedValueOnce(
      report(
        reportWith({
          groups: [
            {
              buckets: [{ remaining_fraction: 0.8, reset_time: "2026-09-17T18:40:27Z" }],
            },
          ],
        }),
      ),
    );

    await expect(
      readAntigravityCliUsage(EXE, POSIX, NOW, { runCommand: run }),
    ).resolves.toBeUndefined();
  });

  it("keeps measured buckets while skipping disabled or invalid-reset siblings", async () => {
    const run = runner();
    run.mockResolvedValueOnce(version()).mockResolvedValueOnce(
      report(
        reportWith({
          groups: [
            {
              name: "Gemini Models",
              buckets: [
                bucket({ id: "disabled", disabled: true }),
                bucket({ id: "bad-reset", reset_time: "not-a-date" }),
                bucket({ id: "valid", reset_time: "2026-09-17T18:40:27Z" }),
              ],
            },
          ],
        }),
      ),
    );

    const snapshot = await readAntigravityCliUsage(EXE, POSIX, NOW, { runCommand: run });

    expect(snapshot?.windows.map((window) => window.id)).toEqual(["antigravity:gemini:weekly"]);
  });

  it("returns unavailable on auth/timeout failure without exposing stderr", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const run = runner();
    run.mockResolvedValueOnce(version()).mockResolvedValueOnce({
      ok: false,
      stdout: "",
      stderr: "please log in: secret-token",
    });

    await expect(
      readAntigravityCliUsage(EXE, POSIX, NOW, { runCommand: run }),
    ).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
  });

  it("recovers on the next call after a usage timeout/failure", async () => {
    const run = runner();
    run
      .mockResolvedValueOnce(version())
      .mockResolvedValueOnce({ ok: false, stdout: "", stderr: "timed out" })
      .mockResolvedValueOnce(version())
      .mockResolvedValueOnce(report(VALID_REPORT));

    await expect(
      readAntigravityCliUsage(EXE, POSIX, NOW, { runCommand: run }),
    ).resolves.toBeUndefined();
    await expect(
      readAntigravityCliUsage(EXE, POSIX, NOW + 1, { runCommand: run }),
    ).resolves.toMatchObject({ status: "ok", fetchedAt: NOW + 1 });
  });
});
