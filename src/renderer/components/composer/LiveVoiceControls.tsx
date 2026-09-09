import { AudioLines, Mic, MicOff, PhoneOff } from "lucide-react";
import { Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
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
          className="poracode-composer-send bg-success text-success-foreground"
          isDisabled={!active && props.isDisabled === true}
          onPress={() => {
            if (active) void liveVoice.stop();
            else props.onStart();
          }}
        >
          {connecting ? (
            <PixelLoader size="xs" />
          ) : active ? (
            <PhoneOff className="size-4" />
          ) : (
            <AudioLines className="size-4" />
          )}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}

export function LiveVoicePanel(props: { threadId: string }) {
  const { t } = useLingui();
  const state = useLiveVoice();
  if (state.threadId !== props.threadId || state.phase === "idle") return null;
  return (
    <div data-live-voice="" className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
      <AudioLines className="size-4 shrink-0 text-success" />
      <div className="min-w-0 flex-1 text-xs">
        <div role="status" className="text-muted">
          {state.phase === "connecting" ? (
            <Trans>Connecting voice…</Trans>
          ) : state.muted ? (
            <Trans>Microphone muted</Trans>
          ) : (
            <Trans>Live voice</Trans>
          )}
        </div>
        {state.userText ? <p className="line-clamp-1 text-muted">{state.userText}</p> : null}
        {state.assistantText ? <p className="line-clamp-2">{state.assistantText}</p> : null}
      </div>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label={state.muted ? t`Unmute microphone` : t`Mute microphone`}
        aria-pressed={state.muted}
        onPress={() => liveVoice.toggleMuted()}
      >
        {state.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
      </Button>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label={t`End voice chat`}
        onPress={() => {
          void liveVoice.stop();
        }}
      >
        <PhoneOff className="size-4" />
      </Button>
    </div>
  );
}
