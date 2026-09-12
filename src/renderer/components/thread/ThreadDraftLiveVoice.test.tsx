// @vitest-environment jsdom

import type { ReactElement, ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Project, Thread } from "@/shared/contracts";
import type { PoracodeBridge } from "@/shared/ipc";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useBrowserAttachInbox } from "@/renderer/state/browserAttachInbox";
import { useComposerInputInbox } from "@/renderer/state/composerInputInbox";
import { liveVoice, useLiveVoice } from "@/renderer/speech/liveVoice";

const { bridge, composerSpy } = vi.hoisted(() => ({
  bridge: {
    platform: "win32",
    windowKind: "main",
    scanSkills: vi.fn<NonNullable<PoracodeBridge["scanSkills"]>>(),
    connectThreadVoice: vi.fn<PoracodeBridge["connectThreadVoice"]>(),
    disconnectThreadVoice: vi.fn<PoracodeBridge["disconnectThreadVoice"]>(),
    onSupervisorEvent: vi.fn<PoracodeBridge["onSupervisorEvent"]>(),
    pickFiles: vi.fn<PoracodeBridge["pickFiles"]>(),
    saveClipboardImage: vi.fn<PoracodeBridge["saveClipboardImage"]>(),
  },
  composerSpy: vi.fn<(props: unknown) => void>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
  isQuickComposerWindow: () => false,
  isRemoteSession: () => false,
}));

vi.mock("./ThreadComposer", () => ({
  ThreadComposer: (props: { inputContent?: ReactNode }) => {
    composerSpy(props);
    return <div data-testid="draft-composer">{props.inputContent}</div>;
  },
}));

import "@/renderer/components/providers/bootstrap";
import { ThreadDraftComposerArea, type DraftStartInput } from "./ThreadDraftComposerArea";

const project: Project = {
  id: "voice-project",
  name: "Voice project",
  location: { kind: "windows", path: "C:\\voice-project" },
  createdAt: "2026-09-09T00:00:00.000Z",
};

