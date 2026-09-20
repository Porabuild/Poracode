import { lazy } from "react";

export const LazyVoiceInputButton = lazy(async () => {
  const module = await import("./VoiceInputButton");
  return { default: module.VoiceInputButton };
});
