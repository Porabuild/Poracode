import { useEffect, useId, useState } from "react";
import { Button, Modal, NumberField, Slider, Tooltip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { BarChart3, Code2, Maximize2, RotateCcw, Shrink, ZoomIn, ZoomOut } from "lucide-react";
import {
  NATIVE_VISUAL_FORMAT_VERSION,
  NATIVE_VISUAL_V2_FORMAT_VERSION,
  nativeVisualInputValue,
  parseNativeVisual,
  type NativeVisualInput,
  type NativeVisualSpec,
} from "@/shared/nativeVisuals";
import type { NativeVisualV2Spec } from "@/shared/nativeVisualsV2";
import { useNativeVisualOwner } from "@/renderer/state/nativeVisualOwner";
import { nativeVisualUiKey, useNativeVisualUiStore } from "@/renderer/state/nativeVisualUiStore";
import { VisualSource } from "./VisualSource";
import { CopyTextButton } from "./CopyTextButton";
import { NativeVisualBlocks, type NativeVisualInteractions } from "./NativeVisualBlocks";
import { NativeVisualViewport } from "./NativeVisualViewport";

type NativeVisualDocument = NativeVisualSpec | NativeVisualV2Spec;
const ACCENT_CLASSES = {
  app: "[--native-visual-accent:var(--accent)]",
  success: "[--native-visual-accent:var(--success)]",
  warning: "[--native-visual-accent:var(--warning)]",
  danger: "[--native-visual-accent:var(--danger)]",
} as const;

interface NativeVisualProps {
  source: string;
  title: string;
  version: number;
  complete: boolean;
  isStreaming: boolean;
  threadId: string;
  itemId: string;
  ordinal: number;
  limited: boolean;
}

export function NativeVisual(props: NativeVisualProps) {
  const { t } = useLingui();
  const label = props.title || t`Visual`;
  const parsed =
    !props.isStreaming && props.complete && !props.limited
      ? props.version === NATIVE_VISUAL_FORMAT_VERSION
        ? parseNativeVisual(props.source)
        : props.version === NATIVE_VISUAL_V2_FORMAT_VERSION
          ? parseNativeVisual(props.source, NATIVE_VISUAL_V2_FORMAT_VERSION)
          : undefined
      : undefined;
  if (parsed?.ok) return <NativeVisualContent {...props} label={label} spec={parsed.spec} />;
  const reason = props.isStreaming
    ? t`Receiving visual source…`
    : !props.complete
      ? t`Incomplete visual block. Showing source only.`
      : props.limited
        ? t`Too many visuals in this message. Showing source only.`
        : props.version !== NATIVE_VISUAL_FORMAT_VERSION &&
            props.version !== NATIVE_VISUAL_V2_FORMAT_VERSION
          ? t`Unsupported visual format. Showing source only.`
          : parsed?.reason === "too-large"
            ? t`This visual is too large. Showing source only.`
            : t`Invalid visual specification. Showing source only.`;
  return (
    <div
      data-poracode-native-source="true"
      className="not-prose my-2 min-w-0 overflow-hidden rounded-[1rem] border border-[var(--hairline)] bg-surface/50"
    >
      <div className="flex min-h-10 items-center gap-2 border-b border-border px-3 py-1">
        <Code2 className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
        <span title={label} className="min-w-0 flex-1 truncate text-xs font-medium">
          {label}
        </span>
        <CopyTextButton text={props.source} label={t`Copy source`} />
      </div>
      <p role="status" className="border-b border-border px-3 py-2 text-xs text-muted">
        {reason}
      </p>
      <div className="max-h-[70vh] overflow-auto p-3">
        <VisualSource text={props.source} lang="json" isStreaming={props.isStreaming} />
      </div>
    </div>
  );
}

function NativeVisualContent(
  props: NativeVisualProps & { label: string; spec: NativeVisualDocument },
) {
  const owner = useNativeVisualOwner(props.threadId);
  const key = nativeVisualUiKey(
    owner.hostId,
    owner.threadId,
    props.itemId,
    props.ordinal,
    props.source,
  );
  return (
    <NativeVisualSurface
      key={key}
      {...props}
      stateKey={key}
      hostId={owner.hostId}
      canonicalThreadId={owner.threadId}
    />
  );
}

function NativeVisualSurface({
  source,
  label,
  spec,
  stateKey,
  hostId,
  canonicalThreadId,
}: NativeVisualProps & {
  label: string;
  spec: NativeVisualDocument;
  stateKey: string;
  hostId: string | undefined;
  canonicalThreadId: string;
}) {
  const { t } = useLingui();
  const [showSource, setShowSource] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const entry = useNativeVisualUiStore((state) => state.entries.get(stateKey));
  const [fitToWidth, setFitToWidth] = useState(() => (entry?.zoom ?? 100) === 100);
  useEffect(() => useNativeVisualUiStore.getState().touch(stateKey), [stateKey]);
  const storedInputs = new Map(entry?.inputs);
  const inputs = new Map(
    spec.inputs.map((input) => [
      input.id,
      nativeVisualInputValue(input, storedInputs.get(input.id)),
    ]),
  );
  const zoom = entry?.zoom ?? 100;
  const canZoom =
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("zoom", "1.25");
  function save(
    nextInputs?: ReadonlyMap<string, number>,
    nextZoom?: number,
    patch: NativeVisualInteractions = {},
  ) {
    const current = useNativeVisualUiStore.getState().entries.get(stateKey);
    useNativeVisualUiStore.getState().put(stateKey, {
      ...current,
      ...(hostId ? { hostId } : {}),
      threadId: canonicalThreadId,
      inputs: nextInputs ? [...nextInputs] : (current?.inputs ?? [...inputs]),
      zoom: nextZoom ?? current?.zoom ?? zoom,
      ...patch,
    });
  }
  function changeInput(input: NativeVisualInput, raw: number) {
    if (!Number.isFinite(raw)) return;
    const steps = Math.max(
      0,
      Math.min(
        Math.floor((input.max - input.min) / input.step + 1e-6),
        Math.round((raw - input.min) / input.step),
      ),
    );
    const value = nativeVisualInputValue(
      input,
      Math.min(input.max, input.min + steps * input.step),
    );
    if (inputs.get(input.id) !== value) save(new Map(inputs).set(input.id, value));
  }
  function toolbar() {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-0.5">
        <Button size="sm" variant="ghost" onPress={() => setShowSource(!showSource)}>
          <Code2 className="size-3.5" aria-hidden="true" />
          {showSource ? t`Preview` : t`Source`}
        </Button>
        {!showSource ? (
          <>
            {canZoom ? (
              <>
                <Tooltip delay={300}>
                  <Button
                    size="sm"
                    variant="ghost"
                    isIconOnly
                    aria-label={t`Zoom out`}
                    isDisabled={zoom <= 75}
                    onPress={() => {
                      setFitToWidth(false);
                      save(undefined, zoom - 25);
                    }}
                  >
                    <ZoomOut className="size-3.5" />
                  </Button>
                  <Tooltip.Content>{t`Zoom out`}</Tooltip.Content>
                </Tooltip>
                <Tooltip delay={300}>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t`Reset zoom`}
                    onPress={() => {
                      setFitToWidth(true);
                      save(undefined, 100);
                    }}
                    className="min-w-12 tabular-nums"
                  >
                    {fitToWidth ? t`Fit` : `${zoom}%`}
                  </Button>
                  <Tooltip.Content>{t`Reset zoom`}</Tooltip.Content>
                </Tooltip>
                <Tooltip delay={300}>
                  <Button
                    size="sm"
                    variant="ghost"
                    isIconOnly
                    aria-label={t`Zoom in`}
                    isDisabled={zoom >= 200}
                    onPress={() => {
                      setFitToWidth(false);
                      save(undefined, zoom + 25);
                    }}
                  >
                    <ZoomIn className="size-3.5" />
                  </Button>
                  <Tooltip.Content>{t`Zoom in`}</Tooltip.Content>
                </Tooltip>
                <Tooltip delay={300}>
                  <Button
                    size="sm"
                    variant="ghost"
                    isIconOnly
                    aria-label={t`Fit to width`}
                    aria-pressed={fitToWidth}
                    onPress={() => {
                      save(undefined, 100);
                      setFitToWidth(true);
                    }}
                  >
                    <Shrink className="size-3.5" />
                  </Button>
                  <Tooltip.Content>{t`Fit to width`}</Tooltip.Content>
                </Tooltip>
              </>
            ) : null}
            {spec.inputs.length ? (
              <Tooltip delay={300}>
                <Button
                  size="sm"
                  variant="ghost"
                  isIconOnly
                  aria-label={t`Reset inputs`}
                  onPress={() => save(new Map(spec.inputs.map((input) => [input.id, input.value])))}
                >
                  <RotateCcw className="size-3.5" />
                </Button>
                <Tooltip.Content>{t`Reset inputs`}</Tooltip.Content>
              </Tooltip>
            ) : null}
          </>
        ) : null}
        <CopyTextButton text={source} label={t`Copy source`} />
      </div>
    );
  }
  function body(inDialog = false) {
    return showSource ? (
      <div className={`overflow-auto p-4 ${inDialog ? "" : "max-h-[70vh]"}`}>
        <VisualSource text={source} lang="json" />
      </div>
    ) : (
      <NativeVisualViewport
        zoom={canZoom ? zoom : 100}
        fitToWidth={canZoom && fitToWidth}
        label={label}
      >
        <div
          className={`space-y-5 p-3 @min-[480px]:p-4 ${ACCENT_CLASSES["accent" in spec && spec.accent ? spec.accent : "app"]}`}
        >
          {spec.description ? (
            <p className="text-sm leading-relaxed text-muted">{spec.description}</p>
          ) : null}
          {spec.inputs.length ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-4 rounded-[0.875rem] bg-surface-secondary/40 p-3">
              {spec.inputs.map((input) => (
                <NativeVisualInputControl
                  key={input.id}
                  input={input}
                  value={inputs.get(input.id)!}
                  onChange={(value) => changeInput(input, value)}
                />
              ))}
            </div>
          ) : null}
          <NativeVisualBlocks
            blocks={spec.blocks}
            inputs={inputs}
            entry={entry}
            title={label}
            {...("layout" in spec && spec.layout ? { layout: spec.layout } : {})}
            onChange={(patch) => save(undefined, undefined, patch)}
          />
        </div>
      </NativeVisualViewport>
    );
  }
  return (
    <div
      data-poracode-native-visual="true"
      className="not-prose @container my-2 min-w-0 overflow-hidden rounded-[1rem] border border-[var(--hairline)] bg-surface/50 text-foreground"
    >
      <div className="flex flex-wrap items-center gap-x-1 border-b border-[var(--hairline)] px-2 py-1 @min-[480px]:px-3">
        <div className="flex min-w-0 basis-full items-center gap-2 py-1.5 @min-[640px]:flex-1 @min-[640px]:basis-auto">
          <BarChart3 className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
          <span title={label} className="min-w-0 truncate text-xs font-medium">
            {label}
          </span>
        </div>
        {toolbar()}
        <Tooltip delay={300}>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            aria-label={t`Expand visual`}
            onPress={() => setExpanded(true)}
          >
            <Maximize2 className="size-3.5" />
          </Button>
          <Tooltip.Content>{t`Expand visual`}</Tooltip.Content>
        </Tooltip>
      </div>
      {body()}
      <Modal.Backdrop isOpen={expanded} onOpenChange={setExpanded}>
        <Modal.Container size="full" scroll="inside">
          <Modal.Dialog aria-label={label}>
            <Modal.CloseTrigger aria-label={t`Close expanded visual`} />
            <Modal.Header className="border-b border-border">
              <Modal.Heading>{label}</Modal.Heading>
              <div className="min-w-0">{toolbar()}</div>
            </Modal.Header>
            <Modal.Body className="@container min-w-0 p-0">{body(true)}</Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}

