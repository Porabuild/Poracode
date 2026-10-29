import { expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { administerProject } from "./hostProjects";
import {
  hostAdminRequest,
  hostAdminRequestSchema,
  hostAdminResultSchema,
} from "@/shared/hostAdminProtocol";
import { hostProjectCommandSchema } from "@/shared/contracts/hostProjects";

function fixture() {
  const rows: Project[] = [];
  let active = true;
  const context = {
    signal: new AbortController().signal,
    assertActive() {
      if (!active) throw new Error("Owner stopped");
    },
  };
  type Ports = NonNullable<Parameters<typeof administerProject>[2]>;
  const ports: Ports = {
    stat: vi.fn<Ports["stat"]>(async () => ({ isDirectory: () => true })),
    page: vi.fn<Ports["page"]>(() => ({ rows: [], moreBeyondWindow: false })),
    summaries: vi.fn<Ports["summaries"]>((ids) =>
      rows
        .filter((row) => ids.includes(row.id))
        .map((row) => ({
          id: row.id,
          name: row.name,
          location: row.location,
          disabled: row.disabled === true,
          createdAt: row.createdAt,
        })),
    ),
    registration: {
      platform: "linux",
      now: () => "2026-10-21T00:00:00Z",
      findProjectByLocation: vi.fn<Ports["registration"]["findProjectByLocation"]>(
        (location) =>
          rows.find((row) => JSON.stringify(row.location) === JSON.stringify(location)) ?? null,
      ),
      upsertProject: vi.fn<Ports["registration"]["upsertProject"]>((row) => {
        rows.push(row);
      }),
      updateProject: vi.fn<Ports["registration"]["updateProject"]>((row) => {
        rows[rows.findIndex((current) => current.id === row.id)] = row;
      }),
      getProjects: vi.fn<Ports["registration"]["getProjects"]>(() => {
        throw new Error("Unbounded catalog read");
      }),
    },
  };
  return {
    rows,
    context,
    ports,
    stop() {
      active = false;
    },
  };
}

it("registers through the shared writer and preserves existing project identity/settings", async () => {
  const f = fixture();
  const added = await administerProject(
    { action: "projects-add", path: "/repo" },
    f.context,
    f.ports,
  );
  expect(added).toMatchObject({
    created: true,
    project: { name: "repo", location: { kind: "posix", path: "/repo" } },
  });
  f.rows[0]!.scripts = { actions: [], setupScript: "sensitive-script" };
  f.rows[0]!.disabled = true;
  const id = f.rows[0]!.id;
  const repeated = await administerProject(
    { action: "projects-add", path: "/repo", name: "Renamed" },
    f.context,
    f.ports,
  );
  expect(repeated).toMatchObject({
    created: false,
    project: { id, name: "Renamed", disabled: true },
  });
  expect(JSON.stringify(repeated)).not.toContain("sensitive-script");
  expect(f.rows[0]!.scripts.setupScript).toBe("sensitive-script");
  expect(f.ports.registration.getProjects).not.toHaveBeenCalled();
});

it("refuses missing/non-directory/relative paths and joins the owner check after filesystem await", async () => {
  const f = fixture();
  await expect(
    administerProject({ action: "projects-add", path: "relative" }, f.context, f.ports),
  ).rejects.toThrow("absolute");
  expect(f.ports.stat).not.toHaveBeenCalled();
  vi.mocked(f.ports.stat).mockResolvedValueOnce({ isDirectory: () => false });
  await expect(
    administerProject({ action: "projects-add", path: "/file" }, f.context, f.ports),
  ).rejects.toThrow("existing directory");
  vi.mocked(f.ports.stat).mockImplementationOnce(async () => {
    f.stop();
    return { isDirectory: () => true };
  });
  await expect(
    administerProject({ action: "projects-add", path: "/repo" }, f.context, f.ports),
  ).rejects.toThrow("Owner stopped");
  expect(f.rows).toHaveLength(0);
  expect(f.ports.registration.upsertProject).not.toHaveBeenCalled();
});

it("keeps the new commands closed in v14 and old/future owner envelopes refuse", () => {
  const command = { action: "projects-list" as const, limit: 2 };
  expect(hostAdminRequest(command).adminVersion).toBe(14);
  for (let version = 1; version <= 13; version++)
    expect(hostAdminRequestSchema.safeParse({ adminVersion: version, command }).success).toBe(
      false,
    );
  expect(hostAdminRequestSchema.safeParse({ adminVersion: 15, command }).success).toBe(false);
  expect(hostProjectCommandSchema.safeParse({ ...command, secret: "no" }).success).toBe(false);
  expect(
    hostAdminResultSchema.safeParse({ adminVersion: 14, outcome: { ok: true, data: {} } }).success,
  ).toBe(true);
  expect(
    hostAdminResultSchema.safeParse({ adminVersion: 24, outcome: { ok: true, data: {} } }).success,
  ).toBe(true);
  expect(
    hostAdminResultSchema.safeParse({ adminVersion: 25, outcome: { ok: true, data: {} } }).success,
  ).toBe(false);
  expect(
    hostAdminRequest({ action: "sessions-export-start", threadId: "saved" }).adminVersion,
  ).toBe(13);
});

it.skipIf(process.platform !== "win32")(
  "preserves the selected WSL distribution without invoking a provider",
  async () => {
    const f = fixture();
    f.ports.registration.platform = "win32";
    const path = "\\\\wsl.localhost\\Selected Distro\\work\\repo";
    const result = await administerProject({ action: "projects-add", path }, f.context, f.ports);
    expect(result).toMatchObject({
      project: {
        location: {
          kind: "wsl",
          distro: "Selected Distro",
          linuxPath: "/work/repo",
          uncPath: path,
        },
      },
    });
    expect(f.ports.registration.getProjects).not.toHaveBeenCalled();
  },
);
