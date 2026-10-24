import type { AgentVision } from "@/shared/agentVision";
import { subscribeAgentVisionStream } from "./agentVisionStream";

interface PreviewWindow {
  key: string;
  video: HTMLVideoElement;
  stream: MediaStream;
  stop: () => void;
}
let current: PreviewWindow | null = null;
let generation = 0;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

export function subscribeAgentVisionPictureInPicture(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isAgentVisionPictureInPicture(
  ownerId: string | undefined,
  threadId: string,
): boolean {
  return (
    current?.key === JSON.stringify([ownerId, threadId]) &&
    document.pictureInPictureElement === current.video
  );
}

function release(preview: PreviewWindow) {
  if (current !== preview) return;
  current = null;
  preview.stop();
  for (const track of preview.stream.getTracks()) track.stop();
  preview.video.pause();
  preview.video.srcObject = null;
  notify();
}

/** The browser owns the one always-on-top window; its stream outlives the panel. */
export async function toggleAgentVisionPictureInPicture(
  ownerId: string | undefined,
  threadId: string,
  vision: AgentVision,
): Promise<void> {
  const key = JSON.stringify([ownerId, threadId]);
  const closeOnly = current?.key === key;
  const token = ++generation;
  if (current) {
    const previous = current;
    if (document.pictureInPictureElement === previous.video) await document.exitPictureInPicture();
    release(previous);
  }
  if (closeOnly || !vision.image || token !== generation) return;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;
  let frameGeneration = 0;
  async function paint(frame: AgentVision | null) {
    const frameToken = ++frameGeneration;
    if (!frame?.image) {
      context!.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const image = new Image();
    image.src = frame.image;
    await image.decode();
    if (token !== generation || frameToken !== frameGeneration) return;
    if (canvas.width !== image.naturalWidth || canvas.height !== image.naturalHeight) {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
    }
    context!.drawImage(image, 0, 0);
  }
  await paint(vision);
  if (token !== generation) return;
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  const stream = canvas.captureStream(15);
  video.srcObject = stream;
  const preview: PreviewWindow = {
    key,
    video,
    stream,
    stop: subscribeAgentVisionStream(ownerId, threadId, (frame) => {
      void paint(frame).catch(() => {});
    }),
  };
  current = preview;
  video.addEventListener("leavepictureinpicture", () => release(preview), { once: true });
  try {
    await video.play();
    if (token !== generation) {
      release(preview);
      return;
    }
    await video.requestPictureInPicture();
    if (token !== generation) {
      if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
      release(preview);
    } else notify();
  } catch (error) {
    release(preview);
    throw error;
  }
}