function NativeVisualInputControl({
  input,
  value,
  onChange,
}: {
  input: NativeVisualInput;
  value: number;
  onChange: (value: number) => void;
}) {
  const labelId = useId();
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 break-words text-xs font-medium">
          {input.label}
        </span>
        <NumberField
          aria-labelledby={labelId}
          minValue={input.min}
          maxValue={input.max}
          step={input.step}
          value={value}
          onChange={onChange}
          formatOptions={{ maximumSignificantDigits: 17 }}
          className="w-max min-w-40 shrink-0"
          variant="secondary"
        >
          {({ state }) => (
            <NumberField.Group className="w-max min-w-full">
              <NumberField.DecrementButton />
              <NumberField.Input
                size={Math.max(8, state.inputValue.length + 1)}
                style={{ fieldSizing: "content" }}
                className="min-w-20 px-1 text-center tabular-nums"
              />
              <NumberField.IncrementButton />
            </NumberField.Group>
          )}
        </NumberField>
      </div>
      <Slider
        aria-labelledby={labelId}
        formatOptions={{ maximumSignificantDigits: 17 }}
        minValue={input.min}
        maxValue={input.max}
        step={input.step}
        value={value}
        onChange={(next) => onChange(Array.isArray(next) ? next[0]! : next)}
      >
        <Slider.Track>
          <Slider.Fill />
          <Slider.Thumb aria-label={input.label} />
        </Slider.Track>
      </Slider>
    </div>
  );
}
