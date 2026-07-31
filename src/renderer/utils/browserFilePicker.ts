export interface BrowserFilePickerOptions {
  readonly attachmentThreadId: string;
  readonly filters?: readonly { readonly extensions: readonly string[] }[];
  readonly upload: (input: {
    readonly threadId: string;
    readonly fileName: string;
    readonly data: Uint8Array;
  }) => Promise<string>;
}

export async function pickAndUploadBrowserFiles(
  options: BrowserFilePickerOptions,
): Promise<string[] | null> {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  const extensions = options.filters?.flatMap((filter) => filter.extensions) ?? [];
  if (extensions.length > 0) {
    input.accept = extensions.map((extension) => `.${extension.replace(/^\./, "")}`).join(",");
  }

  const files = await new Promise<File[]>((resolve) => {
    let settled = false;
    const finish = (selected: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(selected);
    };
    input.addEventListener("change", () => finish(Array.from(input.files ?? [])), { once: true });
    input.addEventListener("cancel", () => finish([]), { once: true });
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
