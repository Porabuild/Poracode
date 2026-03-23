import { Chip as HeroChip, type ChipProps as HeroChipProps } from "@heroui/react";

export type ChipProps = HeroChipProps;

export function Chip(props: ChipProps) {
  return <HeroChip {...props} />;
}
