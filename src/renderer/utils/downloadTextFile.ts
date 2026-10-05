/** Keep the object URL alive until Chromium starts the download. */
export function downloadTextFile(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
