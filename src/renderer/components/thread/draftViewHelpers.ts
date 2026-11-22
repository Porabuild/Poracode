import { useLayoutEffect, useRef } from "react";
import type { ProjectDraftConfig, ProviderDraftConfig } from "@/shared/contracts";
import type { ThreadCrewBinding } from "@/shared/crew";

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function withoutDraftCrew(config: ProviderDraftConfig): ProviderDraftConfig {
  const { crew: _crew, ...providerConfig } = config;
  return providerConfig;
}

export function projectDraftWithCrew(
  config: ProjectDraftConfig,
  crew: ThreadCrewBinding | null | undefined,
  explicitlyCleared: boolean,
): ProjectDraftConfig {
  const { crew: _previousCrew, ...draft } = config;
  if (crew) return { ...draft, crew };
  return explicitlyCleared ? { ...draft, crew: null } : draft;
}

/** Minimum gap kept above the composer once it can no longer stay centered. */
const COMPOSER_ANCHOR_MIN_TOP = 8;

/**
 * Keeps the centered draft composer visually *stable* instead of re-centering on
 * every height change. The composer starts vertically centered, then the top
 * edge of the input is locked to that initial line: typing extra rows grows the
 * box downward (top stays put), while rows that appear above the input (slash
 * command panel, attachments, docks) grow the box upward (the input + toolbar
 * stay put).
 */
export function useStableComposerAnchor(enabled: boolean) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const blockRef = useRef<HTMLDivElement | null>(null);
  const spacerRef = useRef<HTMLDivElement | null>(null);
  const anchorRatioRef = useRef<number | null>(null);
  const activeBindingRef = useRef<{
    container: HTMLDivElement;
    block: HTMLDivElement;
    spacer: HTMLDivElement;
    observer: ResizeObserver;
  } | null>(null);

  useLayoutEffect(() => {
    if (!enabled) {
      anchorRatioRef.current = null;
    }
    const container = enabled ? containerRef.current : null;
    const block = enabled ? blockRef.current : null;
    const spacer = enabled ? spacerRef.current : null;
    const active = activeBindingRef.current;

    if (!container || !block || !spacer) {
      if (active) {
        active.observer.disconnect();
        activeBindingRef.current = null;
      }
      return;
    }
    if (
      active &&
      active.container === container &&
      active.block === block &&
      active.spacer === spacer
    ) {
      return;
    }

    active?.observer.disconnect();
    activeBindingRef.current = null;

    const apply = () => {
      const height = container.clientHeight;
      if (height <= 0) return;
      const containerTop = container.getBoundingClientRect().top;
      const blockTop = block.getBoundingClientRect().top;
      const inputEl = block.querySelector<HTMLElement>("[data-composer-input-anchor]");
      const inputTop = (inputEl ?? block).getBoundingClientRect().top;
      const aboveInput = inputTop - blockTop;
      const blockHeight = block.offsetHeight;
      const currentInputOffset = inputTop - containerTop;
      const currentSpacer = spacer.offsetHeight;

      const centeredInputOffset = (height - blockHeight) / 2 + aboveInput;
      const centeredRatio = clampNumber(centeredInputOffset / height, 0, 1);
      if (
        anchorRatioRef.current === null &&
        currentSpacer + (centeredInputOffset - currentInputOffset) > COMPOSER_ANCHOR_MIN_TOP
      ) {
        anchorRatioRef.current = centeredRatio;
      }

      const desiredInputOffset = Math.round((anchorRatioRef.current ?? centeredRatio) * height);
      const styles = getComputedStyle(container);
      const verticalPadding =
        (Number.parseFloat(styles.paddingTop) || 0) +
        (Number.parseFloat(styles.paddingBottom) || 0);
      const maxSpacer = Math.max(COMPOSER_ANCHOR_MIN_TOP, height - verticalPadding - blockHeight);
      const nextSpacer = Math.round(
        clampNumber(
          currentSpacer + (desiredInputOffset - currentInputOffset),
          COMPOSER_ANCHOR_MIN_TOP,
          maxSpacer,
        ),
      );
      if (Math.abs(nextSpacer - currentSpacer) >= 1) {
        spacer.style.height = `${nextSpacer}px`;
      }
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(container);
    observer.observe(block);
    activeBindingRef.current = { container, block, spacer, observer };
  });

  useLayoutEffect(() => {
    return () => {
      activeBindingRef.current?.observer.disconnect();
      activeBindingRef.current = null;
    };
  }, []);

  return { containerRef, blockRef, spacerRef };
}
