import { lazy, type ComponentType } from "react";
import type { VoiceInputButtonProps } from "./VoiceInputButton";

const DisabledVoiceInputButton: ComponentType<VoiceInputButtonProps> =
  function DisabledVoiceInputButton(_props) {
    return null;
  };

export const LazyVoiceInputButton = lazy<ComponentType<VoiceInputButtonProps>>(async () => {
  if (import.meta.env.VITE_LIGHTCODE_BUILD_TARGET === "mobile") {
    return { default: DisabledVoiceInputButton };
  }
  const module = await import("./VoiceInputButton");
  return { default: module.VoiceInputButton };
});
