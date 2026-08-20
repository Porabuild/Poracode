import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ColorArea,
  ColorField,
  ColorPicker,
  ColorSlider,
  ColorSwatch,
  parseColor,
  type Color,
} from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
import { projectIconImageUrl } from "@/renderer/components/common/ProjectIcon";
import {
  customProjectIconColorHex,
  formatCustomProjectIconColor,
  isCustomProjectIconColor,
  PROJECT_ICON_COLORS,
} from "@/renderer/utils/projectIconColors";

/** Fallback for the custom picker when the project has no custom colour yet. */
const CUSTOM_COLOR_SEED = "#5f6cd9";

/**
 * Colour changes are committed while dragging, so the write is trailed: a drag
 * across the colour area would otherwise store (and, for a mirrored project,
 * transmit) every intermediate frame.
 */
const COMMIT_DELAY_MS = 200;

/** Section heading inside the picker, matching the icon category headers. */
function SectionLabel(props: { children: string }) {
  return (
    <p className="px-1 pb-1 text-[10px] font-semibold tracking-wide text-muted uppercase">
      {props.children}
    </p>
  );
}

/**
 * The icon files found inside the project folder, as a grid matching the glyph
 * catalog below it. Ordered by the same priority the folder probe uses, so the
 * project's most canonical icon comes first.
 */
export function ProjectIconFileGrid(props: {
  project: Project;
  paths: readonly string[];
  /** Relative path currently stored on the project, when it uses a file icon. */
  selectedPath: string | undefined;
  onPick: (path: string) => void;
}) {
  const { t } = useLingui();
  return (
    <div className="mb-2">
      <SectionLabel>{t`From this project`}</SectionLabel>
      <div className="grid grid-cols-8 gap-1">
        {props.paths.map((path) => {
          const url = projectIconImageUrl(props.project, path);
          if (!url) return null;
          return (
            <FileIconCell
              key={path}
              path={path}
              url={url}
              selected={props.selectedPath === path}
              onPick={() => props.onPick(path)}
            />
          );
        })}
      </div>
    </div>
  );
}

function FileIconCell(props: { path: string; url: string; selected: boolean; onPick: () => void }) {
  // Read off the loaded image rather than the probe: the main process only
  // reports paths, and the pixel size is what tells a favicon from a logo.
  const [size, setSize] = useState<string | undefined>(undefined);
  // Native title for the same reason as the glyph grid (see ProjectIconGrid):
  // a tooltip trigger would add a focusable wrapper around every cell.
  const hoverText = [props.path, size].filter(Boolean).join("\n");
  return (
    <button
      type="button"
      className={`flex size-8 items-center justify-center rounded-md outline-none transition-colors focus-visible:focus-ring ${
        props.selected ? "bg-accent/20 ring-1 ring-accent" : "hover:bg-[var(--row-active)]"
      }`}
      title={hoverText}
      aria-label={props.path}
      aria-pressed={props.selected}
      onClick={props.onPick}
    >
      <img
        src={props.url}
        alt=""
        draggable={false}
        className="size-5 rounded-[3px] object-contain"
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (naturalWidth > 0) setSize(`${naturalWidth} × ${naturalHeight}`);
        }}
      />
    </button>
  );
}

/**
 * Tints for the selected glyph. Only shown for bundled glyphs — images keep
 * their own colours.
 */
export function ProjectIconColorRow(props: {
  selectedColor: string | undefined;
  onPick: (colorId: string | undefined) => void;
}) {
  const { t } = useLingui();
  const swatchClass = (selected: boolean) =>
    `size-6 rounded-full border outline-none transition-colors focus-visible:focus-ring ${
      selected ? "border-foreground" : "border-border hover:border-muted"
    }`;
  return (
    <div className="mb-2">
      <SectionLabel>{t`Icon color`}</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        <PresetSwatch
          label={t`Default`}
          selected={!props.selectedColor}
          onPick={() => props.onPick(undefined)}
          className={`${swatchClass(!props.selectedColor)} flex items-center justify-center`}
        >
          <span className="size-3.5 rounded-full bg-muted" />
        </PresetSwatch>
        {PROJECT_ICON_COLORS.map((color) => (
          <PresetSwatch
            key={color.id}
            label={t(color.label)}
            selected={props.selectedColor === color.id}
            onPick={() => props.onPick(color.id)}
            className={swatchClass(props.selectedColor === color.id)}
            style={{ backgroundColor: color.cssValue }}
          />
        ))}
        <CustomColorSwatch
          selectedColor={props.selectedColor}
          className={swatchClass(isCustomProjectIconColor(props.selectedColor))}
          onPick={props.onPick}
        />
      </div>
    </div>
  );
}

function PresetSwatch(props: {
  label: string;
  selected: boolean;
  onPick: () => void;
  className: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const { t } = useLingui();
  const label = props.label;
  return (
    <button
      type="button"
      className={props.className}
      title={label}
      aria-label={t`Icon color: ${label}`}
      aria-pressed={props.selected}
      onClick={props.onPick}
      {...(props.style ? { style: props.style } : {})}
    >
      {props.children}
    </button>
  );
}

/**
 * Anything outside the preset hues. The HeroUI picker opens in its own popover
 * on top of the icon menu, and the chosen value is stored as hex.
 */
function CustomColorSwatch(props: {
  selectedColor: string | undefined;
  className: string;
  onPick: (colorId: string) => void;
}) {
  const { t } = useLingui();
  const stored = customProjectIconColorHex(props.selectedColor);
  const [draft, setDraft] = useState<Color>(() => parseColor(stored ?? CUSTOM_COLOR_SEED));
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow the project when the colour changes elsewhere (another preset, a
  // different glyph) so reopening the picker starts from what is applied.
  useEffect(() => {
    if (stored) setDraft(parseColor(stored));
  }, [stored]);

  useEffect(
    () => () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    },
    [],
  );

  const commit = (color: Color) => {
    setDraft(color);
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      commitTimer.current = null;
      props.onPick(formatCustomProjectIconColor(color.toString("hex")));
    }, COMMIT_DELAY_MS);
  };

  return (
    <ColorPicker value={draft} onChange={commit}>
      <ColorPicker.Trigger
        aria-label={t`Custom color`}
        className={`${props.className} bg-[conic-gradient(from_180deg,var(--project-icon-red),var(--project-icon-amber),var(--project-icon-green),var(--project-icon-blue),var(--project-icon-violet),var(--project-icon-red))]`}
        {...(stored ? { style: { backgroundColor: stored, backgroundImage: "none" } } : {})}
      />
      <ColorPicker.Popover className="gap-2">
        <ColorArea
          aria-label={t`Saturation and brightness`}
          className="max-w-full"
          colorSpace="hsb"
          xChannel="saturation"
          yChannel="brightness"
        >
          <ColorArea.Thumb />
        </ColorArea>
        <ColorSlider aria-label={t`Hue`} channel="hue" className="px-1" colorSpace="hsb">
          <ColorSlider.Track>
            <ColorSlider.Thumb />
          </ColorSlider.Track>
        </ColorSlider>
        <ColorField aria-label={t`Hex color`}>
          <ColorField.Group variant="secondary">
            <ColorField.Prefix>
              <ColorSwatch size="xs" />
            </ColorField.Prefix>
            <ColorField.Input />
          </ColorField.Group>
        </ColorField>
      </ColorPicker.Popover>
    </ColorPicker>
  );
}
