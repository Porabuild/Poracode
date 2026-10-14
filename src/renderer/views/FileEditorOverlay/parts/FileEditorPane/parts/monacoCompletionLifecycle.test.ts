// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";

type Completion = { items: { label: string }[]; isIncomplete?: boolean };
type Model = {
  uri: { toString: () => string };
  isDisposed: () => boolean;
  getWordUntilPosition: () => { startColumn: number; endColumn: number };
};
type Token = { isCancellationRequested: boolean };
type Worker = { doComplete: () => Promise<Completion> };
let Adapter: new (
  worker: () => Promise<Worker>,
  triggers: string[],
) => {
  provideCompletionItems(
    model: Model,
    position: { lineNumber: number; column: number },
    context: object,
    token: Token,
  ): Promise<unknown> | undefined;
};
beforeAll(async () => {
  const descriptor = Object.getOwnPropertyDescriptor(document, "queryCommandSupported");
  Object.defineProperty(document, "queryCommandSupported", {
    configurable: true,
    value: () => false,
  });
  try {
    // @ts-expect-error -- Exercise the pinned runtime's internal shared CSS/HTML/JSON adapter; it has no published declaration.
    const actual = await import("monaco-editor/languages/features/common/lspLanguageFeatures.js");
    Adapter = actual.CompletionAdapter;
  } finally {
    if (descriptor) Object.defineProperty(document, "queryCommandSupported", descriptor);
    else Reflect.deleteProperty(document, "queryCommandSupported");
  }
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture() {
  const state = { disposed: false };
  const token = { isCancellationRequested: false };
  const word = vi.fn<() => { startColumn: number; endColumn: number }>(() => {
    if (state.disposed) throw Error("TextModelPart is disposed!");
    return { startColumn: 1, endColumn: 3 };
  });
  const model = {
    uri: { toString: () => "file:///qualification.html" },
    isDisposed: () => state.disposed,
    getWordUntilPosition: word,
  };
  const call = (adapter: InstanceType<typeof Adapter>) =>
    adapter.provideCompletionItems(model, { lineNumber: 2, column: 3 }, {}, token);
  return { state, token, word, model, call };
}
describe("Monaco shared completion model lifetime", () => {
  it("preserves live completions and their replacement range", async () => {
    const f = fixture();
    const worker = vi.fn<() => Promise<Worker>>(async () => ({
      doComplete: async () => ({ items: [{ label: "class" }] }),
    }));
    await expect(f.call(new Adapter(worker, []))).resolves.toMatchObject({
      suggestions: [
        {
          label: "class",
          insertText: "class",
          range: { startLineNumber: 2, endLineNumber: 2, startColumn: 1, endColumn: 3 },
        },
      ],
    });
    expect(f.word).toHaveBeenCalledOnce();
  });
  it.each(["disposed", "cancelled"] as const)(
    "does not start a worker for an initially %s request",
    async (kind) => {
      const f = fixture();
      if (kind === "disposed") f.state.disposed = true;
      else f.token.isCancellationRequested = true;
      const worker = vi.fn<() => Promise<Worker>>(async () => ({
        doComplete: async () => ({ items: [] }),
      }));
      expect(await f.call(new Adapter(worker, []))).toBeUndefined();
      expect(worker).not.toHaveBeenCalled();
      expect(f.word).not.toHaveBeenCalled();
    },
  );
  it.each(["disposed", "cancelled"] as const)(
    "does not dispatch completion after becoming %s while acquiring a worker",
    async (kind) => {
      const f = fixture(),
        ready = deferred<Worker>();
      const complete = vi.fn<Worker["doComplete"]>(async () => ({ items: [] }));
      const request = f.call(new Adapter(() => ready.promise, []));
      if (kind === "disposed") f.state.disposed = true;
      else f.token.isCancellationRequested = true;
      ready.resolve({ doComplete: complete });
      await expect(Promise.resolve(request)).resolves.toBeUndefined();
      expect(complete).not.toHaveBeenCalled();
      expect(f.word).not.toHaveBeenCalled();
    },
  );
  it.each(["disposed", "cancelled"] as const)(
    "discards a completion delivered after the request becomes %s",
    async (kind) => {
      const f = fixture(),
        completion = deferred<Completion>(),
        started = deferred<void>();
      const request = f.call(
        new Adapter(
          async () => ({
            doComplete: () => {
              started.resolve();
              return completion.promise;
            },
          }),
          [],
        ),
      );
      await started.promise;
      if (kind === "disposed") f.state.disposed = true;
      else f.token.isCancellationRequested = true;
      completion.resolve({ items: [{ label: "class" }] });
      await expect(Promise.resolve(request)).resolves.toBeUndefined();
      expect(f.word).not.toHaveBeenCalled();
    },
  );
  it("keeps genuine live worker failures visible", async () => {
    const f = fixture(),
      failure = Error("language worker failed");
    await expect(
      f.call(
        new Adapter(
          async () => ({
            doComplete: async () => {
              throw failure;
            },
          }),
          [],
        ),
      ),
    ).rejects.toBe(failure);
  });
});
