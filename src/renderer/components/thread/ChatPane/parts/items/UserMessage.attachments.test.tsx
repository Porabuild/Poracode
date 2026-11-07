import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const remote = vi.hoisted(() => ({ session: false }));
const lightbox = vi.hoisted(() => ({
  open: vi.fn<
    (attachments: Attachment[], index: number, imageUrlForPath?: (path: string) => string) => void
  >(),
}));

vi.mock("@/renderer/components/composer/ImageLightbox", () => ({
  openAttachmentLightbox: lightbox.open,
}));

vi.mock("@/renderer/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/renderer/bridge")>();
  return { ...actual, isRemoteSession: () => remote.session };
});
import type { Thread } from "@/shared/contracts";
import { attachmentImageUrl, type Attachment } from "@/renderer/components/composer/useAttachments";
import { localImageThumbUrl } from "@/shared/localImageThumb";
import { toLocalFileUrl } from "@/shared/promptContent";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import type { RemoteImageReadiness } from "@/renderer/state/remoteServers/environmentSessions";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { ChatPaneActionsContext } from "../../chatPaneActionsContext";
import { UserMessage } from "./UserMessage";

const threadId = "thread-1";
const imagePath = "C:\\tmp\\screenshot.png";

function thread(remoteServerId?: string): Thread {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: threadId,
    projectId: "project-1",
    title: "Thread",
    agentKind: "copilot",
    config: { model: "fixture" },
    status: "working",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: now,
    updatedAt: now,
    ...(remoteServerId ? { remoteServerId } : {}),
  };
}

function userMessage(): RuntimeChatItem {
  return {
    id: "user-1",
    type: "user_message",
    state: "completed",
    streams: {},
    payload: {
      content: [
        { kind: "text", text: "look at this" },
        {
          kind: "image",
          mimeType: "image/png",
          dataUrl: toLocalFileUrl(imagePath),
          path: imagePath,
          name: "screenshot.png",
          source: "attachment",
        },
      ],
    },
  };
}

function pendingReadiness(): RemoteImageReadiness & { requestPath: ReturnType<typeof vi.fn> } {
  const requestPath = vi.fn<(path: string) => void>();
  return {
    resolveRef: () => "",
    subscribeRef: () => () => undefined,
    requestRef: () => undefined,
    resolvePath: () => "",
    subscribePath: () => () => undefined,
    requestPath,
  };
}

function renderMessage(readiness: RemoteImageReadiness) {
  return render(
    <AppProvider>
      <ChatPaneActionsContext.Provider
        value={{ threadId, remoteImageReadiness: readiness, remoteImageRefUrl: () => "" }}
      >
        <UserMessage threadId={threadId} item={userMessage()} checkpointRevert={null} />
      </ChatPaneActionsContext.Provider>
    </AppProvider>,
  );
}

beforeEach(() => {
  remote.session = false;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  lightbox.open.mockReset();
  useAppStore.setState({ threads: [] });
  vi.unstubAllGlobals();
});

it("paints an own-host attachment from the local file URL without waiting on the image cache", () => {
  useAppStore.setState({ threads: [thread()] });
  const readiness = pendingReadiness();
  renderMessage(readiness);

  expect(screen.getByAltText("screenshot.png")).toHaveAttribute(
    "src",
    localImageThumbUrl(toLocalFileUrl(imagePath), 32),
  );
  expect(readiness.requestPath).not.toHaveBeenCalled();
});

it("opens the full-size original, not the thumbnail, from an own-host attachment", () => {
  useAppStore.setState({ threads: [thread()] });
  renderMessage(pendingReadiness());

  fireEvent.click(screen.getByRole("button", { name: "Preview screenshot.png" }));
  const [attachments, index, imageUrlForPath] = lightbox.open.mock.calls[0]!;
  expect(attachmentImageUrl(attachments[index]!, imageUrlForPath)).toBe(toLocalFileUrl(imagePath));
});

it("keeps a host-held attachment on the image cache instead of the local file protocol", () => {
  useAppStore.setState({ threads: [thread("desktop-1")] });
  const readiness = pendingReadiness();
  const { container } = renderMessage(readiness);

  expect(container.querySelector("img")?.getAttribute("src") ?? "").toBe("");
  expect(screen.getByRole("button", { name: "Preview screenshot.png" })).toBeInTheDocument();
  const [requestedPath, priority] = readiness.requestPath.mock.calls[0] ?? [];
  expect(requestedPath).toBe(imagePath);
  expect(priority).toMatch(/^(foreground|background)$/);
});

it("keeps a browser session without a remote id on the image cache", () => {
  remote.session = true;
  useAppStore.setState({ threads: [thread()] });
  const readiness = pendingReadiness();
  const { container } = renderMessage(readiness);

  expect(container.querySelector("img")?.getAttribute("src") ?? "").not.toContain(
    "poracode-local:",
  );
  expect(readiness.requestPath).toHaveBeenCalled();
});
