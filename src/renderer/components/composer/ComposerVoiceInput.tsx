import { Suspense, type RefObject } from "react";
import { LazyVoiceInputButton } from "./LazyVoiceInputButton";
import type { MentionInputHandle } from "./MentionInput";
import type { VoiceInputHandle } from "./VoiceInputButton";

interface ComposerVoiceInputProps {
  /** Whether the voice button should render at all (settings + session gate). */
  show: boolean;
  isDisabled: boolean;
  mentionRef: RefObject<MentionInputHandle | null>;
  /**
   * Forwarded to the underlying button so keyboard callers (the dictation
   * shortcut) can toggle recording via {@link VoiceInputHandle.toggle}.
   */
  voiceInputRef?: RefObject<VoiceInputHandle | null>;
}

/**
 * Shared wiring for the composer's voice-input button: gates on {@link show},
 * lazy-loads the (desktop-only) button behind Suspense, and routes its
 * transcript callbacks into the mention input. Both the draft and thread
 * composers render this rather than repeating the plumbing.
 */
export function ComposerVoiceInput({
  show,
  isDisabled,
  mentionRef,
  voiceInputRef,
}: ComposerVoiceInputProps) {
  if (!show) return null;
  return (
    <Suspense fallback={null}>
      <LazyVoiceInputButton
        ref={voiceInputRef}
        isDisabled={isDisabled}
        onTranscript={(text) => mentionRef.current?.commitVoiceTranscript(text)}
        onTranscriptPreview={(text) => mentionRef.current?.previewVoiceTranscript(text)}
        onTranscriptCancel={() => mentionRef.current?.clearVoiceTranscriptPreview()}
      />
    </Suspense>
  );
}
