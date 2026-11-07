import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { composerDraftStorage } from "@/renderer/state/composerDraftStorage";
import { registerMountedProjectDraft } from "@/renderer/state/mountedProjectDrafts";
import { switchDraftProject } from "./switchDraftProject";

vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({}), isRemoteSession: () => false }));
const source: Project = {
  id: "source",
  name: "Project",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-11-01",
};
const target: Project = {
  ...source,
  id: "target",
  remoteServerId: "host",
  remoteId: "host-project",
};
const image = {
  id: "image",
  path: "poracode-draft-asset:123/Image%201.png",
  name: "Image 1.png",
  isImage: true,
};
const content = {
  segments: [{ kind: "text" as const, content: "Inspect this" }],
  attachments: [image],
};

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    projects: [source, target],
    draftContents: {},
    draftContentDiscardRequests: {},
    view: { kind: "draft", projectId: source.id },
  });
  useAppStore.getState().saveDraftContent(source.id, content);
});

describe("client-owned environment selection", () => {
  it("moves a local draft immediately, preserving its stable identity and image reference", () => {
    const identity = composerDraftStorage()?.currentIdentity("project", source.id);
    switchDraftProject(source.id, target.id);
    expect(useAppStore.getState().view).toEqual({ kind: "draft", projectId: target.id });
    expect(useAppStore.getState().draftContents).toEqual({ [target.id]: content });
    expect(composerDraftStorage()?.currentIdentity("project", target.id)?.draftId).toBe(
      identity?.draftId,
    );
  });
  it("reads live content without waiting for attachment import or contacting a host", () => {
    const live = { ...content, attachments: [{ ...image, uploading: true }] };
    const unregister = registerMountedProjectDraft(source.id, {
      read: () => live,
      restore: () => {},
      transfer: () => {},
    });
    try {
      expect(switchDraftProject(source.id, target.id)).toBeUndefined();
      expect(useAppStore.getState().draftContents[target.id]?.attachments[0]?.path).toBe(
        image.path,
      );
    } finally {
      unregister();
    }
  });
  it("preserves a legacy image's source instead of interpreting its path on the new host", () => {
    useAppStore.getState().saveDraftContent(source.id, {
      ...content,
      attachments: [{ ...image, path: "/local/image.png" }],
    });
    switchDraftProject(source.id, target.id);
    expect(useAppStore.getState().draftContents[target.id]?.attachments[0]).toMatchObject({
      path: "/local/image.png",
      source: {},
    });
  });
  it("preserves an existing destination draft when moving content", () => {
    useAppStore.getState().saveDraftContent(target.id, {
      segments: [{ kind: "text", content: "Existing" }],
      attachments: [],
    });
    switchDraftProject(source.id, target.id);
    expect(useAppStore.getState().draftContents[target.id]?.segments).toEqual([
      ...content.segments,
      { kind: "text", content: "\n\n" },
      { kind: "text", content: "Existing" },
    ]);
  });
  it("hands the target to an embedded surface without navigating the main view", () => {
    const select = vi.fn<(id: string) => void>();
    switchDraftProject(source.id, target.id, { onSelectProject: select });
    expect(select).toHaveBeenCalledWith(target.id);
    expect(useAppStore.getState().view).toEqual({ kind: "draft", projectId: source.id });
  });
});
