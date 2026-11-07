import type { ReactNode } from "react";
import { AudioLines, Mic, MicOff, Volume2, VolumeX, X } from "lucide-react";
import { Tooltip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Button, PixelLoader } from "@/renderer/components/common";
import { liveVoice, useLiveVoice } from "@/renderer/speech/liveVoice";

export function LiveVoiceButton(props: {
  scopeId: string;
  onStart: () => void;
  isDisabled?: boolean;
}) {
  const { t } = useLingui();
  const state = useLiveVoice();
  const active = state.threadId === props.scopeId || state.scopeId === props.scopeId;
  const connecting = active && state.phase === "connecting";
  const label = connecting
    ? t`Cancel voice connection`
    : active
      ? t`End voice chat`
      : t`Start live voice`;
  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>
        <Button
          isIconOnly
          size="sm"
          aria-label={label}
          className="poracode-composer-send"
          isDisabled={!active && props.isDisabled === true}
          onPress={() => {
            if (active) liveVoice.stopScope(props.scopeId);
            else props.onStart();
          }}
        >
          {connecting ? (
            <PixelLoader size="xs" />
          ) : active ? (
            <X className="size-4" />
          ) : (
            <AudioLines className="size-4" />
          )}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}

/**
 * The thread's voice session lives in the composer toolbar, in the dictation
 * slot: speaker and microphone toggles, then hang-up as the primary action
 * while the prompt is empty. A typed draft keeps the send button primary.
 */
export function LiveVoiceSessionControls(props: { threadId: string; hasDraft: boolean }) {
  const { t } = useLingui();
  const state = useLiveVoice();
  if (state.threadId !== props.threadId || state.phase === "idle") return null;
  const connecting = state.phase === "connecting";
  const endLabel = connecting ? t`Cancel voice connection` : t`End voice chat`;
  return (
    <div data-live-voice="" className="flex shrink-0 items-center gap-1">
      <span role="status" className="sr-only">
        {connecting ? t`Connecting voice…` : state.muted ? t`Microphone muted` : t`Live voice`}
      </span>
      <VoiceToggle
        label={state.speakerMuted ? t`Unmute voice replies` : t`Mute voice replies`}
        pressed={state.speakerMuted}
        onPress={() => liveVoice.toggleSpeakerMuted(props.threadId)}
      >
        {state.speakerMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </VoiceToggle>
      <VoiceToggle
        label={state.muted ? t`Unmute microphone` : t`Mute microphone`}
        pressed={state.muted}
        onPress={() => liveVoice.toggleMuted(props.threadId)}
      >
        {state.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
      </VoiceToggle>
      <Tooltip delay={0}>
        <Tooltip.Trigger>
          <Button
            isIconOnly
            size="sm"
            aria-label={endLabel}
            className={
              props.hasDraft ? "poracode-composer-menu min-w-9 px-2" : "poracode-composer-send"
            }
            {...(props.hasDraft ? { variant: "ghost" as const } : {})}
            onPress={() => liveVoice.stopThread(props.threadId)}
          >
            {connecting ? <PixelLoader size="xs" /> : <X className="size-4" />}
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>{endLabel}</Tooltip.Content>
      </Tooltip>
    </div>
  );
}

function VoiceToggle(props: {
  label: string;
  pressed: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip delay={300}>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label={props.label}
        aria-pressed={props.pressed}
        className="poracode-composer-menu min-w-9 px-2"
        onPress={props.onPress}
      >
        {props.children}
      </Button>
      <Tooltip.Content placement="top">{props.label}</Tooltip.Content>
    </Tooltip>
  );
}
