import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { ProjectIcon, useProjectIconNode } from "./ProjectIcon";

const { detectProjectIcon, session } = vi.hoisted(() => ({
  detectProjectIcon: vi.fn<() => Promise<string | null>>(),
  session: { remote: false },
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ detectProjectIcon }),
  isRemoteSession: () => session.remote,
}));

function projectWith(icon?: string, remoteServerId?: string): Project {
  return {
    id: "project-1",
    name: "Test project",
    location: { kind: "windows", path: "E:/work/app" },
    ...(icon ? { icon } : {}),
    ...(remoteServerId ? { remoteServerId } : {}),
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Mirrors list rows: null from the hook means "render the default glyph". */
function IconWithFallback(props: { project: Project }) {
  const icon = useProjectIconNode(props.project, "size-4");
  return icon ?? <span data-testid="default-glyph" />;
}

describe("ProjectIcon", () => {
  it("renders a lucide glyph for lucide icons", () => {
    const { container } = render(<ProjectIcon project={projectWith("lucide:rocket")} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("tints a glyph with the stored colour and ignores an unknown one", () => {
    const tinted = render(<ProjectIcon project={projectWith("lucide:rocket:red")} />);
    expect(tinted.container.querySelector("svg")?.getAttribute("style")).toContain(
      "var(--project-icon-red)",
    );

    // Custom colours ride in the same slot as hex digits (jsdom reports the
    // parsed rgb form of #5f6cd9).
    const custom = render(<ProjectIcon project={projectWith("lucide:rocket:5f6cd9")} />);
    expect(custom.container.querySelector("svg")?.getAttribute("style")).toContain(
      "rgb(95, 108, 217)",
    );

    // A colour from another app version degrades to untinted, never to a
    // missing icon.
    const unknown = render(<ProjectIcon project={projectWith("lucide:rocket:chartreuse")} />);
    const svg = unknown.container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("style")).toBeNull();
  });

  it("falls back for unknown lucide ids and malformed values", () => {
    render(<IconWithFallback project={projectWith("lucide:not-a-real-icon")} />);
    render(<IconWithFallback project={projectWith("file:../secret.png")} />);
    expect(screen.getAllByTestId("default-glyph")).toHaveLength(2);
  });

  it("renders a project-relative image URL for file icons", () => {
    const { container } = render(<ProjectIcon project={projectWith("file:public/favicon.png")} />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toContain("poracode-local://");
    expect(img!.getAttribute("src")).toContain("public/favicon.png");
  });

  it("falls back to the default glyph when the image fails to load", () => {
    const { container } = render(
      <IconWithFallback project={projectWith("file:public/favicon.png")} />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();

    fireEvent.error(img!);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("default-glyph")).toBeInTheDocument();
  });

  it("never resolves file icons for projects mirrored from another machine", () => {
    render(<IconWithFallback project={projectWith("file:public/favicon.png", "desktop-remote")} />);
    expect(screen.getByTestId("default-glyph")).toBeInTheDocument();
  });

  it("never resolves file icons when only the location carries the remote marker", () => {
    const project = projectWith("file:public/favicon.png");
    render(
      <IconWithFallback
        project={{
          ...project,
          location: { ...project.location, remoteServerId: "desktop-remote" },
        }}
      />,
    );
    expect(screen.getByTestId("default-glyph")).toBeInTheDocument();
  });
});

describe("auto project icons", () => {
  function autoProject(id: string): Project {
    return {
      id,
      name: "Test project",
      location: { kind: "windows", path: "E:/work/app" },
      icon: "auto",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
  }

  it("renders the detected file and probes the folder once per project", async () => {
    detectProjectIcon.mockReset().mockResolvedValue("public/favicon.png");
    const project = autoProject("auto-detect");

    const { container, rerender } = render(<IconWithFallback project={project} />);

    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    rerender(<IconWithFallback project={{ ...project }} />);
    expect(detectProjectIcon).toHaveBeenCalledTimes(1);
  });

  it("never probes in a remote session, where the bridge has no detector", async () => {
    detectProjectIcon.mockReset().mockResolvedValue("public/favicon.png");
    session.remote = true;
    try {
      render(<IconWithFallback project={autoProject("auto-remote")} />);
      await waitFor(() => expect(screen.getByTestId("default-glyph")).toBeInTheDocument());
      expect(detectProjectIcon).not.toHaveBeenCalled();
    } finally {
      session.remote = false;
    }
  });
});
