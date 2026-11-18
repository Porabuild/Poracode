const messageLayout = "w-full px-3 py-2";
export const chatMessageSurfaceClass = `${messageLayout} rounded-3xl`;

/**
 * Surface for user-authored rows (the user message and the question/answer
 * prompt). Shares the compact content material with other in-flow rows.
 */
export const chatPromptSurfaceClass = `${messageLayout} content-surface-row relative`;
