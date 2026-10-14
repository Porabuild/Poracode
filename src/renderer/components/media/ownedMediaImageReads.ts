const IMAGE_ACTION_DEADLINE_MS = 20_000;

/** A pending Copy/Save keeps its grant until the bounded read settles. */
export function ownMediaImageReads(
  read: (signal: AbortSignal) => Promise<Uint8Array<ArrayBuffer>>,
  release: () => Promise<void>,
) {
  const active = new Set<Promise<Uint8Array<ArrayBuffer>>>();
  let retirement: Promise<void> | undefined;
  return {
    readImageBytes(): Promise<Uint8Array<ArrayBuffer>> {
      if (retirement) return Promise.reject(new Error("Media source was released."));
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout>;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Media image read timed out."));
        }, IMAGE_ACTION_DEADLINE_MS);
      });
      const reading = Promise.race([
        Promise.resolve().then(() => read(controller.signal)),
        deadline,
      ]).finally(() => clearTimeout(timer));
      active.add(reading);
      void reading.then(
        () => active.delete(reading),
        () => active.delete(reading),
      );
      return reading;
    },
    release(): Promise<void> {
      return (retirement ??= (async () => {
        await Promise.allSettled([...active]);
        await release();
      })());
    },
  };
}
