import type { CSSProperties } from "react";

export const CHAT_FONT_SIZE_VAR = "--lc-chat-font-size";
export const CHAT_FONT_SIZE_COMMAND_VAR = "--lc-chat-font-size-command";
export const CHAT_FONT_SIZE_META_VAR = "--lc-chat-font-size-meta";

/** Clamps the raw **Settings → GUI chat** value into the supported 8..20px range. */
export function guiChatBaseFontPx(guiChatFontSize: number): number {
  return Math.min(20, Math.max(8, Math.round(guiChatFontSize)));
}

/**
 * Resolved `--lc-chat-font-size-command` px for a raw settings value. Shared so
 * layout math that has to predict command-row geometry without measuring the
 * DOM stays in lockstep with the variable the rows actually render at.
 */
export function guiChatCommandFontPx(guiChatFontSize: number): number {
  return Math.max(8, guiChatBaseFontPx(guiChatFontSize) - 1);
}

/** Maps **Settings → GUI chat** base px into CSS variables (+ command −1px, meta −2px; floor 8px). */
export function guiChatFontCssVars(guiChatFontSize: number): CSSProperties {
  const base = guiChatBaseFontPx(guiChatFontSize);
  return {
    [CHAT_FONT_SIZE_VAR]: `${base}px`,
    [CHAT_FONT_SIZE_COMMAND_VAR]: `${guiChatCommandFontPx(guiChatFontSize)}px`,
    [CHAT_FONT_SIZE_META_VAR]: `${Math.max(8, base - 2)}px`,
  } as CSSProperties;
}
