import {
  Separator as HeroSeparator,
  type SeparatorProps as HeroSeparatorProps,
} from "@heroui/react";

export type SeparatorProps = HeroSeparatorProps;

export function Separator(props: SeparatorProps) {
  return <HeroSeparator {...props} />;
}
