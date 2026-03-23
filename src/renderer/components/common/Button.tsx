import { Button as HeroButton, type ButtonProps as HeroButtonProps } from "@heroui/react";

export type ButtonProps = HeroButtonProps;

export function Button(props: ButtonProps) {
  return <HeroButton {...props} />;
}