const agentStatus: AgentStatus = {
  kind: "codex",
  label: "Agent",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [{ id: "voice-model", label: "Voice model" }],
    efforts: [],
    modelEfforts: {},
    modes: ["agent"],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "server",
    presentationMode: "gui",
    presentationModes: ["gui"],
    settingDefs: [],
    liveVoice: { transport: "webrtc", dataChannel: "audio-events" },
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeStream(track: { enabled: boolean; stop: () => void; onended: (() => void) | null }) {
  return {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
}

class Peer {
  iceGatheringState = "complete";
  connectionState = "new";
  localDescription = { sdp: "offer" };
  onconnectionstatechange: (() => void) | null = null;
  ontrack: ((event: { track: MediaStreamTrack; streams: MediaStream[] }) => void) | null = null;
  addTrack = vi.fn<(track: MediaStreamTrack, stream: MediaStream) => void>();
  createDataChannel = vi.fn<() => { onclose: null; onerror: null }>(() => ({
    onclose: null,
    onerror: null,
  }));
  createOffer = vi.fn<() => Promise<RTCSessionDescriptionInit>>(async () => ({
    type: "offer",
    sdp: "offer",
  }));
  setLocalDescription = vi.fn<() => Promise<void>>(async () => {});
  setRemoteDescription = vi.fn<() => Promise<void>>(async () => {});
  close = vi.fn<() => void>();
  addEventListener = vi.fn<() => void>();
  removeEventListener = vi.fn<() => void>();
}

class Playback {
  autoplay = false;
  srcObject: MediaStream | null = null;
  play = vi.fn<() => Promise<void>>(async () => {});
  pause = vi.fn<() => void>();
}

type ComposerProps = {
  submitControl?: ReactElement<{ onStart: () => void; scopeId: string }>;
  inputContent?: ReactElement<{
    onPasteImage?: (file: File) => void;
    onTextChange?: (hasText: boolean) => void;
  }>;
  afterControls?: ReactElement<{ onPickFiles: () => void }>;
  onAttachFiles?: (paths: string[]) => void;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
};

function currentComposerProps(): ComposerProps {
  const props = composerSpy.mock.lastCall?.[0] as ComposerProps | undefined;
  if (!props) throw new Error("Expected draft composer props");
  return props;
}

function renderComposer(
  onStart: (input: DraftStartInput) => void | Promise<void> = () => {},
  options: { paneId?: string; pickFiles?: () => Promise<string[] | null> } = {},
) {
  return render(
    <ThreadDraftComposerArea
      project={project}
      {...(options.paneId ? { paneId: options.paneId } : {})}
      selectedAgent={agentStatus}
      controls={[]}
      config={{ model: "voice-model" }}
      compact={false}
      paneCount={1}
      gitBranch={undefined}
      worktreeMode={false}
      supportsModePicker={false}
      presentationMode="gui"
      {...(options.pickFiles ? { pickFiles: options.pickFiles } : {})}
      onConfigChange={() => {}}
      onWorktreeModeChange={() => {}}
      onSwitchBranch={() => {}}
      onRememberPresentationMode={() => {}}
      onStart={onStart}
    />,
  );
}

function resetStores() {
  useAppStore.setState({
    threads: [],
    view: { kind: "home" },
    pendingComposerSeeds: {},
    draftContents: {},
  });
  useBrowserAttachInbox.setState({ itemsByThread: {} });
  useComposerInputInbox.setState({ itemsByComposer: {} });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStores();
  bridge.scanSkills.mockResolvedValue({
    skills: [],
    effectiveSkillIds: [],
    invocation: null,
    issues: [],
    canLinkToGlobal: true,
  });
  bridge.connectThreadVoice.mockResolvedValue({ answerSdp: "answer" });
  bridge.disconnectThreadVoice.mockResolvedValue(undefined);
  bridge.onSupervisorEvent.mockReturnValue(() => {});
  bridge.pickFiles.mockResolvedValue(null);
  bridge.saveClipboardImage.mockResolvedValue("C:\\voice-project\\clipboard.png");
  vi.stubGlobal("RTCPeerConnection", Peer);
  vi.stubGlobal("Audio", Playback);
  composerSpy.mockClear();
});

afterEach(async () => {
  await liveVoice.stop();
  cleanup();
  vi.unstubAllGlobals();
  resetStores();
});

describe("draft live voice ownership", () => {
  it("preserves rich editor content and direct attachments when permission is pending", async () => {
    const permission = deferred<MediaStream>();
    const track = { enabled: true, stop: vi.fn<() => void>(), onended: null };
    const stream = makeStream(track);
    const getUserMedia = vi.fn<() => Promise<MediaStream>>(() => permission.promise);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const onStart = vi.fn<(input: unknown) => void>();

    renderComposer(onStart);
    await waitFor(() => expect(currentComposerProps().submitControl).toBeDefined());
    const voice = currentComposerProps().submitControl!;

    act(() => voice.props.onStart());
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());

    const editor = screen.getByRole("textbox");
    act(() => {
      editor.innerHTML =
        '<span data-mention-path="C:\\src\\main.ts">main.ts</span> ask while permission is pending';
      fireEvent.input(editor);
      currentComposerProps().onAttachFiles?.(["C:\\draft-note.txt"]);
      permission.resolve(stream);
    });

    await waitFor(() => expect(track.stop).toHaveBeenCalledOnce());
    expect(onStart).not.toHaveBeenCalled();

    act(() => currentComposerProps().onSubmit());

    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart.mock.calls[0]?.[0]).toMatchObject({
      segments: [
        { kind: "attachment", path: "C:\\draft-note.txt", mimeType: "text/plain" },
        { kind: "file", path: "C:\\src\\main.ts" },
        { kind: "text", content: " ask while permission is pending" },
      ],
    });

    expect(track.stop).toHaveBeenCalledOnce();
  });

  it("preflights a browser attachment queued before the passive drain", async () => {
    const permission = deferred<MediaStream>();
    const track = { enabled: true, stop: vi.fn<() => void>(), onended: null };
    const stream = makeStream(track);
    const getUserMedia = vi.fn<() => Promise<MediaStream>>(() => permission.promise);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const onStart = vi.fn<(input: unknown) => void>();
    const paneId = "draft:voice-project#queued-pane";
    const item = {
      threadId: paneId,
      attachmentPath: "C:\\selected\\element.png",
      attachmentName: "element.png",
      mimeType: "image/png",
      selector: "#hero",
      sourceUrl: "https://example.test",
    };

    // Register this reaction before LiveVoiceController's await continuation.
    // The queue is therefore visible to final preflight even though React has
    // not yet run the inbox-draining effect.
    void permission.promise.then(() => useBrowserAttachInbox.getState().enqueue(item));

    renderComposer(onStart, { paneId });
    await waitFor(() => expect(currentComposerProps().submitControl).toBeDefined());
    act(() => currentComposerProps().submitControl!.props.onStart());
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());

    permission.resolve(stream);
    await waitFor(() => expect(track.stop).toHaveBeenCalledOnce());
    expect(onStart).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(useBrowserAttachInbox.getState().itemsByThread[paneId]).toBeUndefined();
    });
    act(() => currentComposerProps().onPromptChange("Review this attachment"));
    act(() => currentComposerProps().onSubmit());
    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart.mock.calls[0]?.[0]).toMatchObject({
      segments: [{ kind: "attachment", path: item.attachmentPath, mimeType: item.mimeType }],
    });
  });

  it("preflights composer inbox and seed work queued in the same turn", async () => {
    const permission = deferred<MediaStream>();
    const track = { enabled: true, stop: vi.fn<() => void>(), onended: null };
    const getUserMedia = vi.fn<() => Promise<MediaStream>>(() => permission.promise);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const onStart = vi.fn<(input: unknown) => void>();
    const paneId = "draft:voice-project#queued-input";

    void permission.promise.then(() => {
      useComposerInputInbox
        .getState()
        .enqueue(paneId, [{ kind: "text", content: "queued from pane" }]);
      useAppStore.getState().setComposerSeed(project.id, "queued seed");
    });

    renderComposer(onStart, { paneId });
    await waitFor(() => expect(currentComposerProps().submitControl).toBeDefined());
    act(() => currentComposerProps().submitControl!.props.onStart());
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());

    permission.resolve(makeStream(track));
    await waitFor(() => expect(track.stop).toHaveBeenCalledOnce());
    expect(onStart).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(useComposerInputInbox.getState().itemsByComposer[paneId]).toBeUndefined();
      expect(useAppStore.getState().pendingComposerSeeds[project.id]).toBeUndefined();
      expect(screen.getByRole("textbox")).toHaveTextContent("queued seed");
      expect(screen.getByRole("textbox")).toHaveTextContent("queued from pane");
    });
    act(() => currentComposerProps().onSubmit());
    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart.mock.calls[0]?.[0]).toMatchObject({
      prompt: "queued seed\n\nqueued from pane",
    });
  });

  it("cancels before an unresolved picker and blocks a second voice attempt", async () => {
    const permission = deferred<MediaStream>();
    const picker = deferred<string[] | null>();
    const track = { enabled: true, stop: vi.fn<() => void>(), onended: null };
    const stream = makeStream(track);
    const getUserMedia = vi.fn<() => Promise<MediaStream>>(() => permission.promise);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const onStart = vi.fn<(input: unknown) => void>();

    renderComposer(onStart, { pickFiles: () => picker.promise });
    await waitFor(() => expect(currentComposerProps().submitControl).toBeDefined());
    act(() => currentComposerProps().submitControl!.props.onStart());
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());

    act(() => currentComposerProps().afterControls!.props.onPickFiles());
    expect(useLiveVoice.getState().phase).toBe("idle");

    permission.resolve(stream);
    await waitFor(() => expect(track.stop).toHaveBeenCalledOnce());

    act(() => currentComposerProps().submitControl!.props.onStart());
    expect(getUserMedia).toHaveBeenCalledOnce();

    picker.resolve(["C:\\picked\\notes.md"]);
    await waitFor(() => expect(currentComposerProps().submitControl).toBeUndefined());
    act(() => currentComposerProps().onPromptChange("Review this attachment"));
    act(() => currentComposerProps().onSubmit());

    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart.mock.calls[0]?.[0]).toMatchObject({
      segments: [{ kind: "attachment", path: "C:\\picked\\notes.md", mimeType: "text/markdown" }],
    });
  });

  it("keeps a delayed clipboard save pending and preserves its successful attachment", async () => {
    const permission = deferred<MediaStream>();
    const save = deferred<string>();
    const track = { enabled: true, stop: vi.fn<() => void>(), onended: null };
    const stream = makeStream(track);
    const getUserMedia = vi.fn<() => Promise<MediaStream>>(() => permission.promise);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    bridge.saveClipboardImage.mockReturnValue(save.promise);
    const onStart = vi.fn<(input: unknown) => void>();

    renderComposer(onStart);
    await waitFor(() => expect(currentComposerProps().submitControl).toBeDefined());
    act(() => currentComposerProps().submitControl!.props.onStart());
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());

    const file = new File([new Uint8Array([1, 2, 3])], "clipboard.png", { type: "image/png" });
    act(() => currentComposerProps().inputContent!.props.onPasteImage?.(file));
    expect(useLiveVoice.getState().phase).toBe("idle");

    permission.resolve(stream);
    await waitFor(() => expect(track.stop).toHaveBeenCalledOnce());
    act(() => currentComposerProps().submitControl!.props.onStart());
    expect(getUserMedia).toHaveBeenCalledOnce();

    save.resolve("C:\\voice-project\\saved-image.png");
    await waitFor(() => expect(currentComposerProps().submitControl).toBeUndefined());
    act(() => currentComposerProps().onPromptChange("Review this attachment"));
    act(() => currentComposerProps().onSubmit());

    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart.mock.calls[0]?.[0]).toMatchObject({
      segments: [
        { kind: "attachment", path: "C:\\voice-project\\saved-image.png", mimeType: "image/png" },
      ],
    });
  });

  it("allows a voice retry after a clipboard save failure decrements pending work", async () => {
    const firstPermission = deferred<MediaStream>();
    const secondPermission = deferred<MediaStream>();
    const firstTrack = { enabled: true, stop: vi.fn<() => void>(), onended: null };
    const secondTrack = { enabled: true, stop: vi.fn<() => void>(), onended: null };
    const getUserMedia = vi
      .fn<() => Promise<MediaStream>>()
      .mockReturnValueOnce(firstPermission.promise)
      .mockReturnValueOnce(secondPermission.promise);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const saveError = new Error("save failed");
    bridge.saveClipboardImage.mockRejectedValueOnce(saveError);

    renderComposer();
    await waitFor(() => expect(currentComposerProps().submitControl).toBeDefined());
    act(() => currentComposerProps().submitControl!.props.onStart());
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());

    const file = new File([new Uint8Array([1])], "clipboard.png", { type: "image/png" });
    act(() => currentComposerProps().inputContent!.props.onPasteImage?.(file));
    firstPermission.resolve(makeStream(firstTrack));
    await waitFor(() => expect(firstTrack.stop).toHaveBeenCalledOnce());
    await waitFor(() => expect(currentComposerProps().submitControl).toBeDefined());

    act(() => currentComposerProps().submitControl!.props.onStart());
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    act(() => currentComposerProps().inputContent!.props.onTextChange?.(true));
    secondPermission.resolve(makeStream(secondTrack));
    await waitFor(() => expect(secondTrack.stop).toHaveBeenCalledOnce());
  });

  it("hands off an unchanged empty draft once microphone permission succeeds", async () => {
    const track = { enabled: true, stop: vi.fn<() => void>(), onended: null };
    const stream = makeStream(track);
    const getUserMedia = vi.fn<() => Promise<MediaStream>>(async () => stream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const onStart = vi.fn<(input: DraftStartInput) => void>((input) => {
      const thread = { id: input.threadId, config: { model: "voice-model" } } as Thread;
      useAppStore.setState({
        threads: [thread],
        view: { kind: "thread", panes: [input.threadId!] },
      });
    });

    renderComposer(onStart);
    await waitFor(() => expect(currentComposerProps().submitControl).toBeDefined());
    act(() => currentComposerProps().submitControl!.props.onStart());

    await waitFor(() => expect(onStart).toHaveBeenCalledOnce());
    expect(onStart.mock.calls[0]?.[0]).toMatchObject({ prompt: "", threadId: expect.any(String) });
    expect(onStart.mock.calls[0]?.[0]).not.toHaveProperty("segments");
    await waitFor(() => expect(bridge.connectThreadVoice).toHaveBeenCalledOnce());
  });

  it("releases an abandoned permission request when the draft unmounts", async () => {
    const permission = deferred<MediaStream>();
    const track = { enabled: true, stop: vi.fn<() => void>(), onended: null };
    const stream = makeStream(track);
    const getUserMedia = vi.fn<() => Promise<MediaStream>>(() => permission.promise);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const onStart = vi.fn<(input: unknown) => void>();

    const rendered = renderComposer(onStart);
    await waitFor(() => expect(currentComposerProps().submitControl).toBeDefined());
    act(() => currentComposerProps().submitControl!.props.onStart());
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());

    rendered.unmount();
    permission.resolve(stream);
    await waitFor(() => expect(track.stop).toHaveBeenCalledOnce());
    expect(onStart).not.toHaveBeenCalled();
  });

  it("uses each draft pane inbox as the voice owner scope", async () => {
    render(
      <>
        <ThreadDraftComposerArea
          project={project}
          paneId="draft:voice-project#left"
          selectedAgent={agentStatus}
          controls={[]}
          config={{ model: "voice-model" }}
          compact={false}
          paneCount={2}
          gitBranch={undefined}
          worktreeMode={false}
          supportsModePicker={false}
          presentationMode="gui"
          onConfigChange={() => {}}
          onWorktreeModeChange={() => {}}
          onSwitchBranch={() => {}}
          onRememberPresentationMode={() => {}}
          onStart={() => {}}
        />
        <ThreadDraftComposerArea
          project={project}
          paneId="draft:voice-project#right"
          selectedAgent={agentStatus}
          controls={[]}
          config={{ model: "voice-model" }}
          compact={false}
          paneCount={2}
          gitBranch={undefined}
          worktreeMode={false}
          supportsModePicker={false}
          presentationMode="gui"
          onConfigChange={() => {}}
          onWorktreeModeChange={() => {}}
          onSwitchBranch={() => {}}
          onRememberPresentationMode={() => {}}
          onStart={() => {}}
        />
      </>,
    );

    await waitFor(() => {
      const scopes = new Set(
        composerSpy.mock.calls.map(
          ([props]) => (props as ComposerProps).submitControl?.props.scopeId,
        ),
      );
      expect(scopes).toEqual(new Set(["draft:voice-project#left", "draft:voice-project#right"]));
    });
  });
});
