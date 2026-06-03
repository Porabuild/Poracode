export const chatMessageSurfaceClass = "w-full rounded-3xl px-3 py-2";

/**
 * Surface for user-authored rows (the user message and the question/answer
 * prompt). A hairline border delineates them from transparent agent rows in
 * low-elevation themes where the tertiary fill alone is too subtle.
 */
export const chatPromptSurfaceClass = `${chatMessageSurfaceClass} relative border border-[var(--hairline)]`;
