import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatExternalLink } from "./ChatExternalLink";

const { resolveLinkMetadata } = vi.hoisted(() => ({
  resolveLinkMetadata:
    vi.fn<
      (payload: { url: string }) => Promise<{ title: string | null; description: string | null }>
    >(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ resolveLinkMetadata }),
}));

describe("ChatExternalLink", () => {
  beforeEach(() => {
    resolveLinkMetadata.mockReset().mockResolvedValue({ title: null, description: null });
  });

  it("renders a named link as an inline chip led by the destination favicon", () => {
    const { container } = render(
      <ChatExternalLink href="https://www.example.test/docs">Documentation</ChatExternalLink>,
    );

    const link = screen.getByRole("link", { name: "Documentation" });
    const favicon = container.querySelector("img");
    expect(link).toHaveClass("poracode-inline-path-chip");
    expect(link.firstElementChild).toHaveClass("poracode-inline-path-chip__icon");
    expect(link.firstElementChild).toContainElement(favicon);
    expect(link.lastElementChild).toHaveClass("poracode-inline-path-chip__name");
    expect(link.lastElementChild).toHaveTextContent("Documentation");
    expect(favicon).toHaveAttribute("src", "https://www.example.test/favicon.ico");
    expect(favicon).toHaveAttribute("referrerPolicy", "no-referrer");
    expect(favicon).toHaveClass("bg-transparent");
    expect(favicon?.getAttribute("style")).toContain("drop-shadow");
    expect(link).not.toHaveTextContent("www.example.test");
    expect(container.querySelector(".lucide-external-link")).not.toBeInTheDocument();
  });

  it("resolves a raw URL to its page title and shows details on hover", async () => {
    const href = "https://example.test/a/long/path";
    resolveLinkMetadata.mockResolvedValue({
      title: "A beautiful page title",
      description: "A concise page description",
    });
    render(
      <ChatExternalLink href={href} resolveTitle>
        {href}
      </ChatExternalLink>,
    );

    const link = await screen.findByRole("link", { name: "A beautiful page title" });
    expect(link).not.toHaveTextContent(href);
    expect(resolveLinkMetadata).toHaveBeenCalledWith({ url: href });

    fireEvent.pointerMove(document.body, { pointerType: "mouse" });
    fireEvent.pointerEnter(link.parentElement!, { pointerType: "mouse" });
    expect(await screen.findByText("A concise page description")).toBeInTheDocument();
    expect(screen.getByText(href)).toBeInTheDocument();
  });

  it("shows a GitHub pull request title after its number", async () => {
    const href = "https://github.com/acme/repo/pull/42";
    resolveLinkMetadata.mockResolvedValue({
      title: "Add link chips by dev · Pull Request #42 · acme/repo",
      description: null,
    });
    render(
      <ChatExternalLink href={href} resolveTitle>
        #42
      </ChatExternalLink>,
    );

    expect(await screen.findByRole("link", { name: "#42 · Add link chips" })).toHaveAttribute(
      "href",
      href,
    );
  });

  it("uses the theme-colored GitHub mark instead of the dark site favicon", () => {
    const { container } = render(
      <ChatExternalLink href="https://github.com/acme/repo">Repository</ChatExternalLink>,
    );

    expect(container.querySelector("img")).toBeNull();
    const mark = container.querySelector("svg");
    expect(mark).toHaveClass("text-foreground");
    expect(mark).toHaveAttribute("aria-hidden", "true");
  });

  it("tries the site favicon, then Google, then a globe, and resets for a new destination", () => {
    const { container, rerender } = render(
      <ChatExternalLink href="https://first.test/docs">First</ChatExternalLink>,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://www.google.com/s2/favicons?domain=first.test&sz=64",
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".lucide-globe")).toBeInTheDocument();

    rerender(<ChatExternalLink href="https://second.test/docs">Second</ChatExternalLink>);
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://second.test/favicon.ico",
    );
    expect(container.querySelector(".lucide-globe")).not.toBeInTheDocument();
  });

  it("keeps non-web external links usable without a favicon or metadata request", () => {
    const { container } = render(
      <ChatExternalLink href="mailto:help@example.test">help@example.test</ChatExternalLink>,
    );

    expect(screen.getByRole("link", { name: "help@example.test" })).toHaveAttribute(
      "href",
      "mailto:help@example.test",
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".lucide-globe")).toBeInTheDocument();
    expect(resolveLinkMetadata).not.toHaveBeenCalled();
  });
});
