import { describe, expect, it, vi } from "vitest";
import type { ImportableSession, ImportedSessionProvider } from "@/shared/contracts";

// The folder comparison follows the host's rule, exactly as the scan's does.
const host = vi.hoisted(() => ({ windows: true }));
vi.mock("@/renderer/bridge", () => ({ isWindows: () => host.windows }));

import { ALL, applyImportFilters, EMPTY_FILTERS, reconcileFilters } from "./importFilters";

function session(overrides: Partial<ImportableSession>): ImportableSession {
  return {
    id: "x",
    provider: "codex",
    agentKind: "codex",
    providerSessionId: "x",
    path: "/x.jsonl",
    preview: "",
    cwdExists: true,
    ...overrides,
  };
}

const SESSIONS: ImportableSession[] = [
  session({ id: "1", provider: "codex", agentKind: "codex", cwd: "F:\\a", preview: "alpha" }),
  session({ id: "2", provider: "codex", agentKind: "codex:work", cwd: "F:\\b", preview: "beta" }),
  session({ id: "3", provider: "claude", agentKind: "claude", cwd: "F:\\a", preview: "gamma" }),
];

describe("reconcileFilters", () => {
  const facets = {
    providers: ["claude", "codex"] as ImportedSessionProvider[],
    accounts: ["claude"],
    folders: ["F:\\a"],
  };

  it("drops a selection the scan no longer offers", () => {
    expect(
      reconcileFilters({ ...EMPTY_FILTERS, account: "codex:work", folder: "F:\\a" }, facets),
    ).toMatchObject({ account: ALL, folder: "F:\\a" });
  });

  it("leaves the query and the valid selections alone", () => {
    expect(
      reconcileFilters({ provider: "codex", account: "claude", folder: ALL, query: "bet" }, facets),
    ).toEqual({ provider: "codex", account: "claude", folder: ALL, query: "bet" });
  });
});

describe("folder comparison", () => {
  // `ImportSessionsDialog` seeds the folder filter from a *project* path,
  // which routinely differs from the transcript's recorded `cwd` by
  // drive-letter case or a trailing separator. The scan already treats those
  // as the same folder; comparing exactly here hid every session the scan
  // had just returned for that project.
  it("keeps a session whose cwd differs only by case or a trailing separator", () => {
    const here = session({ id: "here", cwd: "F:\\repo" });
    expect(
      applyImportFilters([here], { ...EMPTY_FILTERS, folder: "f:\\repo\\" }).map((s) => s.id),
    ).toEqual(["here"]);
    expect(
      applyImportFilters([here], { ...EMPTY_FILTERS, folder: "F:/repo" }).map((s) => s.id),
    ).toEqual(["here"]);
  });

  it("still tells two different folders apart", () => {
    const here = session({ id: "here", cwd: "F:\\repo" });
    expect(applyImportFilters([here], { ...EMPTY_FILTERS, folder: "F:\\other" })).toEqual([]);
  });

  it("is case-sensitive off win32, where two folders can differ only by case", () => {
    host.windows = false;
    try {
      const upper = session({ id: "upper", cwd: "/home/u/Repo" });
      expect(applyImportFilters([upper], { ...EMPTY_FILTERS, folder: "/home/u/repo" })).toEqual([]);
      expect(
        applyImportFilters([upper], { ...EMPTY_FILTERS, folder: "/home/u/Repo/" }).map((s) => s.id),
      ).toEqual(["upper"]);
    } finally {
      host.windows = true;
    }
  });

  it("adopts the scan's spelling of a folder rather than dropping the selection", () => {
    // Reconciling by exact membership reset the folder to "All projects",
    // so a dialog opened for one project silently listed every session on
    // the machine.
    expect(
      reconcileFilters(
        { ...EMPTY_FILTERS, folder: "f:\\repo\\" },
        { providers: [], accounts: [], folders: ["F:\\repo"] },
      ).folder,
    ).toBe("F:\\repo");
  });
});

describe("applyImportFilters", () => {
  it("matches the search against the provider's title too", () => {
    const named = session({ id: "codex:named", title: "Deploy pipeline", preview: "hi" });
    expect(applyImportFilters([named], { ...EMPTY_FILTERS, query: "pipeline" })).toEqual([named]);
    expect(applyImportFilters([named], { ...EMPTY_FILTERS, query: "nope" })).toEqual([]);
  });

  it("combines every facet with the search", () => {
    expect(
      applyImportFilters(SESSIONS, {
        provider: "codex",
        account: ALL,
        folder: ALL,
        query: "bet",
      }).map((s) => s.id),
    ).toEqual(["2"]);
  });
});
