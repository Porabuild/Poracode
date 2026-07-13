import { forwardRef, lazy } from "react";
import type { VoiceInputButtonProps, VoiceInputHandle } from "./VoiceInputButton";

const DisabledVoiceInputButton = forwardRef<VoiceInputHandle, VoiceInputButtonProps>(
  function DisabledVoiceInputButton(_props, _ref) {
    return null;
  },
);

export const LazyVoiceInputButton = lazy(async () => {
  if (import.meta.env.VITE_PORACODE_BUILD_TARGET === "mobile") {
    return { default: DisabledVoiceInputButton };
  }
  const module = await import("./VoiceInputButton");
  return { default: module.VoiceInputButton };
});
