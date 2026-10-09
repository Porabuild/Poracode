export interface BrowserFilePickerOptions {
  readonly attachmentThreadId: string;
  readonly filters?: readonly { readonly extensions: readonly string[] }[];
  readonly upload: (input: {
    readonly threadId: string;
    readonly fileName: string;
    readonly data: Uint8Array;
  }) => Promise<string>;
}

/** Delay after the window regains focus before a picker with no files counts as cancelled. */
export const PICKER_CANCEL_FALLBACK_MS = 1000;

export async function pickAndUploadBrowserFiles(
  options: BrowserFilePickerOptions,
): Promise<string[] | null> {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.hidden = true;
  const extensions = options.filters?.flatMap((filter) => filter.extensions) ?? [];
  if (extensions.length > 0) {
    input.accept = extensions.map((extension) => `.${extension.replace(/^\./, "")}`).join(",");
  }

  const files = await new Promise<File[]>((resolve) => {
    let settled = false;
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (selected: File[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(focusTimer);
      window.removeEventListener("focus", handleWindowFocus);
      input.remove();
      resolve(selected);
    };
    // Browsers without the input `cancel` event only signal a dismissed picker
    // by refocusing the window. Give a real selection time to deliver `change`
    // (its files are already populated by then) before treating it as cancel.
    function handleWindowFocus() {
      clearTimeout(focusTimer);
      focusTimer = setTimeout(() => {
        if ((input.files?.length ?? 0) === 0) finish([]);
      }, PICKER_CANCEL_FALLBACK_MS);
    }
    input.addEventListener("change", () => finish(Array.from(input.files ?? [])), { once: true });
    input.addEventListener("cancel", () => finish([]), { once: true });
    window.addEventListener("focus", handleWindowFocus);
    document.body.append(input);
    input.click();
  });
  if (files.length === 0) return null;

  return Promise.all(
    files.map(async (file) =>
      options.upload({
        threadId: options.attachmentThreadId,
        fileName: file.name,
        data: new Uint8Array(await file.arrayBuffer()),
      }),
    ),
  );
}
